//! The Studio pump's plumbing.
//!
//! The device itself is ONE `arora` run (built in `lib.rs`): the interpreter,
//! the modules, the built-in keys, and the WS/ROS 2 bridge pumps all live
//! there. Only the Studio bridge stays outside the run, on its own thread —
//! its device registration follows the in-UI owner prompt live, a lifecycle
//! the run does not model — and this module is its inbound handler: `Update`s
//! land in the shared store (the store-mirror thread forwards them to the
//! webview; the store's subscription fans them to the run's bridges), `Get`s
//! and `ListKeys` answer from it, and the method plane defers to the run.

use arora_bridge::{AccessDecision, AccessRequestStream, BridgeOp, Inbound};
use arora_simple_data_store::SimpleDataStore;
use arora_types::call::CallResult;
use arora_types::data::DataStore;
use arora_types::value::Value;
use futures_util::stream::StreamExt;
use log::{debug, info, warn};
use tokio_util::sync::CancellationToken;

/// Apply one inbound Studio event against the shared store.
pub fn handle_inbound(store: &SimpleDataStore, event: Inbound) {
    match event {
        Inbound::Command(cmd) => {
            let result = match &cmd.op {
                BridgeOp::Update(change) => match store.write(change.clone()) {
                    // The store-mirror thread forwards the change to the
                    // webview — one path for every writer.
                    Ok(()) => Ok(CallResult {
                        ret: Value::Unit,
                        mutated: Vec::new(),
                    }),
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
                // The method plane (ListMethods/DescribeMethods/Call) lives on
                // the device run's bridges; this pump serves the Studio data
                // plane only.
                #[allow(deprecated)]
                BridgeOp::ListMethods { .. } => Ok(CallResult {
                    ret: Value::ArrayValue(Vec::new()),
                    mutated: Vec::new(),
                }),
                BridgeOp::DescribeMethods { .. } => Ok(CallResult {
                    ret: Value::ArrayValue(Vec::new()),
                    mutated: Vec::new(),
                }),
                BridgeOp::Call(_) => Err("calls are not served on this endpoint".to_string()),
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
