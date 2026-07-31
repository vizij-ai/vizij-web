//! The multi-bridge host.
//!
//! One [`SimpleDataStore`] is the device's blackboard; several
//! [`arora_bridge::Bridge`] endpoints attach to it — a WebSocket bridge
//! ([`arora_bridge_ws`]), an optional ROS 2 data-topic bridge
//! ([`arora_bridge_ros2`]), and (built in `lib.rs`) the Studio Zenoh bridge —
//! each sharing the SAME store.
//!
//! This module reimplements arora's multi-bridge write/read loop on plain
//! stable, without the engine or a HAL (so it never touches the nightly
//! `-Z bindeps` toolchain arora's `run_with_*` would pull in): each endpoint's
//! inbound stream is taken once and merged with `select_all`; inbound `Update`s
//! are applied to the store (and mirrored to the webview via the `update-values`
//! Tauri event) and `Get`s answered from it; and every store change is fanned
//! back out to every attached endpoint through `try_send`.
//!
//! # Why several small pumps rather than one
//!
//! The store is `Clone`-to-share (clones back the same storage), so each pump
//! subscribes to the same blackboard and cross-pump propagation happens for
//! free: a write from any endpoint notifies every pump's subscription. Splitting
//! the pumps lets each bridge follow its own lifecycle — the WS bridge's
//! handlers must be registered *before* the server starts serving (the serve
//! loop snapshots them once), the ROS 2 bridge must be rebuilt when the input
//! key set changes (a ROS 2 topic is typed and declared up front), and the
//! Studio bridge lives for the whole process on its own thread. One shared store
//! is the spine; [`run_pump`] is the reusable body.

use std::collections::HashMap;

use arora_bridge::{AccessDecision, AccessRequestStream, Bridge, BridgeOp, Inbound};
use arora_simple_data_store::SimpleDataStore;
use arora_types::call::CallResult;
use arora_types::data::{DataStore, StateChange};
use arora_types::value::Value;
use futures_util::stream::{select_all, StreamExt};
use log::{debug, info, warn};
use tauri::{AppHandle, Emitter};
use tokio_util::sync::CancellationToken;

use crate::skills::SharedSkillHost;

/// Drive a set of bridge endpoints against a shared store until `cancel` fires
/// (or every endpoint disconnects).
///
/// This is the hand-rolled equivalent of arora's step loop restricted to the
/// bridge seam (no HAL, no behavior, no engine): merge every endpoint's inbound
/// stream, apply its commands to the store (mirroring writes to the webview),
/// and fan every store change back out to every endpoint.
pub async fn run_pump(
    store: SimpleDataStore,
    app: AppHandle,
    skills: SharedSkillHost,
    mut bridges: Vec<Box<dyn Bridge>>,
    cancel: CancellationToken,
) {
    // Take each endpoint's inbound stream once (the take-once seam), then merge.
    let streams: Vec<_> = bridges.iter_mut().map(|b| b.take_inbound()).collect();
    let mut inbound = select_all(streams);

    // Bridge the store's std-channel subscription into an async channel so the
    // select loop can await state changes alongside the inbound stream. The
    // forwarding thread ends when the pump is torn down (its send fails once the
    // receiver is dropped), which drops the `Subscription` and prunes it from
    // the store.
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
            _ = cancel.cancelled() => break,
            maybe_change = change_rx.recv() => {
                match maybe_change {
                    // Phase 6b — fan the change out to every endpoint. Each
                    // buffers onto its own transport; none blocks.
                    Some(change) => {
                        for bridge in bridges.iter_mut() {
                            bridge.try_send(&change);
                        }
                    }
                    None => break,
                }
            }
            maybe_event = inbound.next() => {
                match maybe_event {
                    Some(event) => handle_inbound(&store, &app, &skills, event),
                    // Every endpoint's inbound stream ended: all disconnected.
                    None => break,
                }
            }
        }
    }
}

