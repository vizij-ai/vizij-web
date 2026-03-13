use base64::{engine::general_purpose::STANDARD, Engine};
use clap::{Parser, Subcommand};
use log::{info, LevelFilter};
use serde::{Deserialize, Serialize};
use std::net::TcpListener;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

use std::collections::HashMap;

mod connection;
mod connection_manager;
mod ws_server;

use connection::{CancellationToken, SlotInfo, Value};
use connection_manager::ConnectionManager;
use ws_server::WsServer;

/// Application state
struct AppState {
    connection_manager: Arc<ConnectionManager>,
    cancel_token: Mutex<Option<CancellationToken>>,
    port: u16,
    web_port: Option<u16>,
    glb_source: Option<String>,
    deepgram_key: Option<String>,
    openai_key: Option<String>,
    api_url: Option<String>,
    auto_mic: Option<bool>,
    speech_mode: Option<String>,
    silence_ms: Option<u32>,
    mic_muted: std::sync::Mutex<bool>,
    transport_catalog: std::sync::Mutex<TransportCatalog>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct TransportCatalog {
    animations: Vec<TransportEntry>,
    programs: Vec<TransportEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TransportEntry {
    id: String,
    label: String,
    state: String,
}

/// CLI structure with optional subcommands
#[derive(Parser, Debug, Clone)]
#[command(author, version, about = "Vizij standalone avatar renderer", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// WebSocket server port
    #[arg(short, long, default_value_t = 9000)]
    port: u16,

    /// Disable web-based remote control panel (served on the same port as the WebSocket server)
    #[arg(long, default_value_t = false)]
    no_web_control: bool,

    /// GLB file path or URL to load on startup
    #[arg(short, long)]
    glb: Option<String>,

    /// Start in fullscreen mode
    #[arg(short, long, default_value_t = false)]
    fullscreen: bool,

    /// Display/monitor index (0 = primary, 1 = secondary, etc.)
    #[arg(short, long)]
    display: Option<usize>,

    /// Window width in pixels (ignored if fullscreen)
    #[arg(short = 'W', long, default_value_t = 800)]
    width: u32,

    /// Window height in pixels (ignored if fullscreen)
    #[arg(short = 'H', long, default_value_t = 600)]
    height: u32,

    /// Hide window decorations (title bar, borders)
    #[arg(long, default_value_t = false)]
    no_decorations: bool,

    /// Keep window always on top
    #[arg(long, default_value_t = false)]
    always_on_top: bool,

    /// Deepgram API key for speech-to-text
    #[arg(long)]
    deepgram_key: Option<String>,

    /// OpenAI API key for LLM conversation
    #[arg(long)]
    openai_key: Option<String>,

    /// API base URL for TTS service (e.g., http://localhost:3001)
    #[arg(long)]
    api_url: Option<String>,

    /// Auto-activate microphone on load (overrides bundle config)
    #[arg(long)]
    auto_mic: Option<bool>,

    /// Speech mode: "echo" (repeat back) or "conversation" (LLM-powered)
    #[arg(long)]
    speech_mode: Option<String>,

    /// ROS2 domain ID (requires --features ros2)
    #[cfg(feature = "ros2")]
    #[arg(long, default_value_t = 0)]
    ros2_domain_id: u16,

    /// ROS2 namespace for topics and services (requires --features ros2)
    #[cfg(feature = "ros2")]
    #[arg(long, default_value = "vizij")]
    ros2_namespace: String,

    /// Silence duration in milliseconds before auto-stopping the microphone (server-side VAD).
    /// Defaults to 1500ms in conversation mode. Set to 0 to disable.
    #[arg(long)]
    silence_ms: Option<u32>,
}

#[derive(Subcommand, Debug, Clone)]
enum Commands {
    /// List available displays/monitors and exit
    ListDisplays,
}

/// Attach to parent console on Windows (needed for CLI output in GUI apps)
#[cfg(windows)]
fn attach_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

#[cfg(not(windows))]
fn attach_console() {}

/// List available displays using tao (Tauri's windowing library)
fn list_displays() {
    attach_console();

    use tao::event_loop::EventLoop;

    let event_loop = EventLoop::new();
    let monitors: Vec<_> = event_loop.available_monitors().collect();
    let primary = event_loop.primary_monitor();

    println!("Available displays:\n");

    for (idx, monitor) in monitors.iter().enumerate() {
        let size = monitor.size();
        let pos = monitor.position();
        let scale = monitor.scale_factor();
        let name = monitor.name().unwrap_or_else(|| "Unknown".to_string());
        let is_primary = primary
            .as_ref()
            .map(|p| p.name() == monitor.name())
            .unwrap_or(false);

        println!(
            "  Display {}: {}{}",
            idx,
            name,
            if is_primary { " (primary)" } else { "" }
        );
        println!("    Resolution: {}x{}", size.width, size.height);
        println!("    Position:   ({}, {})", pos.x, pos.y);
        println!("    Scale:      {:.2}x", scale);
        println!();
    }

    if monitors.is_empty() {
        println!("  No displays found.");
    } else {
        println!("Use --display <INDEX> to select a display (e.g., --display 1)");
    }
}

fn warn_if_snap_env() {
    let snap_name = std::env::var("SNAP_NAME").ok();
    let snap = std::env::var("SNAP").ok();
    let vscode_snap = std::env::var("VSCODE_SNAP_ORIG").ok();

    if snap_name.is_some() || snap.is_some() || vscode_snap.is_some() {
        log::warn!(
            "Detected Snap environment. If the app fails to start with a libpthread/glibc error, run it from a non-snap terminal (e.g. apt-installed gnome-terminal)."
        );
    }
}

async fn start_connection_servers_internal(
    app_handle: tauri::AppHandle,
    emit_started_event: bool,
) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let port = state.port;
    let addr = format!("127.0.0.1:{}", port);

