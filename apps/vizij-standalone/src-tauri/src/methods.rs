//! The app's own methods: what a remote asks of the webview — reset the face,
//! speak, mute the microphone, drive the bundled animations and programs.
//!
//! They are a contract the device serves under [`MODULE_ID`], so every bridge
//! of the run lists and calls them as it does any module function. Each one
//! hands the webview a Tauri event; the webview does the work.

use arora::HostModule;
use log::warn;
use tauri::{AppHandle, Emitter, Manager};
use uuid::uuid;

use crate::AppState;

/// The module the app's methods are served under.
pub const MODULE_ID: uuid::Uuid = uuid!("d7f3c46b-fdad-4427-81e3-fbdeeea0d508");

#[arora_module::contract(name = "vizij_standalone")]
pub trait Methods {
    /// Reset all values to defaults.
    #[export(id = "2f015c21-b88f-473c-85a8-ff8c55da2cd2")]
    fn reset(&mut self);

    /// Mute (`true`, the default) or unmute (`false`) the microphone.
    #[export(id = "d89e2cff-a405-46c2-89ad-01b66a06d34f")]
    fn mute_microphone(
        &mut self,
        #[param(id = "697b6f51-6e60-4004-8a93-3155b926fa1c")] muted: Option<bool>,
    );

    /// Whether the microphone is muted.
    #[export(id = "d7c2cecb-85f4-40e8-bed9-254c968daf0e")]
    fn get_mic_muted(&mut self) -> bool;

    /// Speak `text` through the webview's speech pipeline.
    #[export(id = "cb875986-d1aa-469a-9968-c63e5726aa54")]
    fn speak(&mut self, #[param(id = "59c9aedf-d6fa-4035-ab60-94f8f6a6d57c")] text: String);

    /// Interrupt any ongoing speech playback.
    #[export(id = "11bdcfca-10fc-49cf-a3e7-2cbaa42cd53f")]
    fn interrupt(&mut self);

    /// The bundled animations and procedural programs, as the JSON
    /// `{"animations": [{id, label, state}], "programs": [...]}`.
    #[export(id = "35269a2d-5664-4572-87f8-9877b4cf0121", name = "transport/list")]
    fn transport_list(&mut self) -> String;

    /// Play the animation or program `id`; `kind` is `animation` or `program`.
    #[export(id = "26cfa3c1-dcb0-4411-98d8-0c5b85d1b6b6", name = "transport/play")]
    fn transport_play(
        &mut self,
        #[param(id = "191edac0-c0ca-463a-a274-679612c88a11")] kind: String,
        #[param(id = "f740271f-73bd-4032-826f-df268be21a1f")] id: String,
    );

    /// Pause the animation or program `id`; `kind` is `animation` or `program`.
    #[export(id = "c791a624-5dfe-4fc0-8b51-83b752745b6c", name = "transport/pause")]
    fn transport_pause(
        &mut self,
        #[param(id = "fa593cec-9e7a-40d9-9cd3-a7063f17431b")] kind: String,
        #[param(id = "79b47500-ab87-4641-a723-abefbc417694")] id: String,
    );

    /// Stop the animation or program `id`; `kind` is `animation` or `program`.
    /// A stopped animation clears its outputs and a stopped program resets
    /// them unless `clear_outputs` / `reset_outputs` is `false`.
    #[export(id = "a281bb41-ce3d-485d-a7f6-a651723e4c55", name = "transport/stop")]
    fn transport_stop(
        &mut self,
        #[param(id = "dc2897df-6f41-4373-bb97-306c45f7e05a")] kind: String,
        #[param(id = "058096b3-70e2-4fc6-8447-e3bfb7a3a8f2")] id: String,
        #[param(id = "307fbf30-e354-429d-8798-86cd3294a211")] clear_outputs: Option<bool>,
        #[param(id = "ed30dd94-eadf-442b-b819-77dd3b9e9c4c")] reset_outputs: Option<bool>,
    );
}

/// The device's module serving [`Methods`] on the webview of `app`.
pub fn host_module(app: AppHandle) -> HostModule {
    HostModule::from_exports(MODULE_ID, methods::exports(Webview { app }))
}

/// The implementation: each method emits the event the webview listens to.
struct Webview {
    app: AppHandle,
}

impl Webview {
    fn emit<S: serde::Serialize + Clone>(&self, event: &str, payload: S) {
        if let Err(e) = self.app.emit(event, payload) {
            warn!("failed to emit {event}: {e}");
        }
    }

    /// Emit `{kind}-{action}` with `payload`, for a `kind` the transport knows.
    fn emit_transport<S: serde::Serialize + Clone>(&self, kind: &str, action: &str, payload: S) {
        match kind {
            "animation" | "program" => self.emit(&format!("{kind}-{action}"), payload),
            _ => warn!("transport/{action}: unknown kind {kind:?} (expected animation or program)"),
        }
    }
}

impl Methods for Webview {
    fn reset(&mut self) {
        self.emit("reset", ());
    }

    fn mute_microphone(&mut self, muted: Option<bool>) {
        let muted = muted.unwrap_or(true);
        *self.app.state::<AppState>().mic_muted.lock().unwrap() = muted;
        self.emit("mute-microphone", muted);
    }

    fn get_mic_muted(&mut self) -> bool {
        *self.app.state::<AppState>().mic_muted.lock().unwrap()
    }

    fn speak(&mut self, text: String) {
        self.emit("speak", text);
    }

    fn interrupt(&mut self) {
        self.emit("interrupt-speech", ());
    }

    fn transport_list(&mut self) -> String {
        let catalog = self
            .app
            .state::<AppState>()
            .transport_catalog
            .lock()
            .unwrap()
            .clone();
        serde_json::to_string(&catalog).expect("the transport catalog serializes")
    }

    fn transport_play(&mut self, kind: String, id: String) {
        self.emit_transport(&kind, "play", id);
    }

    fn transport_pause(&mut self, kind: String, id: String) {
        self.emit_transport(&kind, "pause", id);
    }

    fn transport_stop(
        &mut self,
        kind: String,
        id: String,
        clear_outputs: Option<bool>,
        reset_outputs: Option<bool>,
    ) {
        let payload = match kind.as_str() {
            "animation" => {
                serde_json::json!({ "id": id, "clearOutputs": clear_outputs.unwrap_or(true) })
            }
            _ => serde_json::json!({ "id": id, "resetOutputs": reset_outputs.unwrap_or(true) }),
        };
        self.emit_transport(&kind, "stop", payload);
    }
}
