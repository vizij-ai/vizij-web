//! WebSocket server implementation.
//!
//! Provides a ready-to-use WebSocket server that handles the arora protocol.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use arora_schema::value::Value;

use crate::messages::{Incoming, Outgoing};
use crate::registry::Registry;

/// Callback for handling SetSlotValues messages.
///
/// Called when a valid SetSlotValues message is received.
/// Return `Ok(())` to acknowledge success, or `Err(message)` to reject.
pub type SetSlotValuesHandler = Arc<dyn Fn(HashMap<String, Value>) -> Result<(), String> + Send + Sync>;

/// Configuration for the WebSocket server.
#[derive(Clone)]
pub struct ServerConfig {
    /// Port to listen on.
    pub port: u16,
    /// Address to bind to (default: "0.0.0.0").
    pub bind_address: String,
    /// Whether to validate update paths against registered input nodes.
    pub validate_paths: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 9000,
            bind_address: "0.0.0.0".to_string(),
            validate_paths: true,
        }
    }
}

impl ServerConfig {
    /// Create a new config with the specified port.
    pub fn with_port(port: u16) -> Self {
        Self {
            port,
            ..Default::default()
        }
    }

    /// Set the bind address.
    pub fn bind_address(mut self, addr: impl Into<String>) -> Self {
        self.bind_address = addr.into();
        self
    }

    /// Set whether to validate update paths.
    pub fn validate_paths(mut self, validate: bool) -> Self {
        self.validate_paths = validate;
        self
    }
}

/// WebSocket server for the arora protocol.
///
/// Handles connections, parses messages, and dispatches to registered handlers.
pub struct AroraWSServer {
    config: ServerConfig,
    registry: Arc<Registry>,
    update_handler: RwLock<Option<SetSlotValuesHandler>>,
    is_running: RwLock<bool>,
}

impl AroraWSServer {
    /// Create a new server with the given configuration.
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            registry: Arc::new(Registry::new()),
            update_handler: RwLock::new(None),
            is_running: RwLock::new(false),
        }
    }

    /// Create a new server with default configuration.
    pub fn with_port(port: u16) -> Self {
        Self::new(ServerConfig::with_port(port))
    }

    /// Get a reference to the registry.
    pub fn registry(&self) -> &Arc<Registry> {
        &self.registry
    }

    /// Set the update handler callback.
    ///
    /// This is called whenever a valid update message is received.
    pub async fn set_update_handler<F>(&self, handler: F)
    where
        F: Fn(HashMap<String, Value>) -> Result<(), String> + Send + Sync + 'static,
    {
        *self.update_handler.write().await = Some(Arc::new(handler));
    }

    /// Check if the server is running.
    pub async fn is_running(&self) -> bool {
        *self.is_running.read().await
    }

    /// Get the configured port.
    pub fn port(&self) -> u16 {
        self.config.port
    }

    /// Run the server until the cancellation token is triggered.
    pub async fn run(&self, cancel_token: CancellationToken) -> Result<(), String> {
        let addr = format!("{}:{}", self.config.bind_address, self.config.port);
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

        info!("Arora WebSocket server listening on ws://{}", addr);
        *self.is_running.write().await = true;

        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, addr)) => {
                            let registry = self.registry.clone();
                            let update_handler = self.update_handler.read().await.clone();
                            let validate_paths = self.config.validate_paths;

                            tokio::spawn(async move {
                                handle_connection(stream, addr, registry, update_handler, validate_paths).await;
                            });
                        }
                        Err(e) => {
                            error!("Failed to accept connection: {}", e);
                        }
                    }
                }
                _ = cancel_token.cancelled() => {
                    info!("Arora WebSocket server shutting down");
                    break;
                }
            }
        }

        *self.is_running.write().await = false;
        Ok(())
    }
}