/// Apply one inbound event against the store, mirroring writes to the webview.
///
/// Shared by every pump ([`run_pump`] here and the Studio pump in `lib.rs`).
/// `Update`s land in the store (which fans them to every endpoint via the
/// subscription) and are emitted to the webview as `update-values` so the wasm
/// runtime applies them; `Get`s are answered from the store; `ListKeys`
/// enumerates the live keys. Note the webview mirror (the `publish_values`
/// command) writes to the store WITHOUT going through here, so its own values
/// are never echoed back to it as `update-values`.
pub fn handle_inbound(
    store: &SimpleDataStore,
    app: &AppHandle,
    skills: &SharedSkillHost,
    event: Inbound,
) {
    match event {
        Inbound::Command(cmd) => {
            let result = match &cmd.op {
                BridgeOp::Update(change) => match store.write(change.clone()) {
                    Ok(()) => {
                        emit_update_values(app, change);
                        Ok(CallResult {
                            ret: Value::Unit,
                            mutated: Vec::new(),
                        })
                    }
                    Err(e) => Err(e.to_string()),
                },
                BridgeOp::Get(keys) => {
                    let array = store
                        .read(keys)
                        .into_iter()
                        .map(|v| Value::Option(v.map(Box::new)))
                        .collect();
                    Ok(CallResult {
                        ret: Value::ArrayValue(array),
                        mutated: Vec::new(),
                    })
                }
                BridgeOp::ListKeys { prefix } => {
                    let snapshot = store.snapshot();
                    let mut paths: Vec<String> = snapshot
                        .storage
                        .iter()
                        .filter(|(_, value)| value.is_some())
                        .map(|(key, _)| key.path.clone())
                        .filter(|path| prefix.as_ref().is_none_or(|p| path.starts_with(p.as_str())))
                        .collect();
                    paths.sort();
                    Ok(CallResult {
                        ret: Value::ArrayValue(paths.into_iter().map(Value::String).collect()),
                        mutated: Vec::new(),
                    })
                }
                // The skill plane: the described methods and the interpreter
                // module's SPAWN/HALT, served by the graph interpreter
                // ([`crate::skills`]). This is what a ROS 2 bridge's ROS4HRI
                // profile binds `/skill/look_at` through. (The WS-registry app
                // methods — reset, speak, transport — are a separate surface.)
                #[allow(deprecated)] // ListMethods stays answered for old callers.
                BridgeOp::ListMethods { prefix } => match skills.lock() {
                    Ok(host) => Ok(CallResult {
                        ret: Value::ArrayValue(
                            host.method_names(prefix.as_deref())
                                .into_iter()
                                .map(Value::String)
                                .collect(),
                        ),
                        mutated: Vec::new(),
                    }),
                    Err(_) => Err("the skill host is unavailable".to_string()),
                },
                BridgeOp::DescribeMethods { prefix } => match skills.lock() {
                    Ok(host) => Ok(CallResult {
                        ret: host.signatures(prefix.as_deref()),
                        mutated: Vec::new(),
                    }),
                    Err(_) => Err("the skill host is unavailable".to_string()),
                },
                BridgeOp::Call(call) => match skills.lock() {
                    Ok(mut host) => host.dispatch(call),
                    Err(_) => Err("the skill host is unavailable".to_string()),
                },
            };
            cmd.reply(result);
        }
        // A studio unregistration ends that endpoint; the pump sees the inbound
        // stream end (or a disconnect error) and stops on its own.
        Inbound::DeviceInfo(Ok(None)) => info!("bridge endpoint unregistered"),
        Inbound::DeviceInfo(Ok(Some(_info))) => {}
        Inbound::DeviceInfo(Err(e)) => warn!("bridge endpoint error: {e}"),
        Inbound::DataRequested(requested) => debug!("bridge data requested: {requested}"),
    }
}

/// Mirror the `set` side of a change to the webview as an `update-values` event,
/// so the wasm runtime applies remote writes. Unset keys have no webview
/// representation and are dropped.
fn emit_update_values(app: &AppHandle, change: &StateChange) {
    let mut values: HashMap<String, Value> = HashMap::new();
    for (key, value) in &change.set {
        if let Some(value) = value {
            values.insert(key.path.clone(), value.clone());
        }
    }
    if !values.is_empty() {
        if let Err(e) = app.emit("update-values", &values) {
            warn!("failed to emit update-values: {e}");
        }
    }
}

/// Serve a bridge's access requests, auto-approving each until `cancel` fires.
///
/// The WS and ROS 2 bridges use the default (never-yielding) request stream, so
/// this is a parked no-op for them; the Studio bridge currently also grants
/// implicitly. Auto-approval preserves the pre-migration behavior (no bridge did
/// session-join access control); tying it to `cancel` keeps the task from
/// outliving its pump.
pub async fn serve_access_auto_allow(mut requests: AccessRequestStream, cancel: CancellationToken) {
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
