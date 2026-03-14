//! Connection manager for coordinating multiple AroraConnection instances.
//!
//! Enforces exclusive client policy: only one client across all connections
//! at any time. When a new client connects on any connection, all other
//! connections' active clients are disconnected.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use log::{debug, info, warn};
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};
use tauri::{AppHandle, Emitter, Manager};

use crate::connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, InvokeResult, MethodHandler,
    MethodInfo, MethodParam, OnClientConnectedHandler, SetSlotValuesHandler, SlotInfo, Type, Value,
};
use crate::AppState;

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
    slot_values_responder: Arc<Mutex<Option<oneshot::Sender<HashMap<String, Value>>>>>,
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
                debug!(
                    "SetSlotValues handler fired with {} path(s): {:?}",
                    values.len(),
                    values.keys().collect::<Vec<_>>()
                );
                match app.emit("update-values", &values) {
                    Ok(()) => {
                        debug!("Emitted update-values event successfully");
                        Ok(())
                    }
                    Err(e) => {
                        warn!("Failed to emit update-values: {}", e);
                        Err(format!("Failed to emit: {}", e))
                    }
                }
            });
            conn.set_set_slot_values_handler(set_handler).await;

            // Handler for GetSlotValues: request from frontend via event/command pattern
            let app = app_handle.clone();
            let responder_clone = responder.clone();
            let get_handler: GetSlotValuesHandler = Arc::new(move |slots| {
                let responder_clone = responder_clone.clone();
                let app = app.clone();
                Box::pin(async move {
                    debug!("GetSlotValues request for {} slots", slots.len());

                    let (tx, rx) = oneshot::channel();
                    {
                        let mut guard = responder_clone.lock().unwrap();
                        *guard = Some(tx);
                    }

                    if let Err(e) = app.emit("get-slot-values-request", &slots) {
                        warn!("Failed to emit get-slot-values-request: {}", e);
                        let mut guard = responder_clone.lock().unwrap();
                        guard.take();
                        return HashMap::new();
                    }

                    match timeout(Duration::from_secs(5), rx).await {
                        Ok(Ok(values)) => {
                            debug!("Received {} slot values from frontend", values.len());
                            let mut guard = responder_clone.lock().unwrap();
                            guard.take();
                            values
                        }
                        Ok(Err(_)) => {
                            warn!("Frontend failed to respond with slot values");
                            let mut guard = responder_clone.lock().unwrap();
                            guard.take();
                            HashMap::new()
                        }
                        Err(_) => {
                            warn!("Timeout waiting for slot values");
                            let mut guard = responder_clone.lock().unwrap();
                            guard.take();
                            HashMap::new()
                        }
                    }
                })
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

            // Register "mute_microphone" method: mute/unmute the mic
            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |args| {
                let muted = match args.get("muted") {
                    Some(Value::Boolean(b)) => *b,
                    _ => true,
                };

                // Update AppState
                *app.state::<AppState>().mic_muted.lock().unwrap() = muted;

                match app.emit("mute-microphone", muted) {
                    Ok(()) => {
                        info!("Emitted mute-microphone event (muted={})", muted);
                        InvokeResult::ok()
                    }
                    Err(e) => InvokeResult::err(format!("Failed to emit mute-microphone: {}", e)),
                }
            });
            conn.register_method(
                MethodInfo {
                    path: "mute_microphone".to_string(),
                    params: vec![MethodParam {
                        name: "muted".to_string(),
                        param_type: Type::Boolean,
                        required: true,
                        default_value: None,
                        description: Some("True to mute, false to unmute".to_string()),
                    }],
                    return_type: None,
                    description: Some("Mute or unmute the microphone".to_string()),
                },
                handler,
            )
            .await;

            // Register "get_mic_muted" method: query current mic state
            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |_args| {
                let muted = *app.state::<AppState>().mic_muted.lock().unwrap();
                InvokeResult::ok_with_value(Value::Boolean(muted))
            });
            conn.register_method(
                MethodInfo {
                    path: "get_mic_muted".to_string(),
                    params: vec![],
                    return_type: Some(Type::Boolean),
                    description: Some("Get current microphone muted state".to_string()),
                },
                handler,
            )
            .await;

            // Register "speak" method: send text to TTS
            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |args| {
                let text = match args.get("text") {
                    Some(Value::String(s)) => s.clone(),
                    _ => return InvokeResult::err("Missing 'text' parameter".to_string()),
                };

                match app.emit("speak", &text) {
                    Ok(()) => {
                        info!("Emitted speak event: \"{}\"", &text[..text.len().min(60)]);
                        InvokeResult::ok()
                    }
                    Err(e) => InvokeResult::err(format!("Failed to emit speak: {}", e)),
                }
            });
            conn.register_method(
                MethodInfo {
                    path: "speak".to_string(),
                    params: vec![MethodParam {
                        name: "text".to_string(),
                        param_type: Type::String,
                        required: true,
                        default_value: None,
                        description: Some("Text to speak via TTS".to_string()),
                    }],
                    return_type: None,
                    description: Some("Speak the given text via TTS".to_string()),
                },
                handler,
            )
            .await;

            // Register "interrupt" method: stop any ongoing speech
            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |_args| {
                match app.emit("interrupt-speech", ()) {
                    Ok(()) => {
                        info!("Emitted interrupt-speech event");
                        InvokeResult::ok()
                    }
                    Err(e) => InvokeResult::err(format!("Failed to emit interrupt-speech: {}", e)),
                }
            });
            conn.register_method(
                MethodInfo {
                    path: "interrupt".to_string(),
                    params: vec![],
                    return_type: None,
                    description: Some("Interrupt any ongoing speech playback".to_string()),
                },
                handler,
            )
            .await;

            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |_args| {
                let catalog = app.state::<AppState>().transport_catalog.lock().unwrap().clone();
                match serde_json::to_string(&catalog) {
                    Ok(serialized) => InvokeResult::ok_with_value(Value::String(serialized)),
                    Err(error) => InvokeResult::err(format!(
                        "Failed to serialize transport catalog: {}",
                        error
                    )),
                }
            });
            conn.register_method(
                MethodInfo {
                    path: "transport/list".to_string(),
                    params: vec![],
                    return_type: None,
                    description: Some("List bundled animations and procedural programs".to_string()),
                },
                handler,
            )
            .await;

            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |args| {
                let id = match args.get("id") {
                    Some(Value::String(id)) => id.clone(),
                    _ => return InvokeResult::err("Missing 'id' parameter".to_string()),
                };
                let kind = match args.get("kind") {
                    Some(Value::String(kind)) => kind.clone(),
                    _ => return InvokeResult::err("Missing 'kind' parameter".to_string()),
                };
                let event_name = if kind == "animation" {
                    "animation-play"
                } else if kind == "program" {
                    "program-play"
                } else {
                    return InvokeResult::err("Invalid 'kind' parameter".to_string());
                };

                match app.emit(event_name, &id) {
                    Ok(()) => InvokeResult::ok(),
                    Err(e) => InvokeResult::err(format!("Failed to emit {}: {}", event_name, e)),
                }
            });
            conn.register_method(
                MethodInfo {
                    path: "transport/play".to_string(),
                    params: vec![
                        MethodParam {
                            name: "kind".to_string(),
                            param_type: Type::String,
                            required: true,
                            default_value: None,
                            description: Some("Either 'animation' or 'program'".to_string()),
                        },
                        MethodParam {
                            name: "id".to_string(),
                            param_type: Type::String,
                            required: true,
                            default_value: None,
                            description: Some("Transport identifier".to_string()),
                        },
                    ],
                    return_type: None,
                    description: Some("Play a bundled animation or procedural program".to_string()),
                },
                handler,
            )
            .await;

            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |args| {
                let id = match args.get("id") {
                    Some(Value::String(id)) => id.clone(),
                    _ => return InvokeResult::err("Missing 'id' parameter".to_string()),
                };
                let kind = match args.get("kind") {
                    Some(Value::String(kind)) => kind.clone(),
                    _ => return InvokeResult::err("Missing 'kind' parameter".to_string()),
                };
                let event_name = if kind == "animation" {
                    "animation-pause"
                } else if kind == "program" {
                    "program-pause"
                } else {
                    return InvokeResult::err("Invalid 'kind' parameter".to_string());
                };

                match app.emit(event_name, &id) {
                    Ok(()) => InvokeResult::ok(),
                    Err(e) => InvokeResult::err(format!("Failed to emit {}: {}", event_name, e)),
                }
            });
            conn.register_method(
                MethodInfo {
                    path: "transport/pause".to_string(),
                    params: vec![
                        MethodParam {
                            name: "kind".to_string(),
                            param_type: Type::String,
                            required: true,
                            default_value: None,
                            description: Some("Either 'animation' or 'program'".to_string()),
                        },
                        MethodParam {
                            name: "id".to_string(),
                            param_type: Type::String,
                            required: true,
                            default_value: None,
                            description: Some("Transport identifier".to_string()),
                        },
                    ],
                    return_type: None,
                    description: Some("Pause a bundled animation or procedural program".to_string()),
                },
                handler,
            )
            .await;

            let app = app_handle.clone();
            let handler: MethodHandler = Arc::new(move |args| {
                let id = match args.get("id") {
                    Some(Value::String(id)) => id.clone(),
                    _ => return InvokeResult::err("Missing 'id' parameter".to_string()),
                };
                let kind = match args.get("kind") {
                    Some(Value::String(kind)) => kind.clone(),
                    _ => return InvokeResult::err("Missing 'kind' parameter".to_string()),
                };

                if kind == "animation" {
                    let clear_outputs = match args.get("clear_outputs") {
                        Some(Value::Boolean(value)) => *value,
                        _ => true,
                    };
                    return match app.emit(
                        "animation-stop",
                        serde_json::json!({
                            "id": id,
                            "clearOutputs": clear_outputs,
                        }),
                    ) {
                        Ok(()) => InvokeResult::ok(),
                        Err(e) => {
                            InvokeResult::err(format!("Failed to emit animation-stop: {}", e))
                        }
                    };
                }

                if kind == "program" {
                    let reset_outputs = match args.get("reset_outputs") {
                        Some(Value::Boolean(value)) => *value,
                        _ => true,
                    };
                    return match app.emit(
                        "program-stop",
                        serde_json::json!({
                            "id": id,
                            "resetOutputs": reset_outputs,
                        }),
                    ) {
                        Ok(()) => InvokeResult::ok(),
                        Err(e) => InvokeResult::err(format!("Failed to emit program-stop: {}", e)),
                    };
                }

                InvokeResult::err("Invalid 'kind' parameter".to_string())
            });
            conn.register_method(
                MethodInfo {
                    path: "transport/stop".to_string(),
                    params: vec![
                        MethodParam {
                            name: "kind".to_string(),
                            param_type: Type::String,
                            required: true,
                            default_value: None,
                            description: Some("Either 'animation' or 'program'".to_string()),
                        },
                        MethodParam {
                            name: "id".to_string(),
                            param_type: Type::String,
                            required: true,
                            default_value: None,
                            description: Some("Transport identifier".to_string()),
                        },
                    ],
                    return_type: None,
                    description: Some("Stop a bundled animation or procedural program".to_string()),
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
        debug!(
            "ConnectionManager::set_slots called with {} slot(s)",
            slots.len()
        );
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
