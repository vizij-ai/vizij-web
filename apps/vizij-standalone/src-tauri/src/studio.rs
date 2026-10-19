//! The Studio connection, built with the opt-in `studio-bridge` feature.
//!
//! The device registers with Semio Studio through the studio-bridge Zenoh
//! device client (`ZenohDeviceClient`, an `arora_bridge::Bridge`). The run
//! holds a [`StudioEndpoint`] from its first step while the client connects on
//! a task of its own, so a slow or failed connection never holds up the
//! device's other bridges. Once connected, [`pump`] links the client to that
//! endpoint: every event the client receives goes to the run, which answers
//! Studio's commands as it answers every bridge's — a write reaches only the
//! keys the store opens, of the type they state — and every change the run
//! sends Studio's way, which it does once Studio asks for the device's data,
//! goes to the client.
//!
//! Zero-config: the published client crate bakes in the public Firebase config
//! and the production bridge endpoint. Runtime overrides:
//! `STUDIO_BRIDGE_ENDPOINT` (another bridge), `DEVICE_OWNERS` (ownership), and
//! the Firebase emulator hosts (`FIREBASE_*_EMULATOR_HOST`).

use std::path::{Path, PathBuf};

use arora_bridge::{
    AccessDecision, AccessRequestStream, Bridge, BridgeResult, DeviceInfo, Inbound, InboundStream,
};
use arora_types::data::StateChange;
use async_trait::async_trait;
use futures_util::stream::StreamExt;
use log::{info, warn};
use tauri::Manager;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// The run's end of the Studio connection: a bridge whose inbound stream is
/// what the pump forwards from the client, and whose outbound changes the pump
/// hands the client. The device's registration is the pump's.
pub struct StudioEndpoint {
    inbound: Option<mpsc::UnboundedReceiver<Inbound>>,
    outbound: mpsc::UnboundedSender<StateChange>,
}

/// The pump's end of a [`StudioEndpoint`].
pub struct StudioLink {
    to_run: mpsc::UnboundedSender<Inbound>,
    from_run: mpsc::UnboundedReceiver<StateChange>,
}

/// An endpoint for the run, and the link the pump drives it through.
pub fn endpoint() -> (StudioEndpoint, StudioLink) {
    let (to_run, inbound) = mpsc::unbounded_channel();
    let (outbound, from_run) = mpsc::unbounded_channel();
    (
        StudioEndpoint {
            inbound: Some(inbound),
            outbound,
        },
        StudioLink { to_run, from_run },
    )
}

#[async_trait]
impl Bridge for StudioEndpoint {
    fn take_inbound(&mut self) -> InboundStream {
        let mut rx = self
            .inbound
            .take()
            .expect("the inbound stream is taken once");
        Box::pin(futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx)))
    }

    fn try_send(&mut self, change: &StateChange) {
        // The pump has ended when nothing receives: Studio is gone.
        let _ = self.outbound.send(change.clone());
    }

    async fn get_device_info(&self) -> BridgeResult<Option<DeviceInfo>> {
        Ok(None)
    }

    async fn update_device_info(
        &self,
        info: Option<DeviceInfo>,
    ) -> BridgeResult<Option<DeviceInfo>> {
        Ok(info)
    }
}

/// Who the device is to Studio, resolved once at startup: a `vizij-<random>`
/// name, its owners, and where its anonymous identity is kept.
pub struct Registration {
    device_name: String,
    owners: Vec<String>,
    token_paths: Option<(PathBuf, PathBuf)>,
}

impl Registration {
    /// The owners are `DEVICE_OWNERS` (comma-separated), else the list a
    /// previous launch persisted, else none — an unclaimed device, which
    /// Studio still lists. `DEVICE_OWNERS` is persisted in turn, so a later
    /// launch without it keeps those owners.
    pub fn resolve(app: &tauri::AppHandle) -> Self {
        let env_owners = std::env::var("DEVICE_OWNERS")
            .ok()
            .map(|s| parse_owners(&s))
            .unwrap_or_default();
        let owners = if !env_owners.is_empty() {
            if let Err(e) = persist_owners(app, &env_owners) {
                warn!("studio-bridge: failed to persist DEVICE_OWNERS: {e}");
            }
            env_owners
        } else {
            read_persisted_owners(app).unwrap_or_default()
        };
        Registration {
            device_name: format!("vizij-{}", random_device_suffix()),
            owners,
            token_paths: token_paths(app).ok(),
        }
    }

