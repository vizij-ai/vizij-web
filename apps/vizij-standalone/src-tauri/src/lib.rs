use base64::{engine::general_purpose::STANDARD, Engine};
use clap::{Parser, Subcommand};
use log::{info, LevelFilter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use arora_bridge::Bridge;
use arora_bridge_ws::bridge::WsBridge;
use arora_bridge_ws::{
    AroraWSServer, InvokeResult, KeyInfo, MethodInfo, MethodParam, ServerConfig, Type, Value,
};
use arora_simple_data_store::SimpleDataStore;
use arora_types::data::{DataStore, Key, StateChange};

mod host;

/// Application state.
///
/// The heart is the shared [`SimpleDataStore`] blackboard. The WebSocket server
/// lives for the process; several `arora_bridge::Bridge` pumps (WS + optional
/// ROS 2 + optional Studio) attach to the store and run under cancellation
/// tokens. The webview mirrors its live values into the store (via
/// `publish_values`) and applies inbound writes it receives as `update-values`.
struct AppState {
    /// The one shared blackboard every bridge reads/writes. Clones share storage.
    store: SimpleDataStore,
    /// The WebSocket server (`arora-bridge-ws`), created once for the process. Its
    /// registry (advertised keys + methods) is updated live; the serve loop is
    /// started/stopped under `cancel_token`.
    ws_server: Arc<AroraWSServer>,
    /// Governs the WS serve loop and the WS bridge pump (the start/stop lifecycle).
    /// `Some` iff the host is running.
    cancel_token: StdMutex<Option<CancellationToken>>,
    /// Governs the ROS 2 bridge pump. Replaced whenever the input-key catalog
    /// changes (a ROS 2 topic is typed and its inputs are declared up front).
    #[cfg(feature = "ros2")]
    ros2_token: StdMutex<Option<CancellationToken>>,
    #[cfg(feature = "ros2")]
    ros2_domain_id: u16,
    #[cfg(feature = "ros2")]
    ros2_namespace: String,
    /// The latest key catalog the webview advertised (via `set_slots`).
    keys: StdMutex<Vec<KeyInfo>>,
    port: u16,
    web_port: Option<u16>,
    glb_source: Option<String>,
    deepgram_key: Option<String>,
    openai_key: Option<String>,
    api_url: Option<String>,
    auto_mic: Option<bool>,
    speech_mode: Option<String>,
    silence_ms: Option<u32>,
    mic_muted: StdMutex<bool>,
    transport_catalog: StdMutex<TransportCatalog>,
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
    needs_prompt: StdMutex<bool>,
    owners: StdMutex<Vec<String>>,
    /// The stable `vizij-<random>` name this device registers with Studio under
    /// (generated once at startup). Reported to the UI by [`get_endpoints`].
    device_name: String,
    /// Display string for the bridge router endpoint: the `STUDIO_BRIDGE_ENDPOINT`
    /// override, or a label for the baked-in production bridge when unset.
    endpoint: String,
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

/// A snapshot of every endpoint this app exposes, reported to the frontend by
/// [`get_endpoints`] so the UI can list where the device is reachable. `ros2`
/// and `studio` are `None` when their feature is compiled out.
#[derive(Debug, Clone, Serialize)]
struct EndpointsInfo {
    ws: WsEndpoint,
    ros2: Option<Ros2Endpoint>,
    studio: Option<StudioEndpoint>,
}

/// The WebSocket bridge (`arora-bridge-ws`): the local control socket and, when
/// enabled, the browser control panel served on the same port.
#[derive(Debug, Clone, Serialize)]
struct WsEndpoint {
    url: String,
    web_control_url: Option<String>,
    running: bool,
}

/// The ROS 2 data-topic bridge (`arora-bridge-ros2`): keys are published under
/// `/{namespace}/keys/{path}` on the given DDS domain.
#[derive(Debug, Clone, Serialize)]
struct Ros2Endpoint {
    domain_id: u16,
    namespace: String,
}

/// The Semio Studio bridge: how this device registers with Studio (the device
/// info) and which Zenoh endpoint it reaches the bridge router over.
#[derive(Debug, Clone, Serialize)]
struct StudioEndpoint {
    device_name: String,
    model_family: Option<String>,
    software_version: Option<String>,
    /// The Zenoh endpoint of the bridge router (an override, or the baked-in
    /// production bridge when unset).
    endpoint: String,
    /// Studio user IDs that see/claim this device; empty means unclaimed.
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

    /// ROS2 namespace for topics (requires --features ros2)
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

// =============================================================================
// WebSocket method surface
// =============================================================================

/// Register the RPC methods on the WS server's registry. Each handler keeps
/// emitting the exact same Tauri event the pre-migration `ConnectionManager`
/// did, so the webview and speech controller are unaffected. Methods live on the
/// registry (read live at invoke time), so registering them once is enough.
///
/// These stay on the WS (and Studio) bridge only: `arora-bridge-ros2` carries
/// data topics with no method/service surface (ARORA-62 tracks parity).
async fn register_ws_methods(server: &Arc<AroraWSServer>, app: &AppHandle) {
    let registry = server.registry();

    // reset — reset all values to defaults.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "reset".to_string(),
                params: vec![],
                return_type: None,
                description: Some("Reset all values to defaults".to_string()),
            },
            move |_args| match app_h.emit("reset", ()) {
                Ok(()) => InvokeResult::ok(),
                Err(e) => InvokeResult::err(format!("Failed to emit reset: {}", e)),
            },
        )
        .await;

    // mute_microphone — mute/unmute the mic.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "mute_microphone".to_string(),
                params: vec![MethodParam {
                    name: "muted".to_string(),
                    param_type: Type::Boolean,
                    required: true,
                    default_value: None,
                    description: Some("True to mute, false to unmute".to_string()),
                }],
                return_type: None,
                description: Some("Mute or unmute the microphone".to_string()),
            },
            move |args| {
                let muted = match args.get("muted") {
                    Some(Value::Boolean(b)) => *b,
                    _ => true,
                };
                *app_h.state::<AppState>().mic_muted.lock().unwrap() = muted;
                match app_h.emit("mute-microphone", muted) {
                    Ok(()) => InvokeResult::ok(),
                    Err(e) => InvokeResult::err(format!("Failed to emit mute-microphone: {}", e)),
                }
            },
        )
        .await;

    // get_mic_muted — query current mic state.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "get_mic_muted".to_string(),
                params: vec![],
                return_type: Some(Type::Boolean),
                description: Some("Get current microphone muted state".to_string()),
            },
            move |_args| {
                let muted = *app_h.state::<AppState>().mic_muted.lock().unwrap();
                InvokeResult::ok_with_value(Value::Boolean(muted))
            },
        )
        .await;

    // speak — send text to TTS.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "speak".to_string(),
                params: vec![MethodParam {
                    name: "text".to_string(),
                    param_type: Type::String,
                    required: true,
                    default_value: None,
                    description: Some("Text to speak via TTS".to_string()),
                }],
                return_type: None,
                description: Some("Speak the given text via TTS".to_string()),
            },
            move |args| {
                let text = match args.get("text") {
                    Some(Value::String(s)) => s.clone(),
                    _ => return InvokeResult::err("Missing 'text' parameter".to_string()),
                };
                match app_h.emit("speak", &text) {
                    Ok(()) => InvokeResult::ok(),
                    Err(e) => InvokeResult::err(format!("Failed to emit speak: {}", e)),
                }
            },
        )
        .await;

    // interrupt — stop any ongoing speech.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "interrupt".to_string(),
                params: vec![],
                return_type: None,
                description: Some("Interrupt any ongoing speech playback".to_string()),
            },
            move |_args| match app_h.emit("interrupt-speech", ()) {
                Ok(()) => InvokeResult::ok(),
                Err(e) => InvokeResult::err(format!("Failed to emit interrupt-speech: {}", e)),
            },
        )
        .await;

    // transport/list — list bundled animations and procedural programs.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "transport/list".to_string(),
                params: vec![],
                return_type: None,
                description: Some("List bundled animations and procedural programs".to_string()),
            },
            move |_args| {
                let catalog = app_h
                    .state::<AppState>()
                    .transport_catalog
                    .lock()
                    .unwrap()
                    .clone();
                match serde_json::to_string(&catalog) {
                    Ok(serialized) => InvokeResult::ok_with_value(Value::String(serialized)),
                    Err(error) => InvokeResult::err(format!(
                        "Failed to serialize transport catalog: {}",
                        error
                    )),
                }
            },
        )
        .await;

    // transport/play.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "transport/play".to_string(),
                params: transport_kind_id_params(),
                return_type: None,
                description: Some("Play a bundled animation or procedural program".to_string()),
            },
            move |args| transport_emit(&app_h, &args, "play"),
        )
        .await;

    // transport/pause.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "transport/pause".to_string(),
                params: transport_kind_id_params(),
                return_type: None,
                description: Some("Pause a bundled animation or procedural program".to_string()),
            },
            move |args| transport_emit(&app_h, &args, "pause"),
        )
        .await;

    // transport/stop.
    let app_h = app.clone();
    registry
        .register_method_fn(
            MethodInfo {
                path: "transport/stop".to_string(),
                params: transport_kind_id_params(),
                return_type: None,
                description: Some("Stop a bundled animation or procedural program".to_string()),
            },
            move |args| transport_stop(&app_h, &args),
        )
        .await;
}

