use base64::{engine::general_purpose::STANDARD, Engine};
use clap::{Parser, Subcommand};
use log::{info, LevelFilter};
use std::net::TcpListener;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

use arora_websocket::{CancellationToken, NodeInfo, Value};
use std::collections::HashMap;

mod ws_server;
use ws_server::WsServer;

/// Application state
struct AppState {
    ws_server: Arc<WsServer>,
    ws_cancel_token: Mutex<Option<CancellationToken>>,
    port: u16,
    glb_source: Option<String>,
}

/// CLI structure with optional subcommands
#[derive(Parser, Debug, Clone)]
#[command(author, version, about = "Vizij WebSocket-controlled avatar renderer", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// WebSocket server port
    #[arg(short, long, default_value_t = 9000)]
    port: u16,

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
        let is_primary = primary.as_ref().map(|p| p.name() == monitor.name()).unwrap_or(false);

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

/// Start the WebSocket server
#[tauri::command]
async fn start_ws_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let port = state.port;
    let addr = format!("127.0.0.1:{}", port);

    // Check if already running
    {
        let cancel_token = state.ws_cancel_token.lock().await;
        if cancel_token.is_some() {
            return Err("WebSocket server is already running".to_string());
        }
    }

    if TcpListener::bind(&addr).is_err() {
        return Err(format!("Port {} is already in use", port));
    }

    let cancel_token = CancellationToken::new();
    let child_token = cancel_token.child_token();

    // Store the cancel token
    {
        let mut token_guard = state.ws_cancel_token.lock().await;
        *token_guard = Some(cancel_token);
    }

    let ws_server = state.ws_server.clone();
    let app_handle_clone = app_handle.clone();

    // Setup Tauri integration (update handler emits events)
    ws_server.setup_tauri_integration(app_handle.clone()).await;

    // Register the reset method
    ws_server::register_reset_method(&ws_server, app_handle.clone()).await;

    // Spawn the server task
    tokio::spawn(async move {
        if let Err(e) = ws_server.run(child_token).await {
            log::error!("WebSocket server error: {}", e);
        }
        // Emit server stopped event
        let _ = app_handle_clone.emit("ws:stopped", ());
    });

    // Emit server started event with port
    app_handle.emit("ws:started", port).map_err(|e| e.to_string())?;

    info!("WebSocket server started on port {}", port);
    Ok(())
}

/// Stop the WebSocket server
#[tauri::command]
async fn stop_ws_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();

    let mut cancel_token = state.ws_cancel_token.lock().await;
    if let Some(token) = cancel_token.take() {
        token.cancel();
        info!("WebSocket server stop requested");
        Ok(())
    } else {
        Err("WebSocket server is not running".to_string())
    }
}

/// Get the configured port
#[tauri::command]
async fn get_port(app_handle: tauri::AppHandle) -> u16 {
    let state = app_handle.state::<AppState>();
    state.port
}

/// Set available nodes (called by frontend when model loads)
#[tauri::command]
async fn set_nodes(app_handle: tauri::AppHandle, nodes: Vec<NodeInfo>) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let count = nodes.len();
    state.ws_server.set_nodes(nodes).await;
    info!("Nodes updated: {} available", count);
    Ok(())
}

/// Get the GLB source from CLI argument (path or URL)
#[tauri::command]
async fn get_glb_source(app_handle: tauri::AppHandle) -> Option<String> {
    let state = app_handle.state::<AppState>();
    state.glb_source.clone()
}

/// Check if the WebSocket server is running
#[tauri::command]
async fn is_ws_running(app_handle: tauri::AppHandle) -> bool {
    let state = app_handle.state::<AppState>();
    state.ws_server.is_running().await
}

/// Read a local GLB file and return as base64
#[tauri::command]
async fn read_glb_file(path: String) -> Result<String, String> {
    let contents = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(STANDARD.encode(&contents))
}

/// Respond to a GetSlotValues request from the WebSocket server.
/// Called by the frontend after receiving a "get-slot-values-request" event.
#[tauri::command]
fn respond_slot_values(app_handle: tauri::AppHandle, values: HashMap<String, Value>) {
    let state = app_handle.state::<AppState>();
    state.ws_server.respond_slot_values(values);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

            // Set up the application state
            app.manage(AppState {
                ws_server: Arc::new(WsServer::new(port)),
                ws_cancel_token: Mutex::new(None),
                port,
                glb_source: glb_source.clone(),
            });

            info!("Vizij WS App initialized with port {}", port);
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
                            info!("Window size set to monitor resolution: {}x{}", size.width, size.height);
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
                        let y = monitor_pos.y + (monitor_size.height as i32 - cli.height as i32) / 2;
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
            set_nodes,
            get_glb_source,
            read_glb_file,
            respond_slot_values,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