    fn device_info(&self) -> DeviceInfo {
        DeviceInfo {
            name: Some(self.device_name.clone()),
            description: None,
            model_family: Some("Vizij".to_string()),
            hardware_version: None,
            software_version: Some(
                concat!("vizij-standalone-", env!("CARGO_PKG_VERSION")).to_string(),
            ),
            owners: self.owners.clone(),
        }
    }
}

/// Connect to Semio Studio and pump the connection into `link` until either
/// side ends. A failed connection is logged, and the device runs on without
/// Studio.
pub async fn connect(registration: Registration, link: StudioLink) {
    use arora_studio_bridge_client::firestore_support::options::{
        FirebaseEmulatorOptions, FirebaseOptions,
    };
    use arora_studio_bridge_client::zenoh::ZenohDeviceClient;

    // The Zenoh/Firebase TLS stacks need a process-wide rustls crypto provider
    // installed before the first handshake.
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }

    let firebase_options = FirebaseOptions::from_env();
    let emulator_options = FirebaseEmulatorOptions::from_env();
    let endpoint_override = std::env::var("STUDIO_BRIDGE_ENDPOINT")
        .ok()
        .and_then(|v| v.split(',').next().map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty());

    // The saved (encrypted) anonymous refresh token keeps the device ONE
    // Studio identity — one devices/{uid} doc, with its owners and
    // permissions — across launches; the client rotates it through the
    // save callback.
    let refresh_token = registration
        .token_paths
        .as_ref()
        .and_then(|(key_path, token_path)| read_refresh_token(key_path, token_path));
    if refresh_token.is_some() {
        info!("studio-bridge: reusing the saved device identity");
    } else {
        info!("studio-bridge: no saved device identity yet; one will be created");
    }
    let save_token: Option<Box<dyn FnMut(String) + Send + Sync>> = registration
        .token_paths
        .clone()
        .map(|(key_path, token_path)| {
            Box::new(move |token: String| {
                if let Err(e) = write_refresh_token(&key_path, &token_path, &token) {
                    warn!("studio-bridge: failed to save device identity: {e}");
                }
            }) as Box<dyn FnMut(String) + Send + Sync>
        });

    let connected = match endpoint_override {
        Some(endpoint) => {
            info!("studio-bridge: connecting to Semio Studio via Zenoh (endpoint: {endpoint})");
            ZenohDeviceClient::new_endpoint(
                &firebase_options,
                Some(&emulator_options),
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
                Some(&emulator_options),
                refresh_token,
                save_token,
            )
            .await
        }
    };
    match connected {
        Ok(client) => pump(Box::new(client), registration.device_info(), link).await,
        Err(e) => log::error!("studio-bridge: failed to connect to Semio Studio: {e:?}"),
    }
}

/// Register the device with `info`, serve the client's access requests, and
/// relay between the client and the run until either ends. Takes any
/// [`Bridge`], so it runs against a mock client under test.
pub(crate) async fn pump(mut client: Box<dyn Bridge>, info: DeviceInfo, link: StudioLink) {
    let StudioLink {
        to_run,
        mut from_run,
    } = link;
    let name = info.name.clone().unwrap_or_default();
    let owners = info.owners.len();
    match client.update_device_info(Some(info)).await {
        Ok(_) => {
            info!("studio-bridge: registered device \"{name}\" with Studio ({owners} owner(s))")
        }
        Err(e) => log::error!("studio-bridge: failed to register this device with Studio: {e}"),
    }

    let access_cancel = CancellationToken::new();
    tokio::spawn(serve_access_auto_allow(
        client.access_requests().await,
        access_cancel.clone(),
    ));

    let mut inbound = client.take_inbound();
    loop {
        tokio::select! {
            event = inbound.next() => match event {
                Some(event) => forward(&to_run, event),
                None => break, // the client disconnected
            },
            change = from_run.recv() => match change {
                Some(change) => client.try_send(&change),
                None => break, // the device is gone
            },
        }
    }
    access_cancel.cancel();
    info!("studio-bridge: pump ended");
}

/// Hand one client event to the run. A command that finds no run is refused
/// rather than left unanswered.
fn forward(to_run: &mpsc::UnboundedSender<Inbound>, event: Inbound) {
    if let Err(mpsc::error::SendError(Inbound::Command(cmd))) = to_run.send(event) {
        cmd.reply(Err("the device is not running".to_string()));
    }
}

