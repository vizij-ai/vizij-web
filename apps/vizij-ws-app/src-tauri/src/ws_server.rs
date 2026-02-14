//! WebSocket server implementation of AroraConnection.
//!
//! This module provides a WebSocket-based implementation of the AroraConnection
//! trait, wrapping `arora_websocket::AroraWSServer` and integrating with Tauri's
//! event system.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use arora_websocket::{AroraWSServer, ServerConfig};
use log::{debug, info, warn};
use serde::Serialize;
use std::sync::mpsc::{channel, Sender};
use tauri::{AppHandle, Emitter};

use crate::connection::{
    AroraConnection, AroraConnectionTauriExt, CancellationToken, GetSlotValuesHandler,
    InvokeResult, MethodHandler, MethodInfo, SetSlotValuesHandler, SlotInfo, Value,
};

/// WebSocket implementation of AroraConnection.
///
/// Wraps `arora_websocket::AroraWSServer` and provides integration with
/// Tauri's event system for frontend communication.
pub struct WsServer {
    server: Arc<AroraWSServer>,
    /// Pending GetSlotValues responses keyed by request ID.
    pending_slot_value_requests: Arc<Mutex<HashMap<String, Sender<HashMap<String, Value>>>>>,
    /// Monotonic counter used to generate request IDs.
    next_request_id: Arc<AtomicU64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct GetSlotValuesRequestPayload {
    request_id: String,
    slots: Vec<String>,
}

impl WsServer {
    /// Create a new WebSocket server on the specified port.
    pub fn new(port: u16) -> Self {
        let config = ServerConfig::with_port(port).validate_paths(true);
        Self {
            server: Arc::new(AroraWSServer::new(config)),
            pending_slot_value_requests: Arc::new(Mutex::new(HashMap::new())),
            next_request_id: Arc::new(AtomicU64::new(1)),
        }
    }

    pub fn respond_slot_values_with_id(&self, request_id: &str, values: HashMap<String, Value>) {
        let mut guard = self.pending_slot_value_requests.lock().unwrap();
        if let Some(tx) = guard.remove(request_id) {
            if tx.send(values).is_err() {
                warn!(
                    "Failed to send slot values response for request {} - receiver dropped",
                    request_id
                );
            }
        } else {
            warn!(
                "respond_slot_values_with_id called for unknown request ID: {}",
                request_id
            );
        }
    }
}

impl AroraConnection for WsServer {
    fn set_slots(
        &self,
        slots: Vec<SlotInfo>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server.registry().set_slots(slots).await;
        })
    }

    fn set_set_slot_values_handler(
        &self,
        handler: SetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server
                .set_set_slot_values_handler(move |values| handler(values))
                .await;
        })
    }

    fn set_get_slot_values_handler(
        &self,
        handler: GetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server
                .set_get_slot_values_handler(move |slots| handler(slots))
                .await;
        })
    }

    fn register_method(
        &self,
        info: MethodInfo,
        handler: MethodHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server
                .registry()
                .register_method_fn(info, move |args| handler(args))
                .await;
        })
    }

    fn respond_slot_values(&self, values: HashMap<String, Value>) {
        // Fallback path for callers that don't pass a request ID.
        // This keeps compatibility while warning when routing is ambiguous.
        let request_id = {
            let guard = self.pending_slot_value_requests.lock().unwrap();
            if guard.len() > 1 {
                warn!(
                    "respond_slot_values called without request ID while {} requests are pending",
                    guard.len()
                );
            }
            guard.keys().next().cloned()
        };

        if let Some(request_id) = request_id {
            self.respond_slot_values_with_id(&request_id, values);
        } else {
            warn!("respond_slot_values called but no pending request");
        }
    }

    fn run(
        &self,
        cancel_token: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
        Box::pin(async move { self.server.run(cancel_token).await })
    }

    fn is_running(&self) -> Pin<Box<dyn Future<Output = bool> + Send + '_>> {
        Box::pin(async move { self.server.is_running().await })
    }

    fn connection_id(&self) -> String {
        format!("ws://127.0.0.1:{}", self.server.port())
    }
}

impl AroraConnectionTauriExt for WsServer {
    fn setup_tauri_integration(
        &self,
        app_handle: AppHandle,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        let pending_requests = self.pending_slot_value_requests.clone();
        let next_request_id = self.next_request_id.clone();

        Box::pin(async move {
            // Handler for SetSlotValues: emit to frontend
            let app = app_handle.clone();
            let set_handler: SetSlotValuesHandler = Arc::new(move |values| {
                match app.emit("update-values", &values) {
                    Ok(()) => Ok(()),
                    Err(e) => Err(format!("Failed to emit: {}", e)),
                }
            });
            self.set_set_slot_values_handler(set_handler).await;

            // Handler for GetSlotValues: request from frontend via event/command pattern
            let app = app_handle.clone();
            let pending_requests_clone = pending_requests.clone();
            let next_request_id_clone = next_request_id.clone();
            let get_handler: GetSlotValuesHandler = Arc::new(move |slots| {
                debug!("GetSlotValues request for {} slots", slots.len());

                // Create a channel for the response
                let (tx, rx) = channel();
                let request_id = format!(
                    "get-slot-values-{}",
                    next_request_id_clone.fetch_add(1, Ordering::Relaxed)
                );

                // Store sender keyed by request ID so concurrent requests are safe.
                {
                    let mut guard = pending_requests_clone.lock().unwrap();
                    guard.insert(request_id.clone(), tx);
                }

                let payload = GetSlotValuesRequestPayload { request_id, slots };

                // Emit event to frontend with request ID and requested slots.
                if let Err(e) = app.emit("get-slot-values-request", &payload) {
                    warn!("Failed to emit get-slot-values-request: {}", e);

                    // Clean up pending entry since no response can arrive.
                    let mut guard = pending_requests_clone.lock().unwrap();
                    guard.remove(&payload.request_id);
                    return HashMap::new();
                }

                // Wait for response with timeout
                match rx.recv_timeout(Duration::from_secs(5)) {
                    Ok(values) => {
                        debug!("Received {} slot values from frontend", values.len());
                        values
                    }
                    Err(e) => {
                        // Clean up pending entry on timeout/error.
                        let mut guard = pending_requests_clone.lock().unwrap();
                        guard.remove(&payload.request_id);
                        warn!(
                            "Timeout or error waiting for slot values for request {}: {}",
                            payload.request_id, e
                        );
                        HashMap::new()
                    }
                }
            });
            self.set_get_slot_values_handler(get_handler).await;
        })
    }
}

/// Register the default "reset" method that emits a Tauri event.
pub async fn register_reset_method<C: AroraConnection>(connection: &C, app_handle: AppHandle) {
    let app = app_handle.clone();
    let handler: MethodHandler = Arc::new(move |_args| match app.emit("reset", ()) {
        Ok(()) => {
            info!("Emitted reset event");
            InvokeResult::ok()
        }
        Err(e) => InvokeResult::err(format!("Failed to emit reset: {}", e)),
    });

    connection
        .register_method(
            MethodInfo {
                path: "reset".to_string(),
                params: vec![],
                return_type: None,
                description: Some("Reset all values to defaults".to_string()),
            },
            handler,
        )
        .await;
}