fn transport_kind_id_params() -> Vec<MethodParam> {
    vec![
        MethodParam {
            name: "kind".to_string(),
            param_type: Type::String,
            required: true,
            default_value: None,
            description: Some("Either 'animation' or 'program'".to_string()),
        },
        MethodParam {
            name: "id".to_string(),
            param_type: Type::String,
            required: true,
            default_value: None,
            description: Some("Transport identifier".to_string()),
        },
    ]
}

/// Emit a `{animation,program}-{play,pause}` event for a transport method.
fn transport_emit(app: &AppHandle, args: &HashMap<String, Value>, action: &str) -> InvokeResult {
    let id = match args.get("id") {
        Some(Value::String(id)) => id.clone(),
        _ => return InvokeResult::err("Missing 'id' parameter".to_string()),
    };
    let kind = match args.get("kind") {
        Some(Value::String(kind)) => kind.clone(),
        _ => return InvokeResult::err("Missing 'kind' parameter".to_string()),
    };
    let event_name = match (kind.as_str(), action) {
        ("animation", "play") => "animation-play",
        ("animation", "pause") => "animation-pause",
        ("program", "play") => "program-play",
        ("program", "pause") => "program-pause",
        _ => return InvokeResult::err("Invalid 'kind' parameter".to_string()),
    };
    match app.emit(event_name, &id) {
        Ok(()) => InvokeResult::ok(),
        Err(e) => InvokeResult::err(format!("Failed to emit {}: {}", event_name, e)),
    }
}

/// Emit the `{animation,program}-stop` event (with its clear/reset payload).
fn transport_stop(app: &AppHandle, args: &HashMap<String, Value>) -> InvokeResult {
    let id = match args.get("id") {
        Some(Value::String(id)) => id.clone(),
        _ => return InvokeResult::err("Missing 'id' parameter".to_string()),
    };
    let kind = match args.get("kind") {
        Some(Value::String(kind)) => kind.clone(),
        _ => return InvokeResult::err("Missing 'kind' parameter".to_string()),
    };
    if kind == "animation" {
        let clear_outputs = matches!(args.get("clear_outputs"), Some(Value::Boolean(false)))
            .then_some(false)
            .unwrap_or(true);
        return match app.emit(
            "animation-stop",
            serde_json::json!({ "id": id, "clearOutputs": clear_outputs }),
        ) {
            Ok(()) => InvokeResult::ok(),
            Err(e) => InvokeResult::err(format!("Failed to emit animation-stop: {}", e)),
        };
    }
    if kind == "program" {
        let reset_outputs = matches!(args.get("reset_outputs"), Some(Value::Boolean(false)))
            .then_some(false)
            .unwrap_or(true);
        return match app.emit(
            "program-stop",
            serde_json::json!({ "id": id, "resetOutputs": reset_outputs }),
        ) {
            Ok(()) => InvokeResult::ok(),
            Err(e) => InvokeResult::err(format!("Failed to emit program-stop: {}", e)),
        };
    }
    InvokeResult::err("Invalid 'kind' parameter".to_string())
}

