//! The Studio pump's plumbing.
//!
//! The device itself is ONE `arora` run (built in `lib.rs`): the interpreter,
//! the modules, the built-in keys, and the WS/ROS 2 bridge pumps all live
//! there. The Studio connection stays outside the run, on its own thread: its
//! device registration follows the in-UI owner prompt live, and it outlives
//! the run, which is rebuilt whenever the webview advertises another key
//! catalog. Studio's commands still reach the run: a [`StudioRelay`] is one of
//! the run's bridges, and the pump forwards each command to the relay of the
//! run in place. The run answers them as it answers every bridge's — a write
//! reaches only the keys the store opens, of the type they state.

use arora_bridge::{
    AccessDecision, AccessRequestStream, Bridge, BridgeResult, DeviceInfo, Inbound, InboundStream,
};
use arora_types::data::StateChange;
use async_trait::async_trait;
use futures_util::stream::StreamExt;
use log::{debug, info, warn};
use tokio::sync::{mpsc, watch};
use tokio_util::sync::CancellationToken;

/// Where Studio's commands go: the inbound channel of the run in place, `None`
/// while no run is.
pub type RunInbound = watch::Receiver<Option<mpsc::UnboundedSender<Inbound>>>;

/// The run's end of the Studio connection: a bridge whose inbound stream is
/// what the pump forwards. Outbound state needs nothing of it — the pump
/// publishes the shared store's changes itself — and the device's registration
/// is the pump's.
pub struct StudioRelay {
    inbound: Option<mpsc::UnboundedReceiver<Inbound>>,
}

impl StudioRelay {
    /// A relay, and the sender the pump forwards Studio's commands through.
    pub fn new() -> (Self, mpsc::UnboundedSender<Inbound>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (Self { inbound: Some(rx) }, tx)
    }
}

#[async_trait]
impl Bridge for StudioRelay {
    fn take_inbound(&mut self) -> InboundStream {
        let mut rx = self
            .inbound
            .take()
            .expect("the inbound stream is taken once");
        Box::pin(futures_util::stream::poll_fn(move |cx| rx.poll_recv(cx)))
    }

    fn try_send(&mut self, _change: &StateChange) {}

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

/// Handle one inbound Studio event: a command goes to the run in place, which
/// answers it; with no run, it is refused.
pub fn handle_inbound(run: &RunInbound, event: Inbound) {
    match event {
        Inbound::Command(cmd) => {
            let Some(tx) = run.borrow().clone() else {
                return cmd.reply(Err("the device is not running".to_string()));
            };
            if let Err(mpsc::error::SendError(Inbound::Command(cmd))) =
                tx.send(Inbound::Command(cmd))
            {
                cmd.reply(Err("the device is not running".to_string()));
            }
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
/// No bridge of this app does session-join access control: Studio grants
/// implicitly, and tying the task to `cancel` keeps it from outliving its pump.
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

#[cfg(test)]
mod tests {
    use super::*;
    use arora_bridge::{BridgeCommand, BridgeOp};
    use arora_simple_data_store::SimpleDataStore;
    use arora_types::data::{DataStore, Key, KeyMeta};
    use arora_types::value::{Type, Value};
    use futures_channel::oneshot;
    use std::collections::HashMap;
    use std::time::Duration;

    /// Forward `op` as Studio would send it and wait for the run's answer,
    /// stepping `arora` until it comes.
    fn ask(arora: &mut arora::Arora, run: &RunInbound, op: BridgeOp) -> Result<Value, String> {
        let (tx, mut rx) = oneshot::channel();
        handle_inbound(run, Inbound::Command(BridgeCommand::new(op, tx)));
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

    /// Studio's writes reach the run, which applies the store's meta to them
    /// as to every bridge's: an open key of the stated type is written, a
    /// closed key or another type is refused and writes nothing.
    #[test]
    fn studio_commands_are_answered_by_the_run() {
        let store = SimpleDataStore::new();
        store
            .set_meta(HashMap::from([(
                Key::from("rig/face/jaw_open"),
                KeyMeta::new().editable().of_type(Type::F64),
            )]))
            .expect("the store keeps meta");
        let (relay, tx) = StudioRelay::new();
        let (_run_tx, run) = watch::channel(Some(tx));
        let mut arora = arora::Arora::builder()
            .with_data_store(Box::new(store.clone()))
            .with_bridge(Box::new(relay))
            .build()
            .expect("the device composes");
        let read = |path: &str| store.read(&[Key::from(path)]).into_iter().next().flatten();

        assert!(ask(
            &mut arora,
            &run,
            update("rig/face/jaw_open", Value::F64(0.5))
        )
        .is_ok());
        assert_eq!(read("rig/face/jaw_open"), Some(Value::F64(0.5)));

        let ill_typed = ask(
            &mut arora,
            &run,
            update("rig/face/jaw_open", Value::F32(0.2)),
        );
        assert!(ill_typed
            .unwrap_err()
            .contains("not of the key's declared type"));
        assert_eq!(read("rig/face/jaw_open"), Some(Value::F64(0.5)));

        let closed = ask(&mut arora, &run, update("rig/face/other", Value::F64(1.0)));
        assert!(closed.unwrap_err().contains("not an input"));
        assert_eq!(read("rig/face/other"), None);

        let listed = ask(
            &mut arora,
            &run,
            BridgeOp::ListKeys {
                prefix: Some("rig/".into()),
            },
        )
        .expect("ListKeys answers");
        let listed: Vec<(String, KeyMeta)> =
            arora_types::value_serde::from_value(listed).expect("keys with their meta");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].0, "rig/face/jaw_open");
        assert!(listed[0].1.editable);
    }

    /// With no run in place, a command is refused rather than left unanswered.
    #[test]
    fn a_command_with_no_run_is_refused() {
        let (_run_tx, run) = watch::channel(None);
        let (tx, mut rx) = oneshot::channel();
        handle_inbound(
            &run,
            Inbound::Command(BridgeCommand::new(BridgeOp::Get(Vec::new()), tx)),
        );
        let answer = rx
            .try_recv()
            .expect("the reply is not cancelled")
            .expect("answered at once");
        assert_eq!(answer.unwrap_err(), "the device is not running");
    }
}