    {
        let cancel_token = state.cancel_token.lock().await;
        if cancel_token.is_some() {
            return Ok(());
        }
    }

    if TcpListener::bind(&addr).is_err() {
        return Err(format!("Port {} is already in use", port));
    }

    let cancel_token = CancellationToken::new();

    {
        let mut token_guard = state.cancel_token.lock().await;
        *token_guard = Some(cancel_token.clone());
    }

    let manager = state.connection_manager.clone();
    let app_handle_clone = app_handle.clone();

    manager.setup_all(app_handle.clone()).await;
    let handles = manager.run_all(cancel_token);

    tokio::spawn(async move {
        for handle in handles {
            let _ = handle.await;
        }
        let _ = app_handle_clone.emit("ws:stopped", ());
    });

    if emit_started_event {
        app_handle
            .emit("ws:started", port)
            .map_err(|e| e.to_string())?;
    }

    info!("Connection servers started (WS port: {})", port);
    Ok(())
}

/// Start connection servers
#[tauri::command]
async fn start_ws_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    start_connection_servers_internal(app_handle, true).await
}

/// Stop connection servers
#[tauri::command]
async fn stop_ws_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();

    let mut cancel_token = state.cancel_token.lock().await;
    if let Some(token) = cancel_token.take() {
        token.cancel();
        info!("Connection servers stop requested");
        Ok(())
    } else {
        Err("Connection servers are not running".to_string())
    }
}

/// Get the configured port
#[tauri::command]
async fn get_port(app_handle: tauri::AppHandle) -> u16 {
    let state = app_handle.state::<AppState>();
    state.port
}

/// Set available slots (called by frontend when model loads)
#[tauri::command]
async fn set_slots(app_handle: tauri::AppHandle, slots: Vec<SlotInfo>) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let count = slots.len();
    state.connection_manager.set_slots(slots).await;
    info!("Slots updated: {} available", count);
    Ok(())
}

/// Get the GLB source from CLI argument (path or URL)
#[tauri::command]
async fn get_glb_source(app_handle: tauri::AppHandle) -> Option<String> {
    let state = app_handle.state::<AppState>();
    state.glb_source.clone()
}

/// Check if any connection server is running
#[tauri::command]
async fn is_ws_running(app_handle: tauri::AppHandle) -> bool {
    let state = app_handle.state::<AppState>();
    state.connection_manager.is_any_running().await
}

/// Read a local GLB file and return as base64
#[tauri::command]
async fn read_glb_file(path: String) -> Result<String, String> {
    let contents = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(STANDARD.encode(&contents))
}

/// Respond to a GetSlotValues request from the connection.
/// Called by the frontend after receiving a "get-slot-values-request" event.
#[tauri::command]
fn respond_slot_values(app_handle: tauri::AppHandle, values: HashMap<String, Value>) {
    let state = app_handle.state::<AppState>();
    state.connection_manager.respond_slot_values(values);
}

