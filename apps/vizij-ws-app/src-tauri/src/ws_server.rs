use arora_websocket::{Type, Value};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, RwLock};
use tokio_tungstenite::tungstenite::Message;

/// Messages received from WebSocket clients
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum IncomingMessage {
    /// Update values on the model using arora-types Value
    Update { values: HashMap<String, Value> },
    /// Reset the model to default state
    Reset,
    /// Request the list of available nodes (with optional path filter)
    ListNodes { path: Option<String> },
}

/// Node metadata returned in list_nodes response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NodeInfo {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    /// The arora-types Type that this node accepts
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<Type>,
    /// Minimum value constraint (for numeric types)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    /// Maximum value constraint (for numeric types)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
    /// Default value as an arora-types Value
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub default_value: Option<Value>,
}

/// Messages sent to WebSocket clients
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutgoingMessage {
    /// List of available nodes
    Nodes { nodes: Vec<NodeInfo> },
    /// Acknowledgment
    Ack { success: bool, message: Option<String> },
}

/// Shared state for the WebSocket server
pub struct WsServerState {
    pub tracks: RwLock<Vec<String>>,
    pub nodes: RwLock<Vec<NodeInfo>>,
    pub is_running: RwLock<bool>,
}

impl Default for WsServerState {
    fn default() -> Self {
        Self {
            tracks: RwLock::new(vec![]),
            nodes: RwLock::new(vec![]),
            is_running: RwLock::new(false),
        }
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

                match serde_json::from_str::<IncomingMessage>(&text) {
                    Ok(incoming) => {
                        let response = match incoming {
                            IncomingMessage::Update { values } => {
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
                                    OutgoingMessage::Ack {
                                        success: false,
                                        message: Some(format!(
                                            "Unknown input path(s): {}",
                                            invalid_paths.join(", ")
                                        )),
                                    }
                                } else if let Err(e) = app_handle.emit("update-values", &values) {
                                    error!("Failed to emit update-values: {}", e);
                                    OutgoingMessage::Ack {
                                        success: false,
                                        message: Some(format!("Failed to emit: {}", e)),
                                    }
                                } else {
                                    debug!("Emitted update-values with {} values", values.len());
                                    OutgoingMessage::Ack {
                                        success: true,
                                        message: None,
                                    }
                                }
                            }
                            IncomingMessage::Reset => {
                                // Emit reset event to frontend
                                if let Err(e) = app_handle.emit("reset", ()) {
                                    error!("Failed to emit reset: {}", e);
                                    OutgoingMessage::Ack {
                                        success: false,
                                        message: Some(format!("Failed to emit: {}", e)),
                                    }
                                } else {
                                    debug!("Emitted reset event");
                                    OutgoingMessage::Ack {
                                        success: true,
                                        message: None,
                                    }
                                }
                            }
                            IncomingMessage::ListNodes { path } => {
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

                                OutgoingMessage::Nodes { nodes: filtered_nodes }
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
                        let response = OutgoingMessage::Ack {
                            success: false,
                            message: Some(format!("Invalid message format: {}", e)),
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
