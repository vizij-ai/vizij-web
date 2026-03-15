//! Zenoh session implementing the [`AroraConnection`] trait.
//!
//! [`AroraZenohSession`] opens a Zenoh session that exposes arora slots as
//! Zenoh key-expression subscribers and arora methods as Zenoh queryables.
//!
//! ## Key Expression Layout
//!
//! - Slots: `{namespace}/slots/{slot_path}` (e.g., `vizij/slots/face/mouth/open`)
//! - Methods: `{namespace}/methods/{method_path}` (e.g., `vizij/methods/reset`)
//!
//! This layout mirrors the ROS 2 topic/service naming but uses Zenoh key
//! expressions instead. External tools can subscribe to `vizij/slots/**` to
//! observe all slot updates, or query `vizij/methods/*` to discover methods.
//!
//! ## Subscriber Architecture
//!
//! Each input slot gets its own Zenoh subscriber, running in a dedicated tokio
//! task that feeds received values into a shared `mpsc` channel. A single
//! driver task consumes that channel and forwards updates to the
//! [`SetSlotValuesHandler`].
//!
//! This design differs from the ROS 2 implementation (which merges streams
//! via `futures::select_all`) because Zenoh's `recv_async()` is natively
//! async — no `unfold`-based stream adapter is needed — and each subscriber
//! task can handle its own errors independently.

use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;

use arora_connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, InvokeResult, MethodHandler,
    MethodInfo, OnClientConnectedHandler, SetSlotValuesHandler, SlotInfo, Value,
};
use log::{debug, info, warn};
use tokio::sync::{watch, RwLock};
use tokio::task::{AbortHandle, JoinHandle};

/// Zenoh implementation of [`AroraConnection`].
///
/// Creates one Zenoh subscriber per input slot and one Zenoh queryable per
/// method. Zenoh's built-in discovery replaces explicit ListSlots/ListMethods.
///
/// ## Configuration
///
/// An optional Zenoh configuration file path can be provided for advanced
/// setups (e.g., connecting to a remote Zenoh router, disabling multicast
/// scouting, or tuning transport parameters). When `None`, Zenoh defaults to
/// peer-to-peer mode with UDP multicast scouting on the local network.
pub struct AroraZenohSession {
    namespace: String,
    config_path: Option<PathBuf>,
    set_slot_values_handler: RwLock<Option<SetSlotValuesHandler>>,
    get_slot_values_handler: RwLock<Option<GetSlotValuesHandler>>,
    on_client_connected_handler: RwLock<Option<OnClientConnectedHandler>>,
    methods: RwLock<Vec<(MethodInfo, MethodHandler)>>,
    slots_tx: watch::Sender<Vec<SlotInfo>>,
    slots_rx: watch::Receiver<Vec<SlotInfo>>,
    is_running: RwLock<bool>,
}

impl AroraZenohSession {
    /// Create a new Zenoh session configuration.
    ///
    /// The session is **not** opened until [`AroraConnection::run`] is called.
    ///
    /// # Arguments
    ///
    /// * `namespace` — Key-expression prefix for all slots and methods
    ///   (e.g., `"vizij"`). Must not contain wildcards.
    /// * `config_path` — Optional path to a Zenoh JSON5 configuration file.
    ///   When `None`, uses the default peer-to-peer config with multicast
    ///   scouting enabled.
    pub fn new(namespace: &str, config_path: Option<PathBuf>) -> Self {
        let (slots_tx, slots_rx) = watch::channel(Vec::new());
        Self {
            namespace: namespace.to_string(),
            config_path,
            set_slot_values_handler: RwLock::new(None),
            get_slot_values_handler: RwLock::new(None),
            on_client_connected_handler: RwLock::new(None),
            methods: RwLock::new(Vec::new()),
            slots_tx,
            slots_rx,
            is_running: RwLock::new(false),
        }
    }
}