/// Serve a bridge's access requests, auto-approving each until `cancel` fires.
///
/// Studio grants implicitly, so the device approves every request; tying the
/// task to `cancel` keeps it from outliving its pump.
async fn serve_access_auto_allow(mut requests: AccessRequestStream, cancel: CancellationToken) {
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            maybe_request = requests.next() => match maybe_request {
                Some(request) => {
                    info!(
                        "granting access to client {} ({})",
                        request.client_id, request.permission
                    );
                    request.respond(AccessDecision::Allowed);
                }
                None => break,
            },
        }
    }
}

/// Parse a comma-separated owner list, trimming whitespace and dropping empty
/// entries.
fn parse_owners(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|o| o.trim().to_string())
        .filter(|o| !o.is_empty())
        .collect()
}

/// Path of the persisted owner file (`app_local_data_dir()/studio_owners.json`).
fn owners_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("studio_owners.json"))
}

/// Read the persisted owner list. `Some(vec)` when one was persisted (even an
/// empty array); `None` when none was.
fn read_persisted_owners(app: &tauri::AppHandle) -> Option<Vec<String>> {
    let path = owners_file(app).ok()?;
    let bytes = std::fs::read(&path).ok()?;
    serde_json::from_slice::<Vec<String>>(&bytes).ok()
}

