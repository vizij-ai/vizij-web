use arora_websocket::{Incoming, MethodInfo, NodeInfo, Outgoing, Value};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;

/// Handler function type for method invocations.
/// Takes args and returns (success, optional return value, optional error message).
pub type MethodHandler =
    Box<dyn Fn(HashMap<String, Value>) -> (bool, Option<Value>, Option<String>) + Send + Sync>;

/// Shared state for the WebSocket server
pub struct WsServerState {
    pub nodes: RwLock<Vec<NodeInfo>>,
    pub methods: RwLock<Vec<MethodInfo>>,
    pub method_handlers: RwLock<HashMap<String, Arc<MethodHandler>>>,
    pub is_running: RwLock<bool>,
}

impl Default for WsServerState {
    fn default() -> Self {
        Self {
            nodes: RwLock::new(vec![]),
            methods: RwLock::new(vec![]),
            method_handlers: RwLock::new(HashMap::new()),
            is_running: RwLock::new(false),
        }
    }
}

impl WsServerState {
    /// Register a method that can be invoked via the WebSocket protocol.
    pub async fn register_method<F>(&self, info: MethodInfo, handler: F)
    where
        F: Fn(HashMap<String, Value>) -> (bool, Option<Value>, Option<String>) + Send + Sync + 'static,
    {
        let path = info.path.clone();
        self.methods.write().await.push(info);
        self.method_handlers
            .write()
            .await
            .insert(path, Arc::new(Box::new(handler)));
    }
}

/// Handle a single WebSocket connection
async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    app_handle: AppHandle,
    state: Arc<Mutex<WsServerState>>,
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

                match serde_json::from_str::<Incoming>(&text) {
                    Ok(incoming) => {
                        let response = match incoming {
                            Incoming::Update { values } => {
                                // Validate paths against known input nodes
                                let known_paths: Vec<String> = {
                                    let state_guard = state.lock().await;
                                    let known_nodes = state_guard.nodes.read().await;
                                    known_nodes
                                        .iter()
                                        .filter(|n| n.kind.as_deref() == Some("input"))
                                        .map(|n| n.path.clone())
                                        .collect()
                                };

                                // Check for invalid paths
                                let invalid_paths: Vec<&str> = values
                                    .keys()
                                    .filter(|path| !known_paths.iter().any(|p| p == *path))
                                    .map(|s| s.as_str())
                                    .collect();

                                if !invalid_paths.is_empty() {
                                    warn!("Invalid paths in update: {:?}", invalid_paths);
                                    Outgoing::UpdateResp {
                                        success: false,
                                        message: Some(format!(
                                            "Unknown input path(s): {}",
                                            invalid_paths.join(", ")
                                        )),
                                    }
                                } else if let Err(e) = app_handle.emit("update-values", &values) {
                                    error!("Failed to emit update-values: {}", e);
                                    Outgoing::UpdateResp {
                                        success: false,
                                        message: Some(format!("Failed to emit: {}", e)),
                                    }
                                } else {
                                    debug!("Emitted update-values with {} values", values.len());
                                    Outgoing::UpdateResp {
                                        success: true,
                                        message: None,
                                    }
                                }
                            }
                            Incoming::ListNodes { path } => {
                                let state = state.lock().await;
                                let all_nodes = state.nodes.read().await.clone();

                                // Filter nodes by path prefix if provided
                                let filtered_nodes = match path {
                                    Some(prefix) => {
                                        let prefix = prefix.trim_end_matches('/');
                                        all_nodes
                                            .into_iter()
                                            .filter(|node| {
                                                node.path.starts_with(prefix)
                                                    || node.path.starts_with(&format!("{}/", prefix))
                                            })
                                            .collect()
                                    }
                                    None => all_nodes,
                                };

                                Outgoing::ListNodesResp {
                                    nodes: filtered_nodes,
                                }
                            }
                            Incoming::ListMethods { path } => {
                                let state = state.lock().await;
                                let all_methods = state.methods.read().await.clone();

                                // Filter methods by path prefix if provided
                                let filtered_methods = match path {
                                    Some(prefix) => {
                                        let prefix = prefix.trim_end_matches('/');
                                        all_methods
                                            .into_iter()
                                            .filter(|method| {
                                                method.path.starts_with(prefix)
                                                    || method.path.starts_with(&format!("{}/", prefix))
                                            })
                                            .collect()
                                    }
                                    None => all_methods,
                                };

                                Outgoing::ListMethodsResp {
                                    methods: filtered_methods,
                                }
                            }
                            Incoming::Invoke {
                                method,
                                args,
                                request_id,
                            } => {
                                let state = state.lock().await;
                                let handlers = state.method_handlers.read().await;

                                if let Some(handler) = handlers.get(&method) {
                                    let handler = handler.clone();
                                    drop(handlers);
                                    drop(state);

                                    let (success, value, message) = handler(args);
                                    Outgoing::InvokeResp {
                                        success,
                                        request_id,
                                        value,
                                        message,
                                    }
                                } else {
                                    Outgoing::InvokeResp {
                                        success: false,
                                        request_id,
                                        value: None,
                                        message: Some(format!("Method not found: {}", method)),
                                    }
                                }
                            }
                        };

                        let response_text = serde_json::to_string(&response).unwrap();
                        if let Err(e) = write.send(Message::Text(response_text.into())).await {
                            error!("Failed to send response: {}", e);
                            break;
                        }
                    }
                    Err(e) => {
                        warn!("Failed to parse message: {}", e);
                        let response = Outgoing::Error {
                            request_id: None,
                            message: format!("Invalid message format: {}", e),
                        };
                        let response_text = serde_json::to_string(&response).unwrap();
                        if let Err(e) = write.send(Message::Text(response_text.into())).await {
                            error!("Failed to send error response: {}", e);
                            break;
                        }
                    }
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
                // Ignore other message types (Binary, Pong, Frame)
            }
            Err(e) => {
                error!("Error reading message: {}", e);
                break;
            }
        }
    }

    info!("Connection closed for: {}", addr);
}

/// Start the WebSocket server
pub async fn run_server(
    port: u16,
    app_handle: AppHandle,
    state: Arc<Mutex<WsServerState>>,
    cancel_token: tokio_util::sync::CancellationToken,
) -> Result<(), String> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind to {}: {}", addr, e))?;

    info!("WebSocket server listening on ws://{}", addr);

    // Mark server as running
    {
        let state = state.lock().await;
        *state.is_running.write().await = true;
    }

    loop {
        tokio::select! {
            result = listener.accept() => {
                match result {
                    Ok((stream, addr)) => {
                        let app_handle = app_handle.clone();
                        let state = state.clone();
                        tokio::spawn(async move {
                            handle_connection(stream, addr, app_handle, state).await;
                        });
                    }
                    Err(e) => {
                        error!("Failed to accept connection: {}", e);
                    }
                }
            }
            _ = cancel_token.cancelled() => {
                info!("WebSocket server shutting down");
                break;
            }
        }
    }

    // Mark server as not running
    {
        let state = state.lock().await;
        *state.is_running.write().await = false;
    }

    Ok(())
}