impl AroraConnection for AroraZenohSession {
    fn set_slots(&self, slots: Vec<SlotInfo>) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            let _ = self.slots_tx.send(slots);
        })
    }

    fn set_set_slot_values_handler(
        &self,
        handler: SetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            *self.set_slot_values_handler.write().await = Some(handler);
        })
    }

    fn set_get_slot_values_handler(
        &self,
        handler: GetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            *self.get_slot_values_handler.write().await = Some(handler);
        })
    }

    fn register_method(
        &self,
        info: MethodInfo,
        handler: MethodHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.methods.write().await.push((info, handler));
        })
    }

    fn respond_slot_values(&self, _values: HashMap<String, Value>) {
        // No-op: Zenoh uses a push model via subscribers. There are no
        // pending GetSlotValues requests to respond to — values arrive
        // asynchronously through put() and are forwarded by the subscriber
        // driver.
    }

    fn run(
        &self,
        cancel_token: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
        Box::pin(async move {
            // ── 1. Open Zenoh session ───────────────────────────────────
            //
            // `zenoh::open()` starts the Zenoh runtime, joins the network
            // (via multicast scouting or configured locators), and returns
            // a `Session` handle. The session is `Arc`-based internally and
            // can be cloned cheaply for use across tasks.
            let config = match &self.config_path {
                Some(path) => zenoh::Config::from_file(path).map_err(|e| {
                    format!(
                        "failed to load Zenoh config from {}: {e}",
                        path.display()
                    )
                })?,
                None => zenoh::Config::default(),
            };

            let session = zenoh::open(config)
                .await
                .map_err(|e| format!("failed to open Zenoh session: {e}"))?;

            // ── 2. Collect abort handles for cleanup ────────────────────
            let mut abort_handles: Vec<AbortHandle> = Vec::new();

            // ── 3. Create queryables for each registered method ─────────
            //
            // Zenoh queryables serve the same role as ROS 2 services: a
            // remote client sends a `get` query (optionally with a payload
            // containing method arguments) and receives a reply with the
            // result. We mark each queryable as `complete(true)` to signal
            // that it is the authoritative responder for its key expression
            // (as opposed to a cache or storage backend).
            let methods = self.methods.read().await;

            for (info, handler) in methods.iter() {
                let key_expr = format!("{}/methods/{}", self.namespace, info.path);
                match spawn_method_queryable(&session, &key_expr, handler.clone()).await {
                    Ok(abort) => {
                        info!("Zenoh queryable: {}", key_expr);
                        abort_handles.push(abort);
                    }
                    Err(e) => {
                        warn!(
                            "Failed to create queryable for method '{}': {}",
                            info.path, e
                        );
                    }
                }
            }

            drop(methods);

            // ── 4. Mark as running ──────────────────────────────────────
            *self.is_running.write().await = true;
            info!("Zenoh session started (namespace={})", self.namespace);

            // ── 5. React to slot changes (hot-reload) ───────────────────
            //
            // The slot subscription driver task is (re-)spawned whenever
            // `set_slots()` delivers a new list via the watch channel.
            // Before creating new subscribers we abort and await the
            // previous driver, ensuring old Zenoh subscribers are dropped
            // and unregistered from the session.
            let mut slots_rx = self.slots_rx.clone();
            let mut slot_driver_handle: Option<JoinHandle<()>> = None;

            loop {
                tokio::select! {
                    _ = cancel_token.cancelled() => break,
                    result = slots_rx.changed() => {
                        if result.is_err() {
                            // Sender dropped — session is being destroyed.
                            break;
                        }

                        // Abort the previous slot driver and await its
                        // completion so that old subscribers are fully
                        // cleaned up before new ones are declared.
                        if let Some(prev) = slot_driver_handle.take() {
                            prev.abort();
                            tokio::select! {
                                biased;
                                _ = cancel_token.cancelled() => break,
                                _ = prev => {},
                            }
                        }

                        let slots = slots_rx.borrow_and_update().clone();
                        let handler = self.set_slot_values_handler.read().await;

                        if let Some(ref handler) = *handler {
                            let input_slots: Vec<(String, String)> = slots
                                .iter()
                                .filter(|s| s.kind.as_deref() == Some("input"))
                                .map(|s| {
                                    let key = format!(
                                        "{}/slots/{}",
                                        self.namespace, s.path
                                    );
                                    (s.path.clone(), key)
                                })
                                .collect();

                            if !input_slots.is_empty() {
                                let handler = handler.clone();
                                let session = session.clone();

                                slot_driver_handle = Some(tokio::spawn(
                                    drive_slot_subscribers(
                                        session,
                                        input_slots,
                                        handler,
                                    ),
                                ));
                            }
                        }
                    }
                }
            }

            // ── 6. Clean up ─────────────────────────────────────────────
            info!("Zenoh session shutting down");
            *self.is_running.write().await = false;

            if let Some(handle) = slot_driver_handle {
                handle.abort();
                let _ = handle.await;
            }
            for handle in abort_handles {
                handle.abort();
            }

            // Close the Zenoh session explicitly so that undeclare messages
            // are sent to peers before the runtime shuts down.
            session
                .close()
                .await
                .map_err(|e| format!("Zenoh close error: {e}"))?;

            Ok(())
        })
    }

    fn is_running(&self) -> Pin<Box<dyn Future<Output = bool> + Send + '_>> {
        Box::pin(async move { *self.is_running.read().await })
    }

    fn connection_id(&self) -> String {
        format!("zenoh://{}", self.namespace)
    }

    fn set_on_client_connected_handler(
        &self,
        handler: OnClientConnectedHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            *self.on_client_connected_handler.write().await = Some(handler);
        })
    }

    fn disconnect_client(&self) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        // No-op: Zenoh pub/sub is fully decoupled. There is no concept of a
        // "connected client" — publishers and subscribers interact through the
        // Zenoh routing fabric without maintaining point-to-point sessions.
        Box::pin(async {})
    }
}

// =========================================================================
// Helpers
// =========================================================================

