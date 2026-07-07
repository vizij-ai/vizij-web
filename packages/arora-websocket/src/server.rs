//! WebSocket server implementation.
//!
//! Provides a ready-to-use WebSocket server that speaks the Arora API wire format.
//! Each server supports at most one active client at a time.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::RwLock;
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;
use tokio_tungstenite::tungstenite::protocol::CloseFrame;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use arora_connection::{OnClientConnectedHandler, ReadValuesHandler, Value};

use crate::messages::{Incoming, Outgoing};
use crate::registry::Registry;

/// Callback for handling WriteValues messages.
///
/// Called when a valid WriteValues message is received.
/// Return `Ok(())` to acknowledge success, or `Err(message)` to reject.
pub type WriteValuesHandler = Arc<dyn Fn(HashMap<String, Value>) -> Result<(), String> + Send + Sync>;

/// Configuration for the WebSocket server.
#[derive(Clone)]
pub struct ServerConfig {
    /// Port to listen on.
    pub port: u16,
    /// Address to bind to (default: "0.0.0.0").
    pub bind_address: String,
    /// Whether to validate written paths against registered input keys.
    pub validate_paths: bool,
    /// Whether to serve the built-in control panel on plain HTTP requests.
    pub serve_control_panel: bool,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 9000,
            bind_address: "0.0.0.0".to_string(),
            validate_paths: true,
            serve_control_panel: false,
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

    /// Enable or disable the built-in control panel served on plain HTTP requests.
    pub fn serve_control_panel(mut self, enable: bool) -> Self {
        self.serve_control_panel = enable;
        self
    }
}

/// WebSocket server speaking the Arora API wire format.
///
/// Handles connections, parses messages, and dispatches to registered handlers.
/// Supports at most one active client at a time -- when a new client connects,
/// the previous one is disconnected.
pub struct AroraWSServer {
    config: ServerConfig,
    registry: Arc<Registry>,
    write_values_handler: RwLock<Option<WriteValuesHandler>>,
    read_values_handler: RwLock<Option<ReadValuesHandler>>,
    on_client_connected_handler: RwLock<Option<OnClientConnectedHandler>>,
    /// Cancel token for the single active client. When cancelled, the client is disconnected.
    active_client: Arc<RwLock<Option<CancellationToken>>>,
    is_running: RwLock<bool>,
}

impl AroraWSServer {
    /// Create a new server with the given configuration.
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            registry: Arc::new(Registry::new()),
            write_values_handler: RwLock::new(None),
            read_values_handler: RwLock::new(None),
            on_client_connected_handler: RwLock::new(None),
            active_client: Arc::new(RwLock::new(None)),
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

    /// Set the write values handler callback.
    /// This is called whenever a valid write_values message is received.
    pub async fn set_write_values_handler<F>(&self, handler: F)
    where
        F: Fn(HashMap<String, Value>) -> Result<(), String> + Send + Sync + 'static,
    {
        *self.write_values_handler.write().await = Some(Arc::new(handler));
    }

    /// Set the read values handler callback.
    /// This is called whenever a valid read_values message is received.
    pub async fn set_read_values_handler(&self, handler: ReadValuesHandler) {
        *self.read_values_handler.write().await = Some(handler);
    }

    /// Set the handler called when a new client connects.
    pub async fn set_on_client_connected_handler(&self, handler: OnClientConnectedHandler) {
        *self.on_client_connected_handler.write().await = Some(handler);
    }