/// Get the web control port (None if web control is disabled)
#[tauri::command]
async fn get_web_port(app_handle: tauri::AppHandle) -> Option<u16> {
    let state = app_handle.state::<AppState>();
    state.web_port
}

/// Get speech-related API keys/URLs from CLI flags
#[tauri::command]
async fn get_speech_keys(app_handle: tauri::AppHandle) -> HashMap<String, String> {
    let state = app_handle.state::<AppState>();
    let mut keys = HashMap::new();
    if let Some(ref key) = state.deepgram_key {
        keys.insert("deepgramKey".to_string(), key.clone());
    }
    if let Some(ref key) = state.openai_key {
        keys.insert("openaiKey".to_string(), key.clone());
    }
    if let Some(ref url) = state.api_url {
        keys.insert("apiUrl".to_string(), url.clone());
    }
    if let Some(auto_mic) = state.auto_mic {
        keys.insert("autoMic".to_string(), auto_mic.to_string());
    }
    if let Some(ref mode) = state.speech_mode {
        keys.insert("speechMode".to_string(), mode.clone());
    }
    if let Some(silence_ms) = state.silence_ms {
        keys.insert("silenceMs".to_string(), silence_ms.to_string());
    }
    keys
}

/// Update the mic muted state (called from frontend to keep Rust state in sync)
#[tauri::command]
async fn set_mic_muted_state(app_handle: tauri::AppHandle, muted: bool) {
    let state = app_handle.state::<AppState>();
    *state.mic_muted.lock().unwrap() = muted;
}