/// Declare a Zenoh queryable for a single method and spawn a task to handle
/// incoming queries.
///
/// The query/reply protocol works as follows:
/// 1. A remote client calls `session.get("{ns}/methods/{path}")` with an
///    optional JSON payload containing method arguments.
/// 2. This queryable receives the query, deserializes the args, invokes the
///    `MethodHandler`, and replies with a JSON object:
///    `{"success": bool, "value": <Value|null>, "message": <string|null>}`.
/// 3. The client receives the reply via `replies.recv_async()`.
///
/// We set `complete(true)` on the queryable to indicate it is the
/// **authoritative** responder for this key expression. Without this flag
/// Zenoh treats the queryable as a "storage" that only provides cached data,
/// which affects query routing when multiple queryables overlap.
async fn spawn_method_queryable(
    session: &zenoh::Session,
    key_expr: &str,
    handler: MethodHandler,
) -> Result<AbortHandle, String> {
    let queryable = session
        .declare_queryable(key_expr)
        .complete(true)
        .await
        .map_err(|e| format!("failed to declare queryable '{key_expr}': {e}"))?;

    Ok(tokio::spawn(async move {
        loop {
            match queryable.recv_async().await {
                Ok(query) => {
                    // Parse method arguments from the query payload.
                    // An empty or absent payload maps to an empty arg set.
                    let args: HashMap<String, Value> = query
                        .payload()
                        .and_then(|p| {
                            let bytes = p.to_bytes();
                            if bytes.is_empty() {
                                return None;
                            }
                            match serde_json::from_slice(&bytes) {
                                Ok(v) => Some(v),
                                Err(e) => {
                                    warn!("Failed to parse queryable args: {e}");
                                    None
                                }
                            }
                        })
                        .unwrap_or_default();

                    let result: InvokeResult = handler(args);

                    // Serialize the response as JSON.
                    let response = serde_json::json!({
                        "success": result.success,
                        "value": result.value,
                        "message": result.message,
                    });
                    let payload = serde_json::to_vec(&response).unwrap_or_default();

                    if let Err(e) = query.reply(query.key_expr(), payload).await {
                        warn!("Failed to send queryable reply: {e}");
                    }
                }
                Err(e) => {
                    // Channel closed — queryable was undeclared (shutdown).
                    debug!("Queryable channel closed: {e}");
                    break;
                }
            }
        }
    })
    .abort_handle())
}

/// Subscribe to all slot key expressions and forward values to the handler.
///
/// For each slot a dedicated tokio task is spawned that loops on
/// `subscriber.recv_async()` and sends `(path, Value)` tuples to a shared
/// `mpsc` channel. A driver loop consumes the channel and calls the
/// `SetSlotValuesHandler` for each update.
///
/// This approach was chosen over `futures::select_all` (used by `arora-ros2`)
/// because Zenoh's subscriber API is natively async — there is no need for
/// the `unfold`-based stream adapter that the DDS implementation requires.
/// Each subscriber task handles its own deserialization errors independently,
/// and adding/removing subscribers is a matter of spawning/aborting tasks.
async fn drive_slot_subscribers(
    session: zenoh::Session,
    slot_paths: Vec<(String, String)>, // (arora_path, key_expr)
    handler: SetSlotValuesHandler,
) {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<(String, Value)>(256);
    let mut subscriber_handles: Vec<AbortHandle> = Vec::new();

    for (arora_path, key_expr) in &slot_paths {
        match session.declare_subscriber(key_expr).await {
            Ok(subscriber) => {
                info!("Zenoh subscriber: {}", key_expr);
                let tx = tx.clone();
                let path = arora_path.clone();
                let ke = key_expr.clone();

                subscriber_handles.push(
                    tokio::spawn(async move {
                        loop {
                            match subscriber.recv_async().await {
                                Ok(sample) => {
                                    let bytes = sample.payload().to_bytes();
                                    match serde_json::from_slice::<Value>(&bytes) {
                                        Ok(value) => {
                                            debug!("Received on {}: {:?}", ke, value);
                                            if tx.send((path.clone(), value)).await.is_err()
                                            {
                                                break; // Receiver dropped
                                            }
                                        }
                                        Err(e) => {
                                            warn!(
                                                "Failed to parse JSON Value from {}: {e}",
                                                ke
                                            );
                                        }
                                    }
                                }
                                Err(e) => {
                                    debug!("Subscriber {} closed: {e}", ke);
                                    break;
                                }
                            }
                        }
                    })
                    .abort_handle(),
                );
            }
            Err(e) => {
                warn!("Failed to subscribe to '{}': {e}", key_expr);
            }
        }
    }

    // Drop the original sender so `rx` will close once all subscriber
    // tasks finish (each holds its own clone).
    drop(tx);

    // Forward received values to the handler. Each slot update is delivered
    // as a single-entry HashMap, matching the ROS 2 implementation's
    // per-message delivery behavior.
    while let Some((path, value)) = rx.recv().await {
        let values = HashMap::from([(path, value)]);
        if let Err(e) = handler(values) {
            warn!("set_slot_values_handler error: {e}");
        }
    }

    // Clean up subscriber tasks (if any are still running).
    for handle in subscriber_handles {
        handle.abort();
    }
}