    /// Disconnect the current active client (if any).
    pub async fn disconnect_client(&self) {
        let mut guard = self.active_client.write().await;
        if let Some(token) = guard.take() {
            token.cancel();
            info!("Disconnected active client on ws://{}:{}", self.config.bind_address, self.config.port);
        }
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
        if self.config.serve_control_panel {
            info!("Control panel available at http://{}", addr);
        }
        *self.is_running.write().await = true;

        let serve_control_panel = self.config.serve_control_panel;
        let validate_paths = self.config.validate_paths;
        let conn_id = self.connection_id();
        let bind_addr = self.config.bind_address.clone();
        let port = self.config.port;

        // Snapshot handlers once -- they are set during setup_all() and never change.
        let write_handler = self.write_values_handler.read().await.clone();
        let read_handler = self.read_values_handler.read().await.clone();
        let on_connected = self.on_client_connected_handler.read().await.clone();

        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, peer_addr)) => {
                            // Spawn a task per connection so the accept loop never blocks.
                            // (peek can block if a client connects without sending data.)
                            let active_client = self.active_client.clone();
                            let registry = self.registry.clone();
                            let write_handler = write_handler.clone();
                            let read_handler = read_handler.clone();
                            let on_connected = on_connected.clone();
                            let conn_id = conn_id.clone();
                            let bind_addr = bind_addr.clone();
                            let parent_token = cancel_token.clone();

                            tokio::spawn(async move {
                                // Peek with timeout to classify the connection
                                let is_ws_upgrade = {
                                    let mut peek_buf = [0u8; 4096];
                                    match tokio::time::timeout(
                                        std::time::Duration::from_secs(5),
                                        stream.peek(&mut peek_buf),
                                    ).await {
                                        Ok(Ok(n)) => {
                                            let req = String::from_utf8_lossy(&peek_buf[..n]);
                                            let lower = req.to_ascii_lowercase();
                                            lower.contains("upgrade") && lower.contains("websocket")
                                        }
                                        Ok(Err(e)) => {
                                            error!("Failed to peek connection from {}: {}", peer_addr, e);
                                            return;
                                        }
                                        Err(_) => {
                                            debug!("Connection from {} sent no data within timeout", peer_addr);
                                            return;
                                        }
                                    }
                                };

                                if !is_ws_upgrade {
                                    if serve_control_panel {
                                        serve_control_panel_http(stream).await;
                                    }
                                    return;
                                }

                                // WebSocket: enforce exclusive client policy
                                let client_token = parent_token.child_token();
                                {
                                    let mut guard = active_client.write().await;
                                    if let Some(old) = guard.take() {
                                        old.cancel();
                                        info!("Disconnected active client on ws://{}:{}", bind_addr, port);
                                    }
                                    *guard = Some(client_token.clone());
                                }

                                // Notify the on_client_connected handler
                                if let Some(ref handler) = on_connected {
                                    handler(conn_id);
                                }

                                handle_connection(
                                    stream, peer_addr, registry,
                                    write_handler, read_handler,
                                    validate_paths, client_token, active_client,
                                ).await;
                            });
                        }
                        Err(e) => {
                            error!("Failed to accept connection: {}", e);
                        }
                    }
                }
                _ = cancel_token.cancelled() => {
                    info!("Arora WebSocket server shutting down");
                    // Disconnect the active client on shutdown
                    self.disconnect_client().await;
                    break;
                }
            }
        }

        *self.is_running.write().await = false;
        Ok(())
    }

    /// Get the connection identifier.
    pub fn connection_id(&self) -> String {
        format!("ws://127.0.0.1:{}", self.config.port)
    }
}

/// Handle a single WebSocket connection.
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    registry: Arc<Registry>,
    write_values_handler: Option<WriteValuesHandler>,
    read_values_handler: Option<ReadValuesHandler>,
    validate_paths: bool,
    client_token: CancellationToken,
    active_client: Arc<RwLock<Option<CancellationToken>>>,
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

    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        debug!("Received message: {}", text);

                        let response = match serde_json::from_str::<Incoming>(&text) {
                            Ok(incoming) => {
                                process_message(incoming, &registry, &write_values_handler, &read_values_handler, validate_paths).await
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
                    Some(Ok(Message::Close(_))) => {
                        info!("Client {} disconnected", addr);
                        break;
                    }
                    Some(Ok(Message::Ping(data))) => {
                        if let Err(e) = write.send(Message::Pong(data)).await {
                            error!("Failed to send pong: {}", e);
                            break;
                        }
                    }
                    Some(Ok(_)) => {
                        // Ignore other message types
                    }
                    Some(Err(e)) => {
                        error!("Error reading message: {}", e);
                        break;
                    }
                    None => {
                        // Stream ended
                        break;
                    }
                }
            }
            _ = client_token.cancelled() => {
                info!("Client {} disconnected by server (exclusive client policy)", addr);
                // Send a close frame to the client
                let close_frame = CloseFrame {
                    code: CloseCode::Normal,
                    reason: "Another client connected".into(),
                };
                let _ = write.send(Message::Close(Some(close_frame))).await;
                break;
            }
        }
    }

    // Clear the active client only if this was a natural disconnect.
    // If our token was cancelled, we were replaced by a new client -- don't touch active_client.
    if !client_token.is_cancelled() {
        let mut guard = active_client.write().await;
        *guard = None;
    }

    info!("Connection closed for: {}", addr);
}