// =============================================================================
// Bridge host lifecycle
// =============================================================================

/// Spawn a pump for one set of bridge endpoints against the shared store: an
/// auto-allow access server per bridge, then [`host::run_pump`] itself.
fn spawn_bridge_pump(app: &AppHandle, bridges: Vec<Box<dyn Bridge>>, cancel: CancellationToken) {
    let store = app.state::<AppState>().store.clone();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for bridge in &bridges {
            let requests = bridge.access_requests().await;
            tauri::async_runtime::spawn(host::serve_access_auto_allow(
                requests,
                cancel.child_token(),
            ));
        }
        host::run_pump(store, app, bridges, cancel).await;
    });
}

/// Start the bridge host: register the WS methods, bind + serve the WS server,
/// and spawn the WS pump (plus the ROS 2 pump). Idempotent — returns `Ok` if the
/// host is already running. The Studio bridge is independent (its own thread) and
/// not governed here.
async fn start_host(app: &AppHandle, emit_started: bool) -> Result<(), String> {
    // Reserve the running slot up front so a concurrent start (setup + the
    // webview's start_ws_server) cannot double-bind the port.
    let cancel = CancellationToken::new();
    {
        let state = app.state::<AppState>();
        let mut guard = state.cancel_token.lock().unwrap();
        if guard.is_some() {
            return Ok(());
        }
        *guard = Some(cancel.clone());
    }

    let (ws_server, port) = {
        let state = app.state::<AppState>();
        (state.ws_server.clone(), state.port)
    };

    register_ws_methods(&ws_server, app).await;

    // The WS bridge registers the server's write/read handlers; it MUST exist
    // before the serve loop, which snapshots those handlers once at startup.
    let ws_bridge = WsBridge::new(ws_server.clone()).await;

    let listener = match ws_server.bind().await {
        Ok(listener) => listener,
        Err(e) => {
            *app.state::<AppState>().cancel_token.lock().unwrap() = None;
            return Err(e);
        }
    };

    // Serve loop.
    {
        let server = ws_server.clone();
        let serve_cancel = cancel.clone();
        let app_for_stopped = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = server.run_on(listener, serve_cancel).await {
                log::error!("WS server error: {e}");
            }
            let _ = app_for_stopped.emit("ws:stopped", ());
        });
    }

    // WS pump — owns the WS bridge's inbound stream; ends when the server stops.
    spawn_bridge_pump(app, vec![Box::new(ws_bridge)], cancel.child_token());

    // ROS 2 pump — built from the current key catalog.
    #[cfg(feature = "ros2")]
    respawn_ros2(app).await;

    if emit_started {
        app.emit("ws:started", port).map_err(|e| e.to_string())?;
    }

    info!("Bridge host started (WS port: {})", port);
    Ok(())
}

/// Stop the bridge host: cancel the WS serve loop + all pumps.
async fn stop_host(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    #[cfg(feature = "ros2")]
    if let Some(token) = state.ros2_token.lock().unwrap().take() {
        token.cancel();
    }
    let token = state.cancel_token.lock().unwrap().take();
    if let Some(token) = token {
        token.cancel();
        info!("Bridge host stop requested");
        Ok(())
    } else {
        Err("Connection servers are not running".to_string())
    }
}

/// (Re)build the ROS 2 pump from the current key catalog. ROS 2 topics are typed
/// and their inputs declared up front, so a changed catalog means a rebuilt
/// bridge (no hot-reload). No-op when the host is not running.
#[cfg(feature = "ros2")]
async fn respawn_ros2(app: &AppHandle) {
    use arora_bridge_ros2::{Ros2Bridge, Ros2BridgeConfig};

    let parent = app.state::<AppState>().cancel_token.lock().unwrap().clone();
    let Some(parent) = parent else {
        return; // host not running
    };

    // Cancel the previous ROS 2 pump before building the next.
    if let Some(old) = app.state::<AppState>().ros2_token.lock().unwrap().take() {
        old.cancel();
    }

    let config = {
        let state = app.state::<AppState>();
        let keys = state.keys.lock().unwrap();
        let mut config = Ros2BridgeConfig::new(state.ros2_namespace.clone(), state.ros2_domain_id);
        for key in keys.iter() {
            // Only input keys accept inbound commands (become subscribed topics);
            // outputs are published on demand from `try_send`.
            if key.kind.as_deref() == Some("input") {
                let value_type = key.value_type.clone().unwrap_or(Type::F64);
                config = config.with_input(key.path.clone(), value_type);
            }
        }
        config
    };

    let bridge = Ros2Bridge::new(config).await;
    let cancel = parent.child_token();
    *app.state::<AppState>().ros2_token.lock().unwrap() = Some(cancel.clone());
    spawn_bridge_pump(app, vec![Box::new(bridge)], cancel);
    info!("ROS2 bridge (re)built");
}

// =============================================================================
// Studio bridge (opt-in)
// =============================================================================

/// The Studio device info this app registers with. See the field notes on the
/// original migration: everything is self-describing except `name` (a stable
/// per-launch `vizij-<random>`) and `owners` (the Studio user IDs that see/claim
/// this device), both passed in because they must stay identical across
/// re-registrations.
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

/// Path of the persisted owner file (`app_local_data_dir()/studio_owners.json`).
#[cfg(feature = "studio-bridge")]
fn studio_owners_file(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("studio_owners.json"))
}

/// Read the persisted owner list. `Some(vec)` when a choice was persisted (even
/// an empty array — an explicit "register unowned"); `None` when never chosen.
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

/// A short random suffix for the generated `vizij-<suffix>` device name.
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

/// Tauri event emitted when the Studio bridge fails to connect or register, so
/// the failure is visible to the UI instead of only reaching the log.
#[cfg(feature = "studio-bridge")]
const STUDIO_BRIDGE_ERROR_EVENT: &str = "studio-bridge:error";

/// Paths of the persisted device identity: the encrypted anonymous refresh token
/// and the key that encrypts it, both under `app_local_data_dir()`. Reusing the
/// token across launches gives the device ONE stable Studio identity (one
/// `devices/{uid}` doc) instead of minting a fresh anonymous user — and orphaning
/// the previous doc and its owners/permissions — every launch.
#[cfg(feature = "studio-bridge")]
fn studio_token_paths(
    app: &tauri::AppHandle,
) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((
        dir.join("studio_refresh_token.key"),
        dir.join("studio_refresh_token"),
    ))
}

