//! Connection manager for coordinating multiple AroraConnection instances.
//!
//! Enforces exclusive client policy: only one client across all connections
//! at any time. When a new client connects on any connection, all other
//! connections' active clients are disconnected.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use log::{debug, info, warn};
use std::sync::mpsc::{channel, Sender};
use tauri::{AppHandle, Emitter};

use crate::connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, InvokeResult, MethodHandler,
    MethodInfo, OnClientConnectedHandler, SetSlotValuesHandler, SlotInfo, Value,
};

/// Manages multiple AroraConnection instances with exclusive client policy.
///
/// Only one client across all connections is allowed at any time. When a new
/// client connects on any connection, clients on all other connections are
/// disconnected.
pub struct ConnectionManager {
    connections: Vec<Arc<dyn AroraConnection>>,
    /// Shared channel sender for pending GetSlotValues responses.
    /// Only one get-slot-values request can be in flight at a time
    /// (since only one client is active).
    slot_values_responder: Arc<Mutex<Option<Sender<HashMap<String, Value>>>>>,
}

impl ConnectionManager {
    /// Create a new empty ConnectionManager.
    pub fn new() -> Self {
        Self {
            connections: Vec::new(),
            slot_values_responder: Arc::new(Mutex::new(None)),
        }
    }

    /// Register a connection interface.
    pub fn add_connection(&mut self, conn: Arc<dyn AroraConnection>) {
        self.connections.push(conn);
    }

    /// Set up Tauri event integration and exclusive client handlers for all connections.
    ///
    /// For each connection, this wires up:
    /// - SetSlotValues handler → emits `"update-values"` Tauri event
    /// - GetSlotValues handler → emits `"get-slot-values-request"`, waits on channel
    /// - "reset" method → emits `"reset"` Tauri event
    /// - on_client_connected → disconnects clients on all OTHER connections
    pub async fn setup_all(&self, app_handle: AppHandle) {
        let responder = self.slot_values_responder.clone();

        for (i, conn) in self.connections.iter().enumerate() {
            // Handler for SetSlotValues: emit to frontend
            let app = app_handle.clone();
            let set_handler: SetSlotValuesHandler = Arc::new(move |values| {
                match app.emit("update-values", &values) {
                    Ok(()) => Ok(()),
                    Err(e) => Err(format!("Failed to emit: {}", e)),
                }
            });
            conn.set_set_slot_values_handler(set_handler).await;

            // Handler for GetSlotValues: request from frontend via event/command pattern
            let app = app_handle.clone();
            let responder_clone = responder.clone();
            let get_handler: GetSlotValuesHandler = Arc::new(move |slots| {
                debug!("GetSlotValues request for {} slots", slots.len());

                let (tx, rx) = channel();
                {
                    let mut guard = responder_clone.lock().unwrap();
                    *guard = Some(tx);
                }

                if let Err(e) = app.emit("get-slot-values-request", &slots) {
                    warn!("Failed to emit get-slot-values-request: {}", e);
                    return HashMap::new();
                }

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
            });
            conn.set_get_slot_values_handler(get_handler).await;

            // Register "reset" method: emits Tauri event
            let app = app_handle.clone();
            let handler: MethodHandler =
                Arc::new(move |_args| match app.emit("reset", ()) {
                    Ok(()) => {
                        info!("Emitted reset event");
                        InvokeResult::ok()
                    }
                    Err(e) => InvokeResult::err(format!("Failed to emit reset: {}", e)),
                });
            conn.register_method(
                MethodInfo {
                    path: "reset".to_string(),
                    params: vec![],
                    return_type: None,
                    description: Some("Reset all values to defaults".to_string()),
                },
                handler,
            )
            .await;

            // Exclusive client handler: disconnect all OTHER connections when a client connects here
            let others: Vec<Arc<dyn AroraConnection>> = self
                .connections
                .iter()
                .enumerate()
                .filter(|(j, _)| *j != i)
                .map(|(_, c)| c.clone())
                .collect();

            let on_connected: OnClientConnectedHandler = Arc::new(move |conn_id| {
                info!(
                    "Client connected on {}; disconnecting other connections",
                    conn_id
                );
                for other in &others {
                    let other = other.clone();
                    tokio::spawn(async move {
                        other.disconnect_client().await;
                    });
                }
            });
            conn.set_on_client_connected_handler(on_connected).await;
        }
    }

    /// Spawn `run()` for all connections as child tasks of the given token.
    ///
    /// Returns join handles for each spawned task so the caller can await them.
    pub fn run_all(&self, cancel_token: CancellationToken) -> Vec<tokio::task::JoinHandle<()>> {
        let mut handles = Vec::new();
        for conn in &self.connections {
            let conn = conn.clone();
            let child_token = cancel_token.child_token();
            let handle = tokio::spawn(async move {
                if let Err(e) = conn.run(child_token).await {
                    log::error!("Connection {} error: {}", conn.connection_id(), e);
                }
            });
            handles.push(handle);
        }
        handles
    }

    /// Propagate slot definitions to all connections.
    pub async fn set_slots(&self, slots: Vec<SlotInfo>) {
        for conn in &self.connections {
            conn.set_slots(slots.clone()).await;
        }
    }

    /// Respond to a pending GetSlotValues request.
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

    /// Check if any connection is currently running.
    pub async fn is_any_running(&self) -> bool {
        for conn in &self.connections {
            if conn.is_running().await {
                return true;
            }
        }
        false
    }
}