/// Handle a single WebSocket connection.
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    registry: Arc<Registry>,
    update_handler: Option<SetSlotValuesHandler>,
    validate_paths: bool,
) {
    info!("New WebSocket connection from: {}", addr);

    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("Error during WebSocket handshake: {}", e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                debug!("Received message: {}", text);

                let response = match serde_json::from_str::<Incoming>(&text) {
                    Ok(incoming) => {
                        process_message(incoming, &registry, &update_handler, validate_paths).await
                    }
                    Err(e) => {
                        warn!("Failed to parse message: {}", e);
                        Outgoing::Error {
                            request_id: None,
                            message: format!("Invalid message format: {}", e),
                        }
                    }
                };

                let response_text = serde_json::to_string(&response).unwrap();
                if let Err(e) = write.send(Message::Text(response_text.into())).await {
                    error!("Failed to send response: {}", e);
                    break;
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} disconnected", addr);
                break;
            }
            Ok(Message::Ping(data)) => {
                if let Err(e) = write.send(Message::Pong(data)).await {
                    error!("Failed to send pong: {}", e);
                    break;
                }
            }
            Ok(_) => {
                // Ignore other message types
            }
            Err(e) => {
                error!("Error reading message: {}", e);
                break;
            }
        }
    }

    info!("Connection closed for: {}", addr);
}

/// Process an incoming message and return the response.
async fn process_message(
    incoming: Incoming,
    registry: &Registry,
    update_handler: &Option<SetSlotValuesHandler>,
    validate_paths: bool,
) -> Outgoing {
    match incoming {
        Incoming::SetSlotValues { values } => {
            // Validate paths if enabled
            if validate_paths {
                let input_paths = registry.get_input_paths().await;
                let invalid_paths: Vec<&str> = values
                    .keys()
                    .filter(|path| !input_paths.iter().any(|p| p == *path))
                    .map(|s| s.as_str())
                    .collect();

                if !invalid_paths.is_empty() {
                    warn!("Invalid paths in SetSlotValues: {:?}", invalid_paths);
                    return Outgoing::SetSlotValuesResp {
                        success: false,
                        message: Some(format!("Unknown input path(s): {}", invalid_paths.join(", "))),
                    };
                }
            }

            // Call SetSlotValues handler if registered
            if let Some(handler) = update_handler {
                match handler(values) {
                    Ok(()) => {
                        debug!("SetSlotValues handled successfully");
                        Outgoing::SetSlotValuesResp {
                            success: true,
                            message: None,
                        }
                    }
                    Err(e) => {
                        error!("SetSlotValues handler error: {}", e);
                        Outgoing::SetSlotValuesResp {
                            success: false,
                            message: Some(e),
                        }
                    }
                }
            } else {
                // No handler registered, just acknowledge
                debug!("No SetSlotValues handler registered, acknowledging");
                Outgoing::SetSlotValuesResp {
                    success: true,
                    message: None,
                }
            }
        }

        Incoming::ListSlots { path } => {
            let nodes = registry.get_nodes_filtered(path.as_deref()).await;
            Outgoing::ListSlotsResp { nodes }
        }

        Incoming::ListMethods { path } => {
            let methods = registry.get_methods_filtered(path.as_deref()).await;
            Outgoing::ListMethodsResp { methods }
        }

        Incoming::Invoke {
            method,
            args,
            request_id,
        } => {
            let result = registry.invoke_method(&method, args).await;
            Outgoing::InvokeResp {
                success: result.success,
                request_id,
                value: result.value,
                message: result.message,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_server_config_default() {
        let config = ServerConfig::default();
        assert_eq!(config.port, 9000);
        assert_eq!(config.bind_address, "0.0.0.0");
        assert!(config.validate_paths);
    }

    #[test]
    fn test_server_config_builder() {
        let config = ServerConfig::with_port(8080)
            .bind_address("127.0.0.1")
            .validate_paths(false);

        assert_eq!(config.port, 8080);
        assert_eq!(config.bind_address, "127.0.0.1");
        assert!(!config.validate_paths);
    }
}
