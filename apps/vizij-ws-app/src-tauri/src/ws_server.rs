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
    /// Update values on the 3D model
    Update { values: HashMap<String, f64> },
    /// Reset the model to default state
    Reset,
    /// Request the list of available tracks
    GetTracks,
}

/// Messages sent to WebSocket clients
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum OutgoingMessage {
    /// List of available tracks
    Tracks { tracks: Vec<String> },
    /// Acknowledgment
    Ack { success: bool, message: Option<String> },
}

/// Shared state for the WebSocket server
pub struct WsServerState {
    pub tracks: RwLock<Vec<String>>,
    pub is_running: RwLock<bool>,
}

impl Default for WsServerState {
    fn default() -> Self {
        Self {
            tracks: RwLock::new(vec![
                "placeholder_track_1".to_string(),
                "placeholder_track_2".to_string(),
            ]),
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
                                // Emit update-values event to frontend
                                if let Err(e) = app_handle.emit("update-values", &values) {
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
                            IncomingMessage::GetTracks => {
                                let state = state.lock().await;
                                let tracks = state.tracks.read().await.clone();
                                OutgoingMessage::Tracks { tracks }
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