/// Load the 32-byte token-encryption key from `key_path`, if present and valid.
#[cfg(feature = "studio-bridge")]
fn studio_load_key(key_path: &std::path::Path) -> Option<crypto_secretbox::Key> {
    use crypto_secretbox::aead::generic_array::GenericArray;
    let bytes = std::fs::read(key_path).ok()?;
    (bytes.len() == 32).then(|| *GenericArray::from_slice(&bytes))
}

/// Load the token-encryption key, generating and persisting one on first use.
#[cfg(feature = "studio-bridge")]
fn studio_load_or_create_key(key_path: &std::path::Path) -> std::io::Result<crypto_secretbox::Key> {
    use crypto_secretbox::aead::{KeyInit, OsRng};
    use crypto_secretbox::XSalsa20Poly1305;
    if let Some(key) = studio_load_key(key_path) {
        return Ok(key);
    }
    let key = XSalsa20Poly1305::generate_key(&mut OsRng);
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(key_path, key.as_slice())?;
    Ok(key)
}

/// Read + decrypt the persisted anonymous refresh token, if present.
///
/// Stored as `nonce (24 bytes) || XSalsa20Poly1305 ciphertext`, matching arora's
/// token storage. Returns `None` when nothing is saved or the blob can't be
/// decrypted (e.g. a rotated key).
#[cfg(feature = "studio-bridge")]
fn read_studio_refresh_token(
    key_path: &std::path::Path,
    token_path: &std::path::Path,
) -> Option<String> {
    use crypto_secretbox::aead::generic_array::GenericArray;
    use crypto_secretbox::aead::{Aead, KeyInit};
    use crypto_secretbox::{Nonce, XSalsa20Poly1305};

    let blob = std::fs::read(token_path).ok()?;
    if blob.len() <= 24 {
        return None;
    }
    let key = studio_load_key(key_path)?;
    let cipher = XSalsa20Poly1305::new(&key);
    let (nonce_bytes, ciphertext) = blob.split_at(24);
    let nonce: Nonce = *GenericArray::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(&nonce, ciphertext).ok()?;
    let token = String::from_utf8(plaintext).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}

/// Encrypt + persist the anonymous refresh token as the client rotates it, so the
/// same device identity survives restarts. Encrypted at rest (XSalsa20Poly1305)
/// under a key stored next to it, like arora's saved token.
#[cfg(feature = "studio-bridge")]
fn write_studio_refresh_token(
    key_path: &std::path::Path,
    token_path: &std::path::Path,
    token: &str,
) -> Result<(), String> {
    use crypto_secretbox::aead::{Aead, AeadCore, KeyInit, OsRng};
    use crypto_secretbox::XSalsa20Poly1305;

    let key = studio_load_or_create_key(key_path).map_err(|e| e.to_string())?;
    let cipher = XSalsa20Poly1305::new(&key);
    let nonce = XSalsa20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, token.as_bytes())
        .map_err(|e| format!("failed to encrypt refresh token: {e}"))?;
    if let Some(parent) = token_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut blob = nonce.as_slice().to_vec();
    blob.extend_from_slice(&ciphertext);
    std::fs::write(token_path, blob).map_err(|e| e.to_string())
}

/// The Studio bridge pump. Registers the device, serves access requests, and —
/// the VIZ-67 close — shares the SAME store as the WS/ROS2 bridges: it fans the
/// store's live changes out to Studio (`try_send`) and applies Studio's inbound
/// commands back into the store (mirroring writes to the webview). Owner changes
/// from the in-UI prompt re-register the device live under the same name.
///
/// Runs on the studio thread's private runtime, so its Zenoh session and this
/// loop live for the process (independent of the WS `start/stop`).
#[cfg(feature = "studio-bridge")]
async fn run_studio_pump(
    store: SimpleDataStore,
    app: AppHandle,
    bridge: Box<dyn Bridge>,
    owners_rx: tokio::sync::watch::Receiver<Vec<String>>,
    device_name: String,
    initial_owners: Vec<String>,
) {
    // Production wiring for the injectable core: surface failures as a Tauri event
    // and route inbound events through the real store/webview handler. The core
    // itself is Tauri-free so it can run against a mock bridge under test.
    let error_app = app.clone();
    let on_error = move |message: String| {
        let _ = error_app.emit(STUDIO_BRIDGE_ERROR_EVENT, message);
    };
    let on_inbound = move |store: &SimpleDataStore, event| host::handle_inbound(store, &app, event);
    run_studio_pump_core(
        store,
        bridge,
        owners_rx,
        device_name,
        initial_owners,
        on_error,
        on_inbound,
    )
    .await;
}

