//! The desktop and Android shell around the face page, and the Arora device
//! it runs beside it.
//!
//! The page runs its own face on its own Arora runtime and asks the shell for
//! three things only: the face to load (`get_glb_source`, `read_glb_file`) and
//! the agent's flags (`get_speech_keys`). Beside it the shell runs ONE `arora`
//! run of its own (see [`run_device`]), which the page does not render: the
//! ROS4HRI profile graph, the look_at skill, the `say` module, and its bridges
//! — the WebSocket bridge, the ROS 2 bridge (`ros2` feature) and Semio Studio
//! (`studio-bridge` feature).

use base64::{engine::general_purpose::STANDARD, Engine};
use clap::{Parser, Subcommand};
use log::{info, LevelFilter};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

use arora_bridge_ws::bridge::WsBridge;
use arora_bridge_ws::{AroraWSServer, ServerConfig};
use arora_simple_data_store::SimpleDataStore;

mod skills;
#[cfg(feature = "studio-bridge")]
mod studio;

/// What the page asks the shell for: the face to load and the agent's flags.
struct AppState {
    glb_source: Option<String>,
    deepgram_key: Option<String>,
    openai_key: Option<String>,
    api_url: Option<String>,
    auto_mic: Option<bool>,
    speech_mode: Option<String>,
    silence_ms: Option<u32>,
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
// The device
// =============================================================================

/// What the device is built from, resolved at startup.
struct DeviceConfig {
    /// The WebSocket bridge's port, on loopback.
    port: u16,
    /// Whether the WebSocket port also serves the control panel page.
    serve_control_panel: bool,
    /// The TTS deployment the `say` module speaks through.
    api_base: String,
    #[cfg(feature = "ros2")]
    ros2_namespace: String,
    #[cfg(feature = "ros2")]
    ros2_domain_id: u16,
    #[cfg(feature = "studio-bridge")]
    studio: studio::Registration,
}

/// Run the device on a thread of its own, for the life of the process: an
/// `Arora` is single-owner and not `Send`, so it is built and stepped there,
/// on that thread's Tokio runtime.
fn spawn_device(config: DeviceConfig) {
    std::thread::Builder::new()
        .name("arora-device".into())
        .spawn(move || {
            let rt = match tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
            {
                Ok(rt) => rt,
                Err(e) => return log::error!("device runtime: {e}"),
            };
            rt.block_on(run_device(config));
        })
        .expect("failed to spawn the device thread");
}

/// The device: ONE arora run over its own store, owning the interpreter (the
/// ROS4HRI profile graph with the look_at fragment), the `say` module, the
/// built-in keys, and every bridge. A remote may write the ROS4HRI profile's
/// inputs and no other key, and may call the device's methods (`look_at`,
/// `say`, the interpreter module's). A bridge that cannot start is logged and
/// left out; the device runs with the others.
async fn run_device(config: DeviceConfig) {
    let mut builder = device_builder(SimpleDataStore::new(), config.api_base);

    // The WS bridge registers the server's handlers; it must exist before the
    // serve loop, which snapshots them once at startup.
    let ws_server = Arc::new(AroraWSServer::new(
        ServerConfig::with_port(config.port).serve_control_panel(config.serve_control_panel),
    ));
    let ws_bridge = WsBridge::new(ws_server.clone()).await;
    match ws_server.bind().await {
        Ok(listener) => {
            tokio::spawn(async move {
                if let Err(e) = ws_server.run_on(listener, CancellationToken::new()).await {
                    log::error!("WS server error: {e}");
                }
            });
            builder = builder.with_bridge(Box::new(ws_bridge));
        }
        Err(e) => log::error!("the WebSocket bridge does not start: {e}"),
    }

    // Studio connects on its own task; the run holds its endpoint meanwhile.
    #[cfg(feature = "studio-bridge")]
    {
        let (endpoint, link) = studio::endpoint();
        tokio::spawn(studio::connect(config.studio, link));
        builder = builder.with_bridge(Box::new(endpoint));
    }

    #[cfg(feature = "ros2")]
    {
        let ros2 = ros2_config(config.ros2_namespace, config.ros2_domain_id);
        info!(
            "ROS 2: the ROS4HRI topics and skills, each key published under /{}/keys/<path> \
             (domain {})",
            ros2.namespace, ros2.domain_id
        );
        builder = builder.with_bridge(Box::new(arora_bridge_ros2::Ros2Bridge::new(ros2).await));
    }

    let mut arora = match builder.build() {
        Ok(arora) => arora,
        Err(e) => return log::error!("device build failed: {e:?}"),
    };
    if let Err(e) = arora.run(arora::Arora::DEFAULT_STEP_PERIOD).await {
        log::error!("device run ended: {e}");
    }
}

/// The device before its bridges: `store` with the ROS4HRI inputs open, the
/// `say` module speaking through `api_base`, and the interpreter.
fn device_builder(store: SimpleDataStore, api_base: String) -> arora::AroraBuilder {
    skills::open_ros4hri_inputs(&store);
    arora::Arora::builder()
        .with_data_store(Box::new(store))
        .with_host_module(vizij_arora_tts::host_module(vizij_arora_tts::Config {
            api_base,
        }))
        .with_behavior_interpreter(Box::new(skills::interpreter()))
}

/// The ROS 2 bridge's configuration: the ROS4HRI exposure preset, whose typed
/// face topics land on the profile's inputs and whose `/skill/look_at` and
/// `/skill/say` actions resolve against the device's described methods at
/// startup. `/skill/set_expression` lands on the expression keys the profile
/// graph reads: the device implements no `set_expression` method.
#[cfg(feature = "ros2")]
fn ros2_config(namespace: String, domain_id: u16) -> arora_bridge_ros2::Ros2BridgeConfig {
    use arora_bridge_ros2::{ExposureProfile, Ros2BridgeConfig};
    Ros2BridgeConfig::new(namespace, domain_id)
        .with_profile(ExposureProfile::ros4hri().with_set_expression_on_keys())
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

/// Read a local GLB file and return as base64.
#[tauri::command]
async fn read_glb_file(path: String) -> Result<String, String> {
    let contents = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Failed to read file '{}': {}", path, e))?;
    Ok(STANDARD.encode(&contents))
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

            spawn_device(DeviceConfig {
                port: cli.port,
                serve_control_panel: !cli.no_web_control,
                // The say module speaks through the TTS deployment the page uses.
                api_base: api_url
                    .clone()
                    .unwrap_or_else(|| vizij_arora_tts::DEFAULT_API_BASE.to_string()),
                #[cfg(feature = "ros2")]
                ros2_namespace: cli.ros2_namespace.clone(),
                #[cfg(feature = "ros2")]
                ros2_domain_id: cli.ros2_domain_id,
                #[cfg(feature = "studio-bridge")]
                studio: studio::Registration::resolve(app.handle()),
            });

            app.manage(AppState {
                glb_source: glb_source.clone(),
                deepgram_key,
                openai_key,
                api_url,
                auto_mic,
                speech_mode,
                silence_ms,
            });

            info!("Vizij Standalone initialized (device WS port {})", cli.port);
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
            get_glb_source,
            read_glb_file,
            get_speech_keys,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    use arora_types::data::{DataStore, Key};

    /// The device composes with its ROS4HRI inputs open, and describes the
    /// methods the ROS 2 preset binds its `/skill/look_at` and `/skill/say`
    /// actions to.
    #[test]
    fn the_device_composes_and_describes_its_skills() {
        let store = SimpleDataStore::new();
        let arora = device_builder(store.clone(), vizij_arora_tts::DEFAULT_API_BASE.to_string())
            .build()
            .expect("the device composes");
        let gaze = store.meta(&[Key::from(vizij_arora_host::ros4hri::GAZE_TARGET_KEY)]);
        assert!(
            gaze[0].as_ref().is_some_and(|meta| meta.editable),
            "the ROS4HRI inputs are open"
        );
        let names: Vec<String> = arora
            .describe_methods(None)
            .into_iter()
            .map(|method| method.name)
            .collect();
        for skill in ["look_at", "say"] {
            assert!(
                names.iter().any(|name| name == skill),
                "{skill} is described: {names:?}"
            );
        }
    }

    /// `/skill/set_expression` is a typed endpoint landing on the expression
    /// keys, not a topic skill spawning a method the device lacks.
    #[cfg(feature = "ros2")]
    #[test]
    fn set_expression_lands_on_the_expression_keys() {
        let config = ros2_config("vizij".into(), 0);
        assert!(!config
            .topic_skill_bindings
            .iter()
            .any(|skill| skill.topic == "/skill/set_expression"));
        assert!(config
            .typed_inputs
            .iter()
            .any(|input| input.topic.as_deref() == Some("/skill/set_expression")));
    }
}