/// Persist the owner list so it survives restarts.
fn persist_owners(app: &tauri::AppHandle, owners: &[String]) -> Result<(), String> {
    let path = owners_file(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec(owners).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// A short random suffix for the generated `vizij-<suffix>` device name.
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

/// Paths of the persisted device identity: the key that encrypts the
/// anonymous refresh token, and the encrypted token, both under
/// `app_local_data_dir()`.
fn token_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    Ok((
        dir.join("studio_refresh_token.key"),
        dir.join("studio_refresh_token"),
    ))
}

/// Load the 32-byte token-encryption key from `key_path`, if present and valid.
fn load_key(key_path: &Path) -> Option<crypto_secretbox::Key> {
    use crypto_secretbox::aead::generic_array::GenericArray;
    let bytes = std::fs::read(key_path).ok()?;
    (bytes.len() == 32).then(|| *GenericArray::from_slice(&bytes))
}

/// Load the token-encryption key, generating and persisting one on first use.
fn load_or_create_key(key_path: &Path) -> std::io::Result<crypto_secretbox::Key> {
    use crypto_secretbox::aead::{KeyInit, OsRng};
    use crypto_secretbox::XSalsa20Poly1305;
    if let Some(key) = load_key(key_path) {
        return Ok(key);
    }
    let key = XSalsa20Poly1305::generate_key(&mut OsRng);
    if let Some(parent) = key_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(key_path, key.as_slice())?;
    Ok(key)
}

/// Read and decrypt the persisted anonymous refresh token, if present.
///
/// Stored as `nonce (24 bytes) || XSalsa20Poly1305 ciphertext`, matching arora's
/// token storage. Returns `None` when nothing is saved or the blob can't be
/// decrypted (e.g. a rotated key).
fn read_refresh_token(key_path: &Path, token_path: &Path) -> Option<String> {
    use crypto_secretbox::aead::generic_array::GenericArray;
    use crypto_secretbox::aead::{Aead, KeyInit};
    use crypto_secretbox::{Nonce, XSalsa20Poly1305};

    let blob = std::fs::read(token_path).ok()?;
    if blob.len() <= 24 {
        return None;
    }
    let key = load_key(key_path)?;
    let cipher = XSalsa20Poly1305::new(&key);
    let (nonce_bytes, ciphertext) = blob.split_at(24);
    let nonce: Nonce = *GenericArray::from_slice(nonce_bytes);
    let plaintext = cipher.decrypt(&nonce, ciphertext).ok()?;
    let token = String::from_utf8(plaintext).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}

/// Encrypt and persist the anonymous refresh token as the client rotates it,
/// under a key stored next to it, like arora's saved token.
fn write_refresh_token(key_path: &Path, token_path: &Path, token: &str) -> Result<(), String> {
    use crypto_secretbox::aead::{Aead, AeadCore, KeyInit, OsRng};
    use crypto_secretbox::XSalsa20Poly1305;

    let key = load_or_create_key(key_path).map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use arora_bridge::{BridgeCommand, BridgeError, BridgeOp};
    use arora_simple_data_store::SimpleDataStore;
    use arora_types::data::{DataStore, Key, KeyMeta};
    use arora_types::value::{Type, Value};
    use futures_channel::oneshot;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    /// Send `op` to the run as the pump forwards Studio's commands, and wait
    /// for the run's answer, stepping `arora` until it comes.
    fn ask(arora: &mut arora::Arora, link: &StudioLink, op: BridgeOp) -> Result<Value, String> {
        let (tx, mut rx) = oneshot::channel();
        forward(&link.to_run, Inbound::Command(BridgeCommand::new(op, tx)));
        for _ in 0..10 {
            arora.step(Duration::from_millis(16)).expect("step");
            if let Ok(Some(answer)) = rx.try_recv() {
                return answer.map(|result| result.ret);
            }
        }
        panic!("the run did not answer");
    }

    fn update(path: &str, value: Value) -> BridgeOp {
        let mut change = StateChange::new();
        change.set.insert(Key::from(path), Some(value));
        BridgeOp::Update(change)
    }

    fn device(store: &SimpleDataStore, endpoint: StudioEndpoint) -> arora::Arora {
        arora::Arora::builder()
            .with_data_store(Box::new(store.clone()))
            .with_bridge(Box::new(endpoint))
            .build()
            .expect("the device composes")
    }

    /// Studio's writes reach the run, which applies the store's meta to them
    /// as to every bridge's: an open key of the stated type is written, a
    /// closed key or another type is refused and writes nothing.
    #[test]
    fn studio_commands_are_answered_by_the_run() {
        let store = SimpleDataStore::new();
        store
            .set_meta(HashMap::from([(
                Key::from("standard/ros4hri/expression/valence"),
                KeyMeta::new().editable().of_type(Type::F32),
            )]))
            .expect("the store keeps meta");
        let (endpoint, link) = endpoint();
        let mut arora = device(&store, endpoint);
        let read = |path: &str| store.read(&[Key::from(path)]).into_iter().next().flatten();

        assert!(ask(
            &mut arora,
            &link,
            update("standard/ros4hri/expression/valence", Value::F32(0.5))
        )
        .is_ok());
        assert_eq!(
            read("standard/ros4hri/expression/valence"),
            Some(Value::F32(0.5))
        );

        let ill_typed = ask(
            &mut arora,
            &link,
            update("standard/ros4hri/expression/valence", Value::F64(0.2)),
        );
        assert!(ill_typed
            .unwrap_err()
            .contains("not of the key's declared type"));
        assert_eq!(
            read("standard/ros4hri/expression/valence"),
            Some(Value::F32(0.5))
        );

        let closed = ask(&mut arora, &link, update("rig/face/jaw", Value::F64(1.0)));
        assert!(closed.unwrap_err().contains("not an input"));
        assert_eq!(read("rig/face/jaw"), None);

        let listed = ask(
            &mut arora,
            &link,
            BridgeOp::ListKeys {
                prefix: Some("standard/".into()),
            },
        )
        .expect("ListKeys answers");
        let listed: Vec<(String, KeyMeta)> =
            arora_types::value_serde::from_value(listed).expect("keys with their meta");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].0, "standard/ros4hri/expression/valence");
        assert!(listed[0].1.editable);
    }

    /// The run sends the endpoint its changes once Studio asks for the
    /// device's data, and not before.
    #[test]
    fn the_run_sends_studio_its_changes_once_asked() {
        let store = SimpleDataStore::new();
        let (endpoint, mut link) = endpoint();
        let mut arora = device(&store, endpoint);

        arora.step(Duration::from_millis(16)).expect("step");
        assert!(link.from_run.try_recv().is_err(), "nobody asked yet");

        forward(&link.to_run, Inbound::DataRequested(true));
        arora.step(Duration::from_millis(16)).expect("step");
        let change = link.from_run.try_recv().expect("the step's changes");
        assert!(
            change
                .set
                .contains_key(&Key::from(arora_behavior::built_in::TIME)),
            "the device's clock travels to Studio"
        );
    }

    /// A command that finds the device gone is refused rather than left
    /// unanswered.
    #[test]
    fn a_command_with_no_run_is_refused() {
        let (endpoint, link) = endpoint();
        drop(endpoint);
        let (tx, mut rx) = oneshot::channel();
        forward(
            &link.to_run,
            Inbound::Command(BridgeCommand::new(BridgeOp::Get(Vec::new()), tx)),
        );
        let answer = rx
            .try_recv()
            .expect("the reply is not cancelled")
            .expect("answered at once");
        assert_eq!(answer.unwrap_err(), "the device is not running");
    }

    /// A stand-in for `ZenohDeviceClient`, implementing the same
    /// `arora_bridge::Bridge`: its inbound events are the test's, and it
    /// records every registration and every change it is sent.
    struct MockClient {
        inbound: Option<mpsc::UnboundedReceiver<Inbound>>,
        registrations: Arc<Mutex<Vec<DeviceInfo>>>,
        sent: Arc<Mutex<Vec<StateChange>>>,
        fail: bool,
    }

    #[async_trait]
    impl Bridge for MockClient {
        fn take_inbound(&mut self) -> InboundStream {
            let mut rx = self.inbound.take().expect("taken once");
            Box::pin(futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx)))
        }
        fn try_send(&mut self, change: &StateChange) {
            self.sent.lock().unwrap().push(change.clone());
        }
        async fn get_device_info(&self) -> BridgeResult<Option<DeviceInfo>> {
            Ok(None)
        }
        async fn update_device_info(
            &self,
            info: Option<DeviceInfo>,
        ) -> BridgeResult<Option<DeviceInfo>> {
            if let Some(info) = &info {
                self.registrations.lock().unwrap().push(info.clone());
            }
            if self.fail {
                Err(BridgeError::Other("mock connection lost".into()))
            } else {
                Ok(info)
            }
        }
    }

    /// `future`'s output, failing the test when it takes over a second: a
    /// relay that drops what it is handed fails rather than hangs.
    async fn within<F: std::future::Future>(future: F) -> F::Output {
        tokio::time::timeout(Duration::from_secs(1), future)
            .await
            .expect("the pump relays within a second")
    }

    /// The pump registers the device under its name and owners, hands the
    /// run what the client receives and the client what the run sends, and
    /// ends when the client disconnects — after a failed registration too.
    #[tokio::test]
    async fn the_pump_registers_the_device_and_relays_both_ways() {
        for fail in [false, true] {
            let (client_tx, client_rx) = mpsc::unbounded_channel();
            let registrations = Arc::new(Mutex::new(Vec::new()));
            let sent = Arc::new(Mutex::new(Vec::new()));
            let client = MockClient {
                inbound: Some(client_rx),
                registrations: registrations.clone(),
                sent: sent.clone(),
                fail,
            };
            let (mut endpoint, link) = endpoint();
            let registration = Registration {
                device_name: "vizij-test".to_string(),
                owners: vec!["studio-user-uid".to_string()],
                token_paths: None,
            };
            let pumping = tokio::spawn(pump(Box::new(client), registration.device_info(), link));

            let mut to_device = endpoint.take_inbound();
            client_tx.send(Inbound::DataRequested(true)).unwrap();
            assert!(matches!(
                within(to_device.next()).await,
                Some(Inbound::DataRequested(true))
            ));
            let mut change = StateChange::new();
            change.set.insert(
                Key::from(arora_behavior::built_in::TIME),
                Some(Value::U64(1)),
            );
            endpoint.try_send(&change);

            // Let the pump relay the run's change, then disconnect the client.
            within(async {
                while sent.lock().unwrap().is_empty() {
                    tokio::task::yield_now().await;
                }
            })
            .await;
            drop(client_tx);
            within(pumping)
                .await
                .expect("the pump ends with the client");
            assert_eq!(*sent.lock().unwrap(), vec![change]);
            let registrations = registrations.lock().unwrap();
            assert_eq!(registrations.len(), 1);
            assert_eq!(registrations[0].name.as_deref(), Some("vizij-test"));
            assert_eq!(registrations[0].owners, vec!["studio-user-uid".to_string()]);
            assert_eq!(registrations[0].model_family.as_deref(), Some("Vizij"));
        }
    }

    /// The refresh token is persisted encrypted and loads back decrypted —
    /// the stable-identity mechanic, through the save callback's body.
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

        assert_eq!(read_refresh_token(&key_path, &token_path), None);

        write_refresh_token(&key_path, &token_path, "secret-refresh-token").unwrap();

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
            read_refresh_token(&key_path, &token_path).as_deref(),
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
