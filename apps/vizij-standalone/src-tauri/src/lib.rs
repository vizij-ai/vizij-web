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
    /// Studio-bridge owner state (channel to the bridge thread + the current
    /// answer). Present only when built with the `studio-bridge` feature.
    #[cfg(feature = "studio-bridge")]
    studio: StudioBridgeState,
}

/// State backing the in-UI "who owns this device" prompt for the studio-bridge
/// feature. `owners_tx` pushes a new owner list to the bridge thread so it can
/// re-register live (no restart); `needs_prompt`/`owners` back the
/// `studio_bridge_owner_status` command the React modal reads on mount.
#[cfg(feature = "studio-bridge")]
struct StudioBridgeState {
    owners_tx: tokio::sync::watch::Sender<Vec<String>>,
    needs_prompt: std::sync::Mutex<bool>,
    owners: std::sync::Mutex<Vec<String>>,
}

/// Reported to the frontend by `studio_bridge_owner_status`. `active` = the app
/// was built with the studio-bridge feature; `needs_prompt` = active AND no
/// owner is known yet (no `DEVICE_OWNERS`, no persisted choice), so the modal
/// should ask.
#[derive(Debug, Clone, Serialize)]
struct StudioOwnerStatus {
    active: bool,
    needs_prompt: bool,
    owners: Vec<String>,
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

    /// Log level (error, warn, info, debug, trace)
    #[arg(long, default_value = "info")]
    log_level: LevelFilter,

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
#[cfg(all(desktop, windows))]
fn attach_console() {
    use windows::Win32::System::Console::{AttachConsole, ATTACH_PARENT_PROCESS};
    unsafe {
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

#[cfg(all(desktop, not(windows)))]
fn attach_console() {}

/// List available displays using tao (Tauri's windowing library)
#[cfg(desktop)]
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

/// The Studio device info this app registers with. Fully self-describing except
/// for ownership: the model family is `Vizij` and the software version is
/// `vizij-standalone-<crate version>`; hardware version is left empty. `name`
/// (a stable `vizij-<random>` generated once per launch) and `owners` are passed
/// in, because both must stay identical across re-registrations — regenerating
/// the name would register a *different* device, and `owners` changes live when
/// the user answers the in-UI prompt.
///
/// `owners` is the list of Semio Studio user IDs (Firebase UIDs) that own — and
/// therefore see and claim — this device; empty means it registers unowned.
#[cfg(feature = "studio-bridge")]
fn studio_device_info(name: String, owners: Vec<String>) -> arora_bridge::DeviceInfo {
    arora_bridge::DeviceInfo {
        name: Some(name),
        description: None,
        model_family: Some("Vizij".to_string()),
        hardware_version: None,
        software_version: Some(concat!("vizij-standalone-", env!("CARGO_PKG_VERSION")).to_string()),
        owners,
    }
}

/// Parse a comma-separated owner list (from `DEVICE_OWNERS` or the UI input),
/// trimming whitespace and dropping empty entries.
#[cfg(feature = "studio-bridge")]
fn parse_owners(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|o| o.trim().to_string())
        .filter(|o| !o.is_empty())
        .collect()
}

/// Path of the persisted owner file (`app_local_data_dir()/studio_owners.json`,
/// a JSON array of UID strings). Persisting Rust-side lets the bridge thread read
/// the saved owners at startup without waiting on the webview.
#[cfg(feature = "studio-bridge")]
fn studio_owners_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("studio_owners.json"))
}

/// Read the persisted owner list. Returns `Some(vec)` when the file exists (even
/// if it is an empty array — an explicit "register unowned" choice that must NOT
/// re-prompt), and `None` when no choice has ever been persisted.
#[cfg(feature = "studio-bridge")]
fn read_persisted_owners(app: &tauri::AppHandle) -> Option<Vec<String>> {
    let path = studio_owners_file(app).ok()?;
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice::<Vec<String>>(&bytes).ok()
}

