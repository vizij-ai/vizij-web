fn main() {
    // Studio-bridge config baked at build time via `option_env!` (CI injects
    // the public Firebase config from repository secrets). Declare the vars so
    // an incremental build re-bakes when their value changes; a runtime env /
    // `.env` still overrides at launch. See `src/lib.rs::spawn_studio_bridge`.
    for var in [
        "FIREBASE_API_KEY",
        "FIREBASE_AUTH_DOMAIN",
        "FIREBASE_DATABASE_URL",
        "FIREBASE_PROJECT_ID",
        "FIREBASE_STORAGE_BUCKET",
        "FIREBASE_MESSAGING_SENDER_ID",
        "FIREBASE_APP_ID",
        "FIREBASE_MEASUREMENT_ID",
        "ZENOH_ENDPOINTS",
        "DEVICE_OWNERS",
        "DEVICE_NAME",
        "DEVICE_DESCRIPTION",
        "MODEL_FAMILY",
        "HARDWARE_VERSION",
        "SOFTWARE_VERSION",
    ] {
        println!("cargo:rerun-if-env-changed={var}");
    }

    tauri_build::build()
}