/// The Tauri-free core of the studio pump — the injection seam.
///
/// Takes the bridge (the real `ZenohDeviceClient` in production, a mock in tests)
/// plus two sinks: `on_error` for a surfaced failure message (production emits a
/// Tauri event) and `on_inbound` for an inbound event (production applies it to
/// the store + webview). Registers the device, keeps it registered as owners
/// change, and fans store changes out to the bridge — with no dependency on a
/// running Tauri app, so the registration mechanics are testable with a mock.
#[cfg(feature = "studio-bridge")]
async fn run_studio_pump_core(
    store: SimpleDataStore,
    mut bridge: Box<dyn Bridge>,
    mut owners_rx: tokio::sync::watch::Receiver<Vec<String>>,
    device_name: String,
    initial_owners: Vec<String>,
    mut on_error: impl FnMut(String),
    mut on_inbound: impl FnMut(&SimpleDataStore, arora_bridge::Inbound),
) {
    use futures_util::StreamExt;

    // Initial registration (env → persisted → empty). Always runs — the device
    // is visible/claimable regardless of ownership.
    let info = studio_device_info(device_name.clone(), initial_owners.clone());
    if let Err(e) = bridge.update_device_info(Some(info)).await {
        log::error!("studio-bridge: failed to register device info: {e}");
        on_error(format!("Failed to register this device with Studio: {e}"));
    } else {
        info!(
            "studio-bridge: registered device \"{device_name}\" with Studio ({} owner(s))",
            initial_owners.len()
        );
    }
    info!("studio-bridge: connected; a Studio can now see this device and its live data.");

    // Access requests (auto-allow — Studio grants implicitly today).
    let access_cancel = CancellationToken::new();
    {
        let requests = bridge.access_requests().await;
        tokio::spawn(host::serve_access_auto_allow(
            requests,
            access_cancel.clone(),
        ));
    }

    // Take the inbound stream once, then drive the shared store both ways.
    let mut inbound = bridge.take_inbound();
    let subscription = store.subscribe();
    let (change_tx, mut change_rx) = tokio::sync::mpsc::unbounded_channel::<StateChange>();
    std::thread::spawn(move || {
        while let Some(change) = subscription.recv() {
            if change_tx.send(change).is_err() {
                break;
            }
        }
    });

    loop {
        tokio::select! {
            maybe_change = change_rx.recv() => match maybe_change {
                Some(change) => bridge.try_send(&change),
                None => break,
            },
            maybe_event = inbound.next() => match maybe_event {
                Some(event) => on_inbound(&store, event),
                None => break, // endpoint disconnected
            },
            changed = owners_rx.changed() => {
                if changed.is_err() {
                    break; // sender dropped at shutdown
                }
                let owners = owners_rx.borrow_and_update().clone();
                let info = studio_device_info(device_name.clone(), owners.clone());
                match bridge.update_device_info(Some(info)).await {
                    Ok(_) => info!(
                        "studio-bridge: re-registered device \"{device_name}\" ({} owner(s))",
                        owners.len()
                    ),
                    Err(e) => {
                        log::error!("studio-bridge: failed to re-register device info: {e}");
                        on_error(format!("Failed to update this device's owners in Studio: {e}"));
                    }
                }
            }
        }
    }

    access_cancel.cancel();
    info!("studio-bridge: pump ended");
}