/// Persist the owner list so the choice survives restarts and the modal never
/// asks again.
#[cfg(feature = "studio-bridge")]
fn persist_studio_owners(app: &tauri::AppHandle, owners: &[String]) -> Result<(), String> {
    let path = studio_owners_file(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec(owners).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// A short random lowercase-alphanumeric suffix for the generated device name,
/// so each launch registers a distinct `vizij-<suffix>` with no configuration.
/// Seeded from the OS via `RandomState` (no extra dependency).
#[cfg(feature = "studio-bridge")]
fn random_device_suffix() -> String {
    use std::hash::{BuildHasher, Hasher};
    let mut hasher = std::collections::hash_map::RandomState::new().build_hasher();
    hasher.write_u64(std::process::id() as u64);
    let mut value = hasher.finish();
    const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut suffix = String::with_capacity(8);
    for _ in 0..8 {
        suffix.push(ALPHABET[(value % 36) as usize] as char);
        value /= 36;
    }
    suffix
}

/// Connect this standalone to the Semio Studio Bridge (opt-in `studio-bridge`
/// feature) so a Studio can connect *to* the running app — the VIZ-67 producer
/// side. The host reaches the bridge **outbound** over Zenoh (VIZ-13: Android
/// can't host a WS server / do UDP discovery, so the device dials the bridge),
/// authenticates with Firebase, and registers the device.
///
/// This reuses the exact studio-bridge device client (`ZenohDeviceClient`,
/// which implements arora's `Bridge`) — no second transport, no config layer of
/// our own. The published client crate bakes in the public Firebase config and
/// the production bridge endpoint, so this is zero-config: nothing to set for a
/// normal build. Optional runtime overrides for testing/ownership: `.env`
/// Firebase (emulator), `ZENOH_ENDPOINTS` (a non-production bridge), and
/// `DEVICE_OWNERS`/`DEVICE_NAME`/… (device registration).
///
/// The client runs on its own thread with a private Tokio runtime and is kept
/// alive for the process lifetime, so its Zenoh session and registration
/// persist.
///
/// OPEN (VIZ-67): the bridge is connected and registered but not yet *fed* the
/// standalone's live data. Vizij's runtime is the `arora-web` **wasm** runtime
/// in the webview, and this Studio client is native-only (Zenoh/Firestore), so
/// it cannot run there. Attaching it to that runtime is one call —
/// `Arora::builder().with_bridge(studio_bridge)` — for which arora exposes the
/// injectable constructor `arora::studio::connect()`; wiring it requires either
/// hosting the Arora runtime natively in this host (sharing its store) or an
/// `arora-web` bridge seam. It is deliberately kept off the critical path here:
/// depending on the `arora` engine crate would drag the whole standalone onto a
/// nightly `-Z bindeps` toolchain (its manifest carries an artifact bindep).
///
/// Ownership is resolved *before* connecting: the initial owner list (from
/// `DEVICE_OWNERS`, else a persisted choice, else empty) is registered up front,
/// and `owners_rx` delivers a fresh list whenever the user answers the in-UI
/// prompt — the device is then re-registered live under the same name (no
/// restart). The device connects regardless of ownership; only what Studio
/// accounts *see* it depends on the answer.
#[cfg(feature = "studio-bridge")]
fn spawn_studio_bridge(
    mut owners_rx: tokio::sync::watch::Receiver<Vec<String>>,
    initial_owners: Vec<String>,
) {
    use arora_bridge::Bridge;
    use arora_studio_bridge_client::firestore_support::options::{
        FirebaseEmulatorOptions, FirebaseOptions,
    };
    use arora_studio_bridge_client::zenoh::ZenohDeviceClient;

    // The public Firebase config AND the production bridge endpoint are baked
    // into the published `arora-studio-bridge-client` crate itself (via its
    // `FirebaseOptions::from_env` baked fallback + `ZenohDeviceClient::new`), so
    // there is nothing to configure here. A local `.env` still overrides
    // Firebase for emulator runs; `ZENOH_ENDPOINTS` points the client at a
    // non-production bridge (e.g. `tcp/localhost:7447`) for local testing.
    let firebase_options = FirebaseOptions::from_env();
    let endpoint_override = std::env::var("ZENOH_ENDPOINTS")
        .ok()
        .and_then(|v| v.split(',').next().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty());

    std::thread::Builder::new()
        .name("studio-bridge".into())
        .spawn(move || {
            let rt = match tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => {
                    log::error!("studio-bridge: failed to build Tokio runtime: {e}");
                    return;
                }
            };
            rt.block_on(async {
                // The Zenoh/Firebase TLS stacks need a process-wide rustls crypto
                // provider installed before the first handshake.
                if rustls::crypto::CryptoProvider::get_default().is_none() {
                    let _ = rustls::crypto::ring::default_provider().install_default();
                }

                // Firebase emulator overrides are local-only, so they stay a
                // plain runtime-env read (never baked into a shipped build).
                let firebase_emulator_options = FirebaseEmulatorOptions::from_env();

                // Default to the bridge endpoint baked into the client crate; a
                // runtime `ZENOH_ENDPOINTS` override targets a local/preprod one.
                let connect = match endpoint_override {
                    Some(endpoint) => {
                        info!("studio-bridge: connecting to Semio Studio via Zenoh (endpoint: {endpoint})");
                        ZenohDeviceClient::new_endpoint(
                            &firebase_options,
                            Some(&firebase_emulator_options),
                            None, // no persisted refresh-token identity (see VIZ-67 note)
                            None,
                            endpoint,
                        )
                        .await
                    }
                    None => {
                        info!("studio-bridge: connecting to Semio Studio via the baked-in bridge endpoint");
                        ZenohDeviceClient::new(
                            &firebase_options,
                            Some(&firebase_emulator_options),
                            None, // no persisted refresh-token identity (see VIZ-67 note)
                            None,
                        )
                        .await
                    }
                };
                let client = match connect {
                    Ok(client) => client,
                    Err(e) => {
                        log::error!("studio-bridge: failed to connect to Semio Studio: {e:?}");
                        return;
                    }
                };
                let studio_bridge: Box<dyn Bridge> = Box::new(client);

                // The device name is generated once and reused for every
                // (re-)registration this process makes — regenerating it would
                // register a *different* device each time the owners change.
                let device_name = format!("vizij-{}", random_device_suffix());

                // Initial registration with whatever owners are known at startup
                // (env → persisted → empty). Registration always runs — the
                // device is visible/claimable regardless of ownership.
                let info = studio_device_info(device_name.clone(), initial_owners.clone());
                if let Err(e) = studio_bridge.update_device_info(Some(info)).await {
                    log::error!("studio-bridge: failed to register device info: {e}");
                } else {
                    info!(
                        "studio-bridge: registered device \"{device_name}\" with Studio ({} owner(s))",
                        initial_owners.len()
                    );
                }

                info!(
                    "studio-bridge: connected; a Studio can now see this device. \
                     (Live-data streaming is the remaining VIZ-67 step — see spawn_studio_bridge docs.)"
                );

                // Re-register whenever the user answers the in-UI owner prompt.
                // `changed()` returns Err only once the sender (held in AppState)
                // is dropped at shutdown, which ends the task and the thread.
                while owners_rx.changed().await.is_ok() {
                    let owners = owners_rx.borrow_and_update().clone();
                    let info = studio_device_info(device_name.clone(), owners.clone());
                    match studio_bridge.update_device_info(Some(info)).await {
                        Ok(_) => info!(
                            "studio-bridge: re-registered device \"{device_name}\" ({} owner(s))",
                            owners.len()
                        ),
                        Err(e) => {
                            log::error!("studio-bridge: failed to re-register device info: {e}")
                        }
                    }
                }
            });
        })
        .expect("failed to spawn studio-bridge thread");
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

/// Report whether the studio-bridge feature is active and, if so, whether the
/// app still needs to ask the user who owns this device. The React modal reads
/// this on mount and only shows itself when `active && needs_prompt`. Always
/// registered; returns the inactive state when the feature is off.
#[tauri::command]
fn studio_bridge_owner_status(app_handle: tauri::AppHandle) -> StudioOwnerStatus {
    #[cfg(feature = "studio-bridge")]
    {
        let state = app_handle.state::<AppState>();
        let needs_prompt = *state.studio.needs_prompt.lock().unwrap();
        let owners = state.studio.owners.lock().unwrap().clone();
        StudioOwnerStatus {
            active: true,
            needs_prompt,
            owners,
        }
    }
    #[cfg(not(feature = "studio-bridge"))]
    {
        let _ = &app_handle;
        StudioOwnerStatus {
            active: false,
            needs_prompt: false,
            owners: Vec::new(),
        }
    }
}

/// Persist the chosen owner UID(s) and push them to the bridge thread so the
/// device is re-registered live (no restart). "Skip (register unowned)" calls
/// this with an empty list, which persists an explicit empty so the modal never
/// asks again. Always registered; a harmless no-op when the feature is off.
#[tauri::command]
fn studio_bridge_set_owners(
    app_handle: tauri::AppHandle,
    owners: Vec<String>,
) -> Result<(), String> {
    #[cfg(feature = "studio-bridge")]
    {
        let owners: Vec<String> = owners
            .into_iter()
            .map(|o| o.trim().to_string())
            .filter(|o| !o.is_empty())
            .collect();
        persist_studio_owners(&app_handle, &owners)?;
        let state = app_handle.state::<AppState>();
        *state.studio.owners.lock().unwrap() = owners.clone();
        *state.studio.needs_prompt.lock().unwrap() = false;
        // Ignore a send error: it only means the bridge thread has exited.
        let _ = state.studio.owners_tx.send(owners);
        Ok(())
    }
    #[cfg(not(feature = "studio-bridge"))]
    {
        let _ = (&app_handle, owners);
        Ok(())
    }
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
    #[cfg(desktop)]
    if let Some(Commands::ListDisplays) = cli.command {
        list_displays();
        return;
    }

    let log_level = cli.log_level;

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log_level)
                .level_for("rustdds", LevelFilter::Warn)
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
                let ros2_node =
                    arora_ros2::AroraRos2Node::new(&cli.ros2_namespace, cli.ros2_domain_id);
                manager.add_connection(Arc::new(ros2_node));
                info!(
                    "ROS2 node configured (domain_id={}, namespace={})",
                    cli.ros2_domain_id, cli.ros2_namespace
                );
            }

            let web_port = if serve_web_control { Some(port) } else { None };

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

            // Resolve who owns this device for the studio-bridge feature, and
            // set up the channel the in-UI owner prompt uses to re-register live.
            // Precedence: `DEVICE_OWNERS` env (overrides, never persisted/asked)
            // → a persisted previous choice → empty + prompt in the UI.
            #[cfg(feature = "studio-bridge")]
            let (studio_state, studio_owners_rx, studio_initial_owners) = {
                let handle = app.handle();
                let env_owners = std::env::var("DEVICE_OWNERS")
                    .ok()
                    .map(|s| parse_owners(&s))
                    .unwrap_or_default();
                let (initial_owners, needs_prompt) = if !env_owners.is_empty() {
                    (env_owners, false)
                } else if let Some(persisted) = read_persisted_owners(handle) {
                    (persisted, false)
                } else {
                    (Vec::new(), true)
                };
                let (owners_tx, owners_rx) =
                    tokio::sync::watch::channel::<Vec<String>>(initial_owners.clone());
                (
                    StudioBridgeState {
                        owners_tx,
                        needs_prompt: std::sync::Mutex::new(needs_prompt),
                        owners: std::sync::Mutex::new(initial_owners.clone()),
                    },
                    owners_rx,
                    initial_owners,
                )
            };

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
                #[cfg(feature = "studio-bridge")]
                studio: studio_state,
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

            // Opt-in: connect this runtime to the Semio Studio Bridge so a Studio
            // can view/drive its live data (VIZ-67 producer side). Off unless
            // built with `--features studio-bridge`.
            #[cfg(feature = "studio-bridge")]
            spawn_studio_bridge(studio_owners_rx, studio_initial_owners);

            info!("Vizij Standalone App initialized with WS port {}", port);
            if serve_web_control {
                info!(
                    "Web control panel will be available at http://<ip>:{}",
                    port
                );
            }
            if let Some(ref src) = glb_source {
                info!("GLB source: {}", src);
            }

            // Configure window based on CLI arguments (desktop only)
            #[cfg(desktop)]
            {
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
                            let x =
                                monitor_pos.x + (monitor_size.width as i32 - cli.width as i32) / 2;
                            let y = monitor_pos.y
                                + (monitor_size.height as i32 - cli.height as i32) / 2;
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
            } // #[cfg(desktop)]

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
            studio_bridge_owner_status,
            studio_bridge_set_owners,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