#[tauri::command]
async fn set_transport_catalog(
    app_handle: tauri::AppHandle,
    catalog: TransportCatalog,
) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    *state.transport_catalog.lock().unwrap() = catalog;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file (silently ignore if not found)
    dotenvy::dotenv().ok();

    // Parse command line arguments
    let cli = Cli::parse();

    // Handle subcommands that exit early
    if let Some(Commands::ListDisplays) = cli.command {
        list_displays();
        return;
    }

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            warn_if_snap_env();
            let port = cli.port;
            // Resolve relative paths to absolute paths (URLs are passed through unchanged)
            let glb_source = cli.glb.clone().map(|src| {
                if src.starts_with("http://") || src.starts_with("https://") {
                    src
                } else {
                    // Fix over-escaped backslashes from npm/pnpm on Windows
                    // Each layer doubles backslashes: \ -> \\ -> \\\\ -> \\\\\\\\
                    let mut normalized = src;
                    while normalized.contains("\\\\") {
                        normalized = normalized.replace("\\\\", "\\");
                    }
                    // Try to canonicalize the path to an absolute path
                    std::fs::canonicalize(&normalized)
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or(normalized)
                }
            });

            // Set up connection manager with all connection interfaces
            let serve_web_control = !cli.no_web_control;
            let mut manager = ConnectionManager::new();
            manager.add_connection(Arc::new(WsServer::new(port, serve_web_control)));

            #[cfg(feature = "ros2")]
            {
                let ros2_node = arora_ros2::AroraRos2Node::new(
                    &cli.ros2_namespace,
                    cli.ros2_domain_id,
                );
                manager.add_connection(Arc::new(ros2_node));
                info!(
                    "ROS2 node configured (domain_id={}, namespace={})",
                    cli.ros2_domain_id, cli.ros2_namespace
                );
            }

            let web_port = if serve_web_control {
                Some(port)
            } else {
                None
            };

            // CLI flags > env vars > VITE_ prefixed env vars (from .env file)
            let deepgram_key = cli
                .deepgram_key
                .clone()
                .or_else(|| std::env::var("DEEPGRAM_KEY").ok())
                .or_else(|| std::env::var("VITE_DEEPGRAM_API_KEY").ok());
            let openai_key = cli
                .openai_key
                .clone()
                .or_else(|| std::env::var("OPENAI_KEY").ok())
                .or_else(|| std::env::var("VITE_OPENAI_API_KEY").ok());
            let api_url = cli
                .api_url
                .clone()
                .or_else(|| std::env::var("API_URL").ok())
                .or_else(|| std::env::var("VITE_API_URL").ok());
            let auto_mic = cli.auto_mic.or_else(|| {
                std::env::var("AUTO_MIC")
                    .ok()
                    .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
            });
            let speech_mode = cli
                .speech_mode
                .clone()
                .or_else(|| std::env::var("SPEECH_MODE").ok());
            let silence_ms = cli.silence_ms.or_else(|| {
                std::env::var("SILENCE_MS")
                    .ok()
                    .and_then(|v| v.parse::<u32>().ok())
            });

            app.manage(AppState {
                connection_manager: Arc::new(manager),
                cancel_token: Mutex::new(None),
                port,
                web_port,
                glb_source: glb_source.clone(),
                deepgram_key,
                openai_key,
                api_url,
                auto_mic,
                speech_mode,
                silence_ms,
                mic_muted: std::sync::Mutex::new(true),
                transport_catalog: std::sync::Mutex::new(TransportCatalog::default()),
            });

            let startup_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = start_connection_servers_internal(startup_handle, false).await {
                    log::error!(
                        "Failed to start connection servers during app setup: {}",
                        error
                    );
                }
            });

            info!("Vizij Standalone App initialized with WS port {}", port);
            if serve_web_control {
                info!("Web control panel will be available at http://<ip>:{}", port);
            }
            if let Some(ref src) = glb_source {
                info!("GLB source: {}", src);
            }

            // Configure window based on CLI arguments
            if let Some(window) = app.get_webview_window("main") {
                // Get available monitors
                let monitors: Vec<_> = window.available_monitors().unwrap_or_default();

                // Select target monitor
                let target_monitor = if let Some(display_idx) = cli.display {
                    monitors.get(display_idx).cloned().or_else(|| {
                        info!("Display {} not found, using primary", display_idx);
                        window.primary_monitor().ok().flatten()
                    })
                } else {
                    window.primary_monitor().ok().flatten()
                };

                // Apply window settings
                if cli.fullscreen {
                    // For fullscreen: first move to target monitor, set size, then go fullscreen
                    if let Some(ref monitor) = target_monitor {
                        let pos = monitor.position();
                        let size = monitor.size();

                        // Move window to target monitor first
                        if let Err(e) = window.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition::new(pos.x, pos.y),
                        )) {
                            log::error!("Failed to move window to display: {}", e);
                        } else if let Some(idx) = cli.display {
                            info!("Window moved to display {}", idx);
                        }

                        // Set window size to match monitor's native resolution
                        if let Err(e) = window.set_size(tauri::Size::Physical(
                            tauri::PhysicalSize::new(size.width, size.height),
                        )) {
                            log::error!("Failed to set window size: {}", e);
                        } else {
                            info!(
                                "Window size set to monitor resolution: {}x{}",
                                size.width, size.height
                            );
                        }
                    }

                    // Now enable fullscreen
                    if let Err(e) = window.set_fullscreen(true) {
                        log::error!("Failed to set fullscreen: {}", e);
                    } else {
                        info!("Fullscreen mode enabled");
                    }
                } else {
                    // Set window size
                    if let Err(e) = window.set_size(tauri::Size::Physical(
                        tauri::PhysicalSize::new(cli.width, cli.height),
                    )) {
                        log::error!("Failed to set window size: {}", e);
                    } else {
                        info!("Window size: {}x{}", cli.width, cli.height);
                    }

                    // Center on target monitor
                    if let Some(monitor) = target_monitor {
                        let monitor_pos = monitor.position();
                        let monitor_size = monitor.size();
                        let x = monitor_pos.x + (monitor_size.width as i32 - cli.width as i32) / 2;
                        let y =
                            monitor_pos.y + (monitor_size.height as i32 - cli.height as i32) / 2;
                        if let Err(e) = window.set_position(tauri::Position::Physical(
                            tauri::PhysicalPosition::new(x, y),
                        )) {
                            log::error!("Failed to position window: {}", e);
                        } else if let Some(idx) = cli.display {
                            info!("Window centered on display {}", idx);
                        }
                    }
                }

                // Apply decorations setting
                if cli.no_decorations {
                    if let Err(e) = window.set_decorations(false) {
                        log::error!("Failed to hide decorations: {}", e);
                    } else {
                        info!("Window decorations hidden");
                    }
                }

                // Apply always on top setting
                if cli.always_on_top {
                    if let Err(e) = window.set_always_on_top(true) {
                        log::error!("Failed to set always on top: {}", e);
                    } else {
                        info!("Window set to always on top");
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_ws_server,
            stop_ws_server,
            is_ws_running,
            get_port,
            get_web_port,
            set_slots,
            get_glb_source,
            read_glb_file,
            respond_slot_values,
            get_speech_keys,
            set_mic_muted_state,
            set_transport_catalog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
