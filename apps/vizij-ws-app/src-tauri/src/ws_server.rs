//! WebSocket server wrapper for the Tauri app.
//!
//! This module provides a thin wrapper around `arora_websocket::AroraWSServer`
//! that integrates with Tauri's event system.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use arora_websocket::{
    AroraWSServer, CancellationToken, InvokeResult, MethodInfo, NodeInfo, ServerConfig, Value,
};
use log::{debug, info, warn};
use std::sync::mpsc::{channel, Sender};
use tauri::{AppHandle, Emitter};

/// Wrapper around AroraWSServer that integrates with Tauri.
pub struct WsServer {
    server: Arc<AroraWSServer>,
    /// Channel sender for pending GetSlotValues responses.
    /// When a GetSlotValues request comes in, we store a sender here,
    /// emit an event to the frontend, and wait for the response.
    slot_values_responder: Arc<Mutex<Option<Sender<HashMap<String, Value>>>>>,
}

impl WsServer {
    /// Create a new WebSocket server on the specified port.
    pub fn new(port: u16) -> Self {
        let config = ServerConfig::with_port(port).validate_paths(true);
        Self {
            server: Arc::new(AroraWSServer::new(config)),
            slot_values_responder: Arc::new(Mutex::new(None)),
        }
    }

    /// Get a reference to the underlying server.
    pub fn server(&self) -> &Arc<AroraWSServer> {
        &self.server
    }

    /// Set the available nodes.
    pub async fn set_nodes(&self, nodes: Vec<NodeInfo>) {
        self.server.registry().set_nodes(nodes).await;
    }

    /// Register a method that can be invoked via WebSocket.
    pub async fn register_method<F>(&self, info: MethodInfo, handler: F)
    where
        F: Fn(std::collections::HashMap<String, Value>) -> InvokeResult + Send + Sync + 'static,
    {
        self.server.registry().register_method_fn(info, handler).await;
    }

    /// Called by Tauri command when frontend responds with slot values.
    pub fn respond_slot_values(&self, values: HashMap<String, Value>) {
        let mut guard = self.slot_values_responder.lock().unwrap();
        if let Some(tx) = guard.take() {
            if tx.send(values).is_err() {
                warn!("Failed to send slot values response - receiver dropped");
            }
        } else {
            warn!("respond_slot_values called but no pending request");
        }
    }

    /// Configure the update handler to emit Tauri events.
    pub async fn setup_tauri_integration(&self, app_handle: AppHandle) {
        // Handler for SetSlotValues: emit to frontend
        let app = app_handle.clone();
        self.server
            .set_set_slot_values_handler(move |values| {
                match app.emit("update-values", &values) {
                    Ok(()) => Ok(()),
                    Err(e) => Err(format!("Failed to emit: {}", e)),
                }
            })
            .await;

        // Handler for GetSlotValues: request from frontend via event/command pattern
        let app = app_handle.clone();
        let responder = self.slot_values_responder.clone();
        self.server
            .set_get_slot_values_handler(move |slots| {
                debug!("GetSlotValues request for {} slots", slots.len());

                // Create a channel for the response
                let (tx, rx) = channel();

                // Store the sender so respond_slot_values can use it
                {
                    let mut guard = responder.lock().unwrap();
                    *guard = Some(tx);
                }

                // Emit event to frontend with the requested slots
                if let Err(e) = app.emit("get-slot-values-request", &slots) {
                    warn!("Failed to emit get-slot-values-request: {}", e);
                    return HashMap::new();
                }

                // Wait for response with timeout
                match rx.recv_timeout(Duration::from_secs(5)) {
                    Ok(values) => {
                        debug!("Received {} slot values from frontend", values.len());
                        values
                    }
                    Err(e) => {
                        warn!("Timeout or error waiting for slot values: {}", e);
                        HashMap::new()
                    }
                }
            })
            .await;
    }

    /// Run the server until cancelled.
    pub async fn run(&self, cancel_token: CancellationToken) -> Result<(), String> {
        self.server.run(cancel_token).await
    }

    /// Check if the server is running.
    pub async fn is_running(&self) -> bool {
        self.server.is_running().await
    }

    /// Get the configured port.
    pub fn port(&self) -> u16 {
        self.server.port()
    }
}

/// Register the default "reset" method that emits a Tauri event.
pub async fn register_reset_method(server: &WsServer, app_handle: AppHandle) {
    let app = app_handle.clone();
    server
        .register_method(
            MethodInfo {
                path: "reset".to_string(),
                params: vec![],
                return_type: None,
                description: Some("Reset all values to defaults".to_string()),
            },
            move |_args| {
                match app.emit("reset", ()) {
                    Ok(()) => {
                        info!("Emitted reset event");
                        InvokeResult::ok()
                    }
                    Err(e) => InvokeResult::err(format!("Failed to emit reset: {}", e)),
                }
            },
        )
        .await;
}
