use base64::{engine::general_purpose::STANDARD, Engine};
use clap::Parser;
use log::{info, LevelFilter};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

mod ws_server;
use ws_server::WsServerState;

/// Application state
struct AppState {
    ws_state: Arc<Mutex<WsServerState>>,
    ws_cancel_token: Mutex<Option<CancellationToken>>,
    port: u16,
    glb_source: Option<String>,
}

/// Command line arguments
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// WebSocket server port
    #[arg(short, long, default_value_t = 9000)]
    port: u16,

    /// GLB file path or URL to load on startup
    #[arg(short, long)]
    glb: Option<String>,
}

/// Start the WebSocket server
#[tauri::command]
async fn start_ws_server(app_handle: tauri::AppHandle) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let port = state.port;

    // Check if already running
    {
        let cancel_token = state.ws_cancel_token.lock().await;
        if cancel_token.is_some() {
            return Err("WebSocket server is already running".to_string());
        }
    }

    let cancel_token = CancellationToken::new();
    let child_token = cancel_token.child_token();

    // Store the cancel token
    {
        let mut token_guard = state.ws_cancel_token.lock().await;
        *token_guard = Some(cancel_token);
    }

    let ws_state = state.ws_state.clone();
    let app_handle_clone = app_handle.clone();

    // Spawn the server task
    tokio::spawn(async move {
        if let Err(e) = ws_server::run_server(port, app_handle_clone.clone(), ws_state, child_token).await {
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

/// Get available tracks (placeholder)
#[tauri::command]
async fn get_tracks(app_handle: tauri::AppHandle) -> Vec<String> {
    let state = app_handle.state::<AppState>();
    let ws_state = state.ws_state.lock().await;
    let tracks = ws_state.tracks.read().await.clone();
    tracks
}

/// Set available tracks (for external integration)
#[tauri::command]
async fn set_tracks(app_handle: tauri::AppHandle, tracks: Vec<String>) -> Result<(), String> {
    let state = app_handle.state::<AppState>();
    let ws_state = state.ws_state.lock().await;
    *ws_state.tracks.write().await = tracks;
    info!("Tracks updated");
    Ok(())
}

/// Get the GLB source from CLI argument (path or URL)
#[tauri::command]
async fn get_glb_source(app_handle: tauri::AppHandle) -> Option<String> {
    let state = app_handle.state::<AppState>();
    state.glb_source.clone()
}

/// Read a local GLB file and return as base64
#[tauri::command]
async fn read_glb_file(path: String) -> Result<String, String> {
    let contents = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(STANDARD.encode(&contents))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Parse command line arguments
    let args = Args::parse();

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(move |app| {
            let port = args.port;
            let glb_source = args.glb.clone();

            // Set up the application state
            app.manage(AppState {
                ws_state: Arc::new(Mutex::new(WsServerState::default())),
                ws_cancel_token: Mutex::new(None),
                port,
                glb_source: glb_source.clone(),
            });

            info!("Vizij WS App initialized with port {}", port);
            if let Some(ref src) = glb_source {
                info!("GLB source: {}", src);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_ws_server,
            stop_ws_server,
            get_port,
            get_tracks,
            set_tracks,
            get_glb_source,
            read_glb_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
