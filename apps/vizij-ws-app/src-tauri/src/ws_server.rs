//! WebSocket server wrapper for the Tauri app.
//!
//! This module provides a thin wrapper around `arora_websocket::AroraWSServer`
//! that integrates with Tauri's event system.

use std::sync::Arc;

use arora_websocket::{
    AroraWSServer, CancellationToken, InvokeResult, MethodInfo, NodeInfo, ServerConfig, Value,
};
use log::info;
use tauri::{AppHandle, Emitter};

/// Wrapper around AroraWSServer that integrates with Tauri.
pub struct WsServer {
    server: Arc<AroraWSServer>,
}

impl WsServer {
    /// Create a new WebSocket server on the specified port.
    pub fn new(port: u16) -> Self {
        let config = ServerConfig::with_port(port).validate_paths(true);
        Self {
            server: Arc::new(AroraWSServer::new(config)),
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

    /// Configure the update handler to emit Tauri events.
    pub async fn setup_tauri_integration(&self, app_handle: AppHandle) {
        let app = app_handle.clone();
        self.server
            .set_update_handler(move |values| {
                match app.emit("update-values", &values) {
                    Ok(()) => Ok(()),
                    Err(e) => Err(format!("Failed to emit: {}", e)),
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