/// Connect this standalone to the Semio Studio Bridge (opt-in `studio-bridge`
/// feature) and hand its `ZenohDeviceClient` (an `arora_bridge::Bridge`) to
/// [`run_studio_pump`], sharing the given store. Runs on its own thread with a
/// private Tokio runtime.
///
/// Zero-config: the published client crate bakes in the public Firebase config
/// and production bridge endpoint. Runtime overrides for testing/ownership:
/// `.env` Firebase (emulator), `STUDIO_BRIDGE_ENDPOINT` (a non-production
/// bridge), `DEVICE_OWNERS` (ownership).
#[cfg(feature = "studio-bridge")]
fn spawn_studio_bridge(
    store: SimpleDataStore,
    app: AppHandle,
    owners_rx: tokio::sync::watch::Receiver<Vec<String>>,
    initial_owners: Vec<String>,
    device_name: String,
) {
    use arora_studio_bridge_client::firestore_support::options::{
        FirebaseEmulatorOptions, FirebaseOptions,
    };
    use arora_studio_bridge_client::zenoh::ZenohDeviceClient;

    let firebase_options = FirebaseOptions::from_env();
    let endpoint_override = std::env::var("STUDIO_BRIDGE_ENDPOINT")
        .ok()
        .and_then(|v| v.split(',').next().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty());

    // Load the saved (encrypted) anonymous refresh token, if any, so the device
    // keeps ONE stable Studio identity across launches, and wire the save-callback
    // so the client persists the token as it rotates. Without this, every launch
    // minted a fresh anonymous user — a new devices/{uid} doc — orphaning the
    // previous one and its owners/permissions. Mirrors arora's own device path.
    let token_paths = studio_token_paths(&app).ok();
    let refresh_token = token_paths
        .as_ref()
        .and_then(|(key_path, token_path)| read_studio_refresh_token(key_path, token_path));
    if refresh_token.is_some() {
        info!("studio-bridge: reusing the saved device identity");
    } else {
        info!("studio-bridge: no saved device identity yet; one will be created");
    }
    let save_token: Option<Box<dyn FnMut(String) + Send + Sync>> =
        token_paths.map(|(key_path, token_path)| {
            Box::new(move |token: String| {
                if let Err(e) = write_studio_refresh_token(&key_path, &token_path, &token) {
                    log::warn!("studio-bridge: failed to save device identity: {e}");
                }
            }) as Box<dyn FnMut(String) + Send + Sync>
        });

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
            rt.block_on(async move {
                // The Zenoh/Firebase TLS stacks need a process-wide rustls crypto
                // provider installed before the first handshake.
                if rustls::crypto::CryptoProvider::get_default().is_none() {
                    let _ = rustls::crypto::ring::default_provider().install_default();
                }

                // Firebase emulator wiring is left to its default behavior:
                // `FirebaseEmulatorOptions::from_env()` picks up the emulator when
                // `FIREBASE_*_EMULATOR_HOST` is set, and targets real Firebase otherwise.
                let firebase_emulator_options = FirebaseEmulatorOptions::from_env();

                let connect = match endpoint_override {
                    Some(endpoint) => {
                        info!("studio-bridge: connecting to Semio Studio via Zenoh (endpoint: {endpoint})");
                        ZenohDeviceClient::new_endpoint(
                            &firebase_options,
                            Some(&firebase_emulator_options),
                            refresh_token,
                            save_token,
                            endpoint,
                        )
                        .await
                    }
                    None => {
                        info!("studio-bridge: connecting to Semio Studio via the baked-in bridge endpoint");
                        ZenohDeviceClient::new(
                            &firebase_options,
                            Some(&firebase_emulator_options),
                            refresh_token,
                            save_token,
                        )
                        .await
                    }
                };
                let client = match connect {
                    Ok(client) => client,
                    Err(e) => {
                        log::error!("studio-bridge: failed to connect to Semio Studio: {e:?}");
                        let _ = app.emit(
                            STUDIO_BRIDGE_ERROR_EVENT,
                            format!("Failed to connect to Semio Studio: {e:?}"),
                        );
                        return;
                    }
                };
                let bridge: Box<dyn Bridge> = Box::new(client);
                run_studio_pump(store, app, bridge, owners_rx, device_name, initial_owners).await;
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

// =============================================================================
// Tauri commands
// =============================================================================

/// Start the bridge host (WS server + pumps).
#[tauri::command]
async fn start_ws_server(app_handle: AppHandle) -> Result<(), String> {
    start_host(&app_handle, true).await
}

/// Stop the bridge host.
#[tauri::command]
async fn stop_ws_server(app_handle: AppHandle) -> Result<(), String> {
    stop_host(&app_handle).await
}

/// Get the configured WebSocket port.
#[tauri::command]
async fn get_port(app_handle: AppHandle) -> u16 {
    app_handle.state::<AppState>().port
}

/// Publish the key catalog into the store/registry.
///
/// The webview calls this once its model loads: it advertises the keys on the WS
/// registry (driving `list_keys` and, since these are `input` keys, the
/// `validate_paths` allow-list) and seeds their default values into the store so
/// reads and live-data have something before the first mirror push. When ROS 2
/// is enabled the pump is rebuilt so the input keys become subscribed topics.
#[tauri::command]
async fn set_slots(app_handle: AppHandle, slots: Vec<KeyInfo>) -> Result<(), String> {
    let count = slots.len();
    let (ws_server, store) = {
        let state = app_handle.state::<AppState>();
        (state.ws_server.clone(), state.store.clone())
    };

    // Advertise the catalog on the WS registry (live: list_keys + validate_paths).
    ws_server.registry().set_keys(slots.clone()).await;

    // Seed default values into the store.
    let mut seed = StateChange::new();
    for key in &slots {
        if let Some(default_value) = &key.default_value {
            seed.set
                .insert(Key::from(key.path.clone()), Some(default_value.clone()));
        }
    }
    if !seed.is_empty() {
        store.write(seed).map_err(|e| e.to_string())?;
    }

    *app_handle.state::<AppState>().keys.lock().unwrap() = slots;

    // ROS 2 inputs are declared up front, so rebuild that pump with the new
    // catalog. The WS bridge is untouched, so connected WS clients stay up.
    #[cfg(feature = "ros2")]
    respawn_ros2(&app_handle).await;

    info!("Key catalog updated: {} key(s) advertised", count);
    Ok(())
}

/// Continuously mirror the webview's live values into the shared store.
///
/// Replaces the old 5s one-shot `get_slot_values` pull. The webview pushes its
/// current values on an interval; the store's change-only semantics drop
/// unchanged keys, so re-pushing the whole snapshot is cheap. Each real change
/// fans out to every attached bridge (WS `values_changed`, ROS 2 publish,
/// Studio) — this is what feeds live data to Studio (VIZ-67) and remote clients.
#[tauri::command]
async fn publish_values(
    app_handle: AppHandle,
    values: HashMap<String, Value>,
) -> Result<(), String> {
    let store = app_handle.state::<AppState>().store.clone();
    let mut change = StateChange::new();
    for (path, value) in values {
        change.set.insert(Key::from(path), Some(value));
    }
    if !change.is_empty() {
        store.write(change).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Get the GLB source: a CLI argument (path or URL) on desktop, or — on Android,
/// where there is no CLI — a model opened via an "open with" / VIEW intent, which
/// `MainActivity` copies to `<app_local_data_dir>/opened_model.glb`.
#[tauri::command]
async fn get_glb_source(app_handle: AppHandle) -> Option<String> {
    if let Some(src) = app_handle.state::<AppState>().glb_source.clone() {
        return Some(src);
    }
    #[cfg(target_os = "android")]
    {
        if let Ok(dir) = app_handle.path().app_local_data_dir() {
            let model = dir.join("opened_model.glb");
            if model.exists() {
                return Some(model.to_string_lossy().into_owned());
            }
        }
    }
    None
}

/// Check if the bridge host is running.
#[tauri::command]
async fn is_ws_running(app_handle: AppHandle) -> bool {
    app_handle
        .state::<AppState>()
        .cancel_token
        .lock()
        .unwrap()
        .is_some()
}

/// Read a local GLB file and return as base64.
#[tauri::command]
async fn read_glb_file(path: String) -> Result<String, String> {
    let contents = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(STANDARD.encode(&contents))
}

/// Get the web control port (None if web control is disabled).
#[tauri::command]
async fn get_web_port(app_handle: AppHandle) -> Option<u16> {
    app_handle.state::<AppState>().web_port
}

/// Get speech-related API keys/URLs from CLI flags.
#[tauri::command]
async fn get_speech_keys(app_handle: AppHandle) -> HashMap<String, String> {
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

/// Update the mic muted state (called from frontend to keep Rust state in sync).
#[tauri::command]
async fn set_mic_muted_state(app_handle: AppHandle, muted: bool) {
    *app_handle.state::<AppState>().mic_muted.lock().unwrap() = muted;
}

/// Report whether the studio-bridge feature is active and, if so, whether the
/// app still needs to ask the user who owns this device.
#[tauri::command]
fn studio_bridge_owner_status(app_handle: AppHandle) -> StudioOwnerStatus {
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
/// device is re-registered live (no restart).
#[tauri::command]
fn studio_bridge_set_owners(app_handle: AppHandle, owners: Vec<String>) -> Result<(), String> {
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

/// Report every endpoint this app exposes so the UI can list them. `ros2` and
/// `studio` are populated only when their feature is compiled in.
#[tauri::command]
fn get_endpoints(app_handle: AppHandle) -> EndpointsInfo {
    let state = app_handle.state::<AppState>();
    let running = state.cancel_token.lock().unwrap().is_some();
    let ws = WsEndpoint {
        url: format!("ws://localhost:{}", state.port),
        web_control_url: state.web_port.map(|p| format!("http://localhost:{p}")),
        running,
    };

    #[cfg(feature = "ros2")]
    let ros2 = Some(Ros2Endpoint {
        domain_id: state.ros2_domain_id,
        namespace: state.ros2_namespace.clone(),
    });
    #[cfg(not(feature = "ros2"))]
    let ros2 = None;

    #[cfg(feature = "studio-bridge")]
    let studio = Some(StudioEndpoint {
        device_name: state.studio.device_name.clone(),
        model_family: Some("Vizij".to_string()),
        software_version: Some(concat!("vizij-standalone-", env!("CARGO_PKG_VERSION")).to_string()),
        endpoint: state.studio.endpoint.clone(),
        owners: state.studio.owners.lock().unwrap().clone(),
    });
    #[cfg(not(feature = "studio-bridge"))]
    let studio = None;

    EndpointsInfo { ws, ros2, studio }
}

#[tauri::command]
async fn set_transport_catalog(
    app_handle: AppHandle,
    catalog: TransportCatalog,
) -> Result<(), String> {
    *app_handle
        .state::<AppState>()
        .transport_catalog
        .lock()
        .unwrap() = catalog;
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
                    let mut normalized = src;
                    while normalized.contains("\\\\") {
                        normalized = normalized.replace("\\\\", "\\");
                    }
                    std::fs::canonicalize(&normalized)
                        .map(|p| p.to_string_lossy().into_owned())
                        .unwrap_or(normalized)
                }
            });

            // The shared blackboard and the WebSocket server (created once for
            // the process; served under the host lifecycle).
            let serve_web_control = !cli.no_web_control;
            let store = SimpleDataStore::new();
            let ws_server = Arc::new(AroraWSServer::new(
                ServerConfig::with_port(port)
                    .validate_paths(true)
                    .serve_control_panel(serve_web_control),
            ));

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
            // Precedence: `DEVICE_OWNERS` env → a persisted choice → empty + prompt.
            #[cfg(feature = "studio-bridge")]
            let (studio_state, studio_owners_rx, studio_initial_owners, studio_device_name) = {
                let handle = app.handle();
                let env_owners = std::env::var("DEVICE_OWNERS")
                    .ok()
                    .map(|s| parse_owners(&s))
                    .unwrap_or_default();
                let (initial_owners, needs_prompt) = if !env_owners.is_empty() {
                    // An env override becomes the persisted choice too, so the
                    // next launch WITHOUT `DEVICE_OWNERS` keeps these owners
                    // (and the device identity stays claimable) instead of
                    // falling back to the previous persisted value or a prompt.
                    if let Err(e) = persist_studio_owners(handle, &env_owners) {
                        log::warn!("studio-bridge: failed to persist DEVICE_OWNERS override: {e}");
                    }
                    (env_owners, false)
                } else if let Some(persisted) = read_persisted_owners(handle) {
                    (persisted, false)
                } else {
                    (Vec::new(), true)
                };
                let (owners_tx, owners_rx) =
                    tokio::sync::watch::channel::<Vec<String>>(initial_owners.clone());
                // Generate the device name once (stable across re-registrations)
                // and resolve the endpoint label the UI shows.
                let device_name = format!("vizij-{}", random_device_suffix());
                let endpoint = std::env::var("STUDIO_BRIDGE_ENDPOINT")
                    .ok()
                    .and_then(|v| v.split(',').next().map(|s| s.trim().to_string()))
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "Semio Studio (baked-in bridge)".to_string());
                (
                    StudioBridgeState {
                        owners_tx,
                        needs_prompt: StdMutex::new(needs_prompt),
                        owners: StdMutex::new(initial_owners.clone()),
                        device_name: device_name.clone(),
                        endpoint,
                    },
                    owners_rx,
                    initial_owners,
                    device_name,
                )
            };

            app.manage(AppState {
                store: store.clone(),
                ws_server,
                cancel_token: StdMutex::new(None),
                #[cfg(feature = "ros2")]
                ros2_token: StdMutex::new(None),
                #[cfg(feature = "ros2")]
                ros2_domain_id: cli.ros2_domain_id,
                #[cfg(feature = "ros2")]
                ros2_namespace: cli.ros2_namespace.clone(),
                keys: StdMutex::new(Vec::new()),
                port,
                web_port,
                glb_source: glb_source.clone(),
                deepgram_key,
                openai_key,
                api_url,
                auto_mic,
                speech_mode,
                silence_ms,
                mic_muted: StdMutex::new(true),
                transport_catalog: StdMutex::new(TransportCatalog::default()),
                #[cfg(feature = "studio-bridge")]
                studio: studio_state,
            });

            #[cfg(feature = "ros2")]
            info!(
                "ROS2 bridge configured (domain_id={}, namespace={})",
                cli.ros2_domain_id, cli.ros2_namespace
            );

            let startup_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = start_host(&startup_handle, false).await {
                    log::error!(
                        "Failed to start the bridge host during app setup: {}",
                        error
                    );
                }
            });

            // Opt-in: attach the Studio bridge to the SAME store so a Studio can
            // view/drive this app's live data (VIZ-67). Off unless built with
            // `--features studio-bridge`.
            #[cfg(feature = "studio-bridge")]
            spawn_studio_bridge(
                store,
                app.handle().clone(),
                studio_owners_rx,
                studio_initial_owners,
                studio_device_name,
            );

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
                    let monitors: Vec<_> = window.available_monitors().unwrap_or_default();

                    let target_monitor = if let Some(display_idx) = cli.display {
                        monitors.get(display_idx).cloned().or_else(|| {
                            info!("Display {} not found, using primary", display_idx);
                            window.primary_monitor().ok().flatten()
                        })
                    } else {
                        window.primary_monitor().ok().flatten()
                    };

                    if cli.fullscreen {
                        if let Some(ref monitor) = target_monitor {
                            let pos = monitor.position();
                            let size = monitor.size();

                            if let Err(e) = window.set_position(tauri::Position::Physical(
                                tauri::PhysicalPosition::new(pos.x, pos.y),
                            )) {
                                log::error!("Failed to move window to display: {}", e);
                            } else if let Some(idx) = cli.display {
                                info!("Window moved to display {}", idx);
                            }

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

                        if let Err(e) = window.set_fullscreen(true) {
                            log::error!("Failed to set fullscreen: {}", e);
                        } else {
                            info!("Fullscreen mode enabled");
                        }
                    } else {
                        if let Err(e) = window.set_size(tauri::Size::Physical(
                            tauri::PhysicalSize::new(cli.width, cli.height),
                        )) {
                            log::error!("Failed to set window size: {}", e);
                        } else {
                            info!("Window size: {}x{}", cli.width, cli.height);
                        }

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

                    if cli.no_decorations {
                        if let Err(e) = window.set_decorations(false) {
                            log::error!("Failed to hide decorations: {}", e);
                        } else {
                            info!("Window decorations hidden");
                        }
                    }

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
            publish_values,
            get_glb_source,
            read_glb_file,
            get_speech_keys,
            set_mic_muted_state,
            set_transport_catalog,
            studio_bridge_owner_status,
            studio_bridge_set_owners,
            get_endpoints,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, feature = "studio-bridge"))]
mod studio_bridge_tests {
    use super::*;
    use arora_bridge::{Bridge, BridgeError, BridgeResult, DeviceInfo, Inbound, InboundStream};
    use async_trait::async_trait;
    use std::sync::{Arc, Mutex};
    use tokio::sync::mpsc;

    /// A stand-in for the real `ZenohDeviceClient` — implementing the same
    /// `arora_bridge::Bridge` trait vizij consumes — so the registration mechanics
    /// can be exercised with NO Firebase/Zenoh. (ZenohDeviceClient's own behavior
    /// is covered by studio-bridge's tests.) Records every `update_device_info`
    /// payload; `fail` makes registration error, to exercise the error path.
    struct MockDeviceClient {
        updates: mpsc::UnboundedSender<Option<DeviceInfo>>,
        fail: bool,
    }

    #[async_trait]
    impl Bridge for MockDeviceClient {
        fn take_inbound(&mut self) -> InboundStream {
            Box::pin(futures_util::stream::pending())
        }
        fn try_send(&mut self, _change: &arora_types::data::StateChange) {}
        async fn get_device_info(&self) -> BridgeResult<Option<DeviceInfo>> {
            Ok(None)
        }
        async fn update_device_info(
            &self,
            info: Option<DeviceInfo>,
        ) -> BridgeResult<Option<DeviceInfo>> {
            let _ = self.updates.send(info.clone());
            if self.fail {
                Err(BridgeError::Other("mock connection lost".into()))
            } else {
                Ok(info)
            }
        }
    }

    /// Spawn the pump core against a mock bridge. Returns the owner sender, the
    /// stream of recorded `update_device_info` payloads, the collected error
    /// messages, and the task handle.
    fn spawn_core(
        fail: bool,
    ) -> (
        tokio::sync::watch::Sender<Vec<String>>,
        mpsc::UnboundedReceiver<Option<DeviceInfo>>,
        Arc<Mutex<Vec<String>>>,
        tokio::task::JoinHandle<()>,
    ) {
        let (updates_tx, updates_rx) = mpsc::unbounded_channel();
        let bridge: Box<dyn Bridge> = Box::new(MockDeviceClient {
            updates: updates_tx,
            fail,
        });
        let store = SimpleDataStore::new();
        let (owners_tx, owners_rx) = tokio::sync::watch::channel::<Vec<String>>(Vec::new());
        let errors = Arc::new(Mutex::new(Vec::<String>::new()));
        let errors_sink = errors.clone();
        let handle = tokio::spawn(run_studio_pump_core(
            store,
            bridge,
            owners_rx,
            "vizij-test".to_string(),
            Vec::new(),
            move |message| errors_sink.lock().unwrap().push(message),
            |_store, _event: Inbound| {},
        ));
        (owners_tx, updates_rx, errors, handle)
    }

    /// After the operator chooses an owner, the device re-registers with that uid
    /// in its owners — the wiring that makes the devices/{uid} doc readable and
    /// claimable by that user.
    #[tokio::test]
    async fn owner_choice_reregisters_with_that_owner() {
        let (owners_tx, mut updates_rx, errors, handle) = spawn_core(false);

        // Initial registration, before any owner is chosen: ownerless.
        let first = updates_rx.recv().await.unwrap().unwrap();
        assert!(first.owners.is_empty(), "initial registration is ownerless");

        // Operator picks an owner → re-registration carries it.
        owners_tx.send(vec!["studio-user-uid".to_string()]).unwrap();
        let second = updates_rx.recv().await.unwrap().unwrap();
        assert_eq!(second.owners, vec!["studio-user-uid".to_string()]);
        assert_eq!(second.model_family.as_deref(), Some("Vizij"));

        drop(owners_tx); // ends the pump loop
        let _ = handle.await;
        assert!(errors.lock().unwrap().is_empty(), "no errors on success");
    }

    /// A failed registration is surfaced (via `on_error`, a Tauri event in
    /// production) rather than swallowed.
    #[tokio::test]
    async fn failed_registration_is_surfaced() {
        let (owners_tx, mut updates_rx, errors, handle) = spawn_core(true);

        // The attempt is still made against the bridge...
        let _ = updates_rx.recv().await.unwrap();

        drop(owners_tx);
        let _ = handle.await;

        // ...and its failure reached the error sink.
        let errors = errors.lock().unwrap();
        assert!(
            errors
                .iter()
                .any(|m| m.contains("Failed to register this device with Studio")),
            "expected a surfaced registration error, got {errors:?}"
        );
    }

    /// The refresh token is persisted encrypted and loads back decrypted — the
    /// stable-identity mechanic, exercised through the exact save-callback body
    /// `spawn_studio_bridge` wires to the client.
    #[test]
    fn refresh_token_round_trips_encrypted() {
        let dir = std::env::temp_dir().join(format!(
            "vizij-studio-token-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let key_path = dir.join("studio_refresh_token.key");
        let token_path = dir.join("studio_refresh_token");

        // Nothing persisted yet.
        assert_eq!(read_studio_refresh_token(&key_path, &token_path), None);

        // The save-callback, built exactly as spawn_studio_bridge builds it.
        let mut save_token: Box<dyn FnMut(String)> = {
            let key_path = key_path.clone();
            let token_path = token_path.clone();
            Box::new(move |token: String| {
                write_studio_refresh_token(&key_path, &token_path, &token).unwrap();
            })
        };
        save_token("secret-refresh-token".to_string());

        // On disk it is ciphertext, not the plaintext token.
        let blob = std::fs::read(&token_path).unwrap();
        assert!(
            !blob
                .windows("secret-refresh-token".len())
                .any(|w| w == b"secret-refresh-token"),
            "token must not be stored in plaintext"
        );

        // And it loads back decrypted on the next launch.
        assert_eq!(
            read_studio_refresh_token(&key_path, &token_path).as_deref(),
            Some("secret-refresh-token")
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parse_owners_trims_and_drops_empty() {
        assert_eq!(
            parse_owners(" a , ,b, "),
            vec!["a".to_string(), "b".to_string()]
        );
        assert!(parse_owners("  ,, ").is_empty());
    }
}