/// Serve the built-in control panel HTML over a plain HTTP response.
async fn serve_control_panel_http(mut stream: TcpStream) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    const HTML: &str = include_str!("control_panel.html");

    // Read and consume the HTTP request from the buffer
    let mut buf = vec![0u8; 4096];
    let _ = stream.read(&mut buf).await;

    let body = HTML.as_bytes();
    let header = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html; charset=utf-8\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n",
        body.len()
    );

    let _ = stream.write_all(header.as_bytes()).await;
    let _ = stream.write_all(body).await;
}

/// Process an incoming message and return the response.
///
/// This function is public so it can be reused by other connection types
/// (e.g., WebAppServer) that share the same wire format.
pub async fn process_message(
    incoming: Incoming,
    registry: &Registry,
    write_values_handler: &Option<WriteValuesHandler>,
    read_values_handler: &Option<ReadValuesHandler>,
    validate_paths: bool,
) -> Outgoing {
    match incoming {
        Incoming::WriteValues { values } => {
            // Validate paths if enabled
            if validate_paths {
                let input_paths = registry.get_input_paths().await;
                let invalid_paths: Vec<&str> = values
                    .keys()
                    .filter(|path| !input_paths.iter().any(|p| p == *path))
                    .map(|s| s.as_str())
                    .collect();

                if !invalid_paths.is_empty() {
                    warn!("Invalid paths in WriteValues: {:?}", invalid_paths);
                    return Outgoing::WriteValuesResp {
                        success: false,
                        message: Some(format!("Unknown input path(s): {}", invalid_paths.join(", "))),
                    };
                }
            }

            // Call WriteValues handler if registered
            if let Some(handler) = write_values_handler {
                match handler(values) {
                    Ok(()) => {
                        debug!("WriteValues handled successfully");
                        Outgoing::WriteValuesResp {
                            success: true,
                            message: None,
                        }
                    }
                    Err(e) => {
                        error!("WriteValues handler error: {}", e);
                        Outgoing::WriteValuesResp {
                            success: false,
                            message: Some(e),
                        }
                    }
                }
            } else {
                // No handler registered, just acknowledge
                debug!("No WriteValues handler registered, acknowledging");
                Outgoing::WriteValuesResp {
                    success: true,
                    message: None,
                }
            }
        }

        Incoming::ReadValues { keys } => {
            // Call ReadValues handler if registered
            if let Some(handler) = read_values_handler {
                let values = handler(keys).await;
                Outgoing::ReadValuesResp { values }
            } else {
                // No handler registered, return empty values
                debug!("No ReadValues handler registered, returning empty values");
                Outgoing::ReadValuesResp {
                    values: HashMap::new(),
                }
            }
        }

        Incoming::ListKeys { path } => {
            let keys = registry.get_keys_filtered(path.as_deref()).await;
            Outgoing::ListKeysResp { keys }
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
        assert!(!config.serve_control_panel);
    }

    #[test]
    fn test_server_config_builder() {
        let config = ServerConfig::with_port(8080)
            .bind_address("127.0.0.1")
            .validate_paths(false)
            .serve_control_panel(true);

        assert_eq!(config.port, 8080);
        assert_eq!(config.bind_address, "127.0.0.1");
        assert!(!config.validate_paths);
        assert!(config.serve_control_panel);
    }
}
