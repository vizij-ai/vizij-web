//! [`WsBridge`]: the Vizij WebSocket server driven as an Arora
//! [`Bridge`](arora_bridge::Bridge) (Phase 5C).
//!
//! The WS server is a parallel reimplementation of `arora-bridge`. This adapter
//! folds it onto the real thing: each incoming protocol message becomes a
//! [`BridgeCommand`] on [`commands`](Bridge::commands), and the consumer — the
//! Arora runtime — reacts to the ones it cares about (value-updates apply to the
//! store, reads reply). Runtime state flows back out through
//! [`send_data`](Bridge::send_data) as a `slot_values_changed` push.
//!
//! The server's existing handler API is kept and *built on top of* the command
//! stream: the handlers registered here simply translate a message into a
//! command. After Phase 5B `arora_connection::Value` is `arora_types::Value`, so
//! the translation is structural, not a conversion.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use arora_bridge::{
    Bridge, BridgeCommand, BridgeOp, BridgeResult, CommandStream, DataRequestedStream, DeviceInfo,
    DeviceInfoStream,
};
use arora_types::data::{Key, StateChange};
use arora_types::value::Value;
use async_trait::async_trait;
use futures::channel::{mpsc, oneshot};

use crate::messages::Outgoing;
use crate::server::AroraWSServer;

/// The Vizij WebSocket server as an Arora [`Bridge`].
pub struct WsBridge {
    server: Arc<AroraWSServer>,
    /// The receiving half of the command stream, handed out once by [`commands`].
    commands: Mutex<Option<mpsc::UnboundedReceiver<BridgeCommand>>>,
}

impl WsBridge {
    /// Wrap a server: register handlers that turn each incoming message into a
    /// [`BridgeCommand`] on the [`commands`](Bridge::commands) stream.
    pub async fn new(server: Arc<AroraWSServer>) -> Self {
        let (cmd_tx, cmd_rx) = mpsc::unbounded::<BridgeCommand>();

        // SetSlotValues -> Update. The handler is synchronous, so enqueue the
        // command and acknowledge; the runtime applies it on its next step.
        let tx = cmd_tx.clone();
        server
            .set_set_slot_values_handler(move |values: HashMap<String, Value>| {
                let mut change = StateChange::new();
                for (path, value) in values {
                    change.set.insert(Key::from(path), Some(value));
                }
                let (reply_tx, _reply_rx) = oneshot::channel();
                tx.unbounded_send(BridgeCommand::new(BridgeOp::Update(change), reply_tx))
                    .map_err(|_| "bridge command channel closed".to_string())
            })
            .await;

        // GetSlotValues -> Get, awaiting the runtime's reply.
        let tx = cmd_tx.clone();
        server
            .set_get_slot_values_handler(Arc::new(move |slots: Vec<String>| {
                let tx = tx.clone();
                Box::pin(async move {
                    let keys: Vec<Key> = slots.iter().cloned().map(Key::from).collect();
                    let (reply_tx, reply_rx) = oneshot::channel();
                    if tx
                        .unbounded_send(BridgeCommand::new(BridgeOp::Get(keys), reply_tx))
                        .is_err()
                    {
                        return HashMap::new();
                    }
                    match reply_rx.await {
                        Ok(Ok(result)) => values_from_get(&slots, result.ret),
                        _ => HashMap::new(),
                    }
                }) as _
            }))
            .await;

        Self {
            server,
            commands: Mutex::new(Some(cmd_rx)),
        }
    }
}

/// Decode a `Get` reply — an `ArrayValue` of `Option`s in request order — into a
/// `path -> value` map.
fn values_from_get(slots: &[String], ret: Value) -> HashMap<String, Value> {
    let mut out = HashMap::new();
    if let Value::ArrayValue(items) = ret {
        for (slot, item) in slots.iter().zip(items) {
            if let Value::Option(Some(value)) = item {
                out.insert(slot.clone(), *value);
            }
        }
    }
    out
}

#[async_trait]
impl Bridge for WsBridge {
    async fn get_device_info(&self) -> BridgeResult<Option<DeviceInfo>> {
        // Vizij has no device-registration concept.
        Ok(None)
    }

    async fn device_info_updated(&self) -> BridgeResult<DeviceInfoStream> {
        Ok(Box::pin(futures::stream::empty()))
    }

    async fn update_device_info(
        &self,
        info: Option<DeviceInfo>,
    ) -> BridgeResult<Option<DeviceInfo>> {
        Ok(info)
    }

    async fn data_requested(&self) -> DataRequestedStream {
        // A connected editor is a data consumer; signal interest once.
        Box::pin(futures::stream::once(async { true }))
    }

    async fn send_data(&self, data: StateChange) -> BridgeResult<()> {
        // Push the changed slots to the connected client(s).
        let mut values = HashMap::new();
        for (key, value) in data.set {
            if let Some(value) = value {
                values.insert(key.path, value);
            }
        }
        if !values.is_empty() {
            self.server.push(Outgoing::SlotValuesChanged { values });
        }
        Ok(())
    }

    async fn commands(&self) -> CommandStream {
        match self.commands.lock().unwrap().take() {
            Some(rx) => Box::pin(rx),
            None => Box::pin(futures::stream::empty()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::server::ServerConfig;

    #[tokio::test]
    async fn send_data_pushes_slot_values_changed() {
        let server = Arc::new(AroraWSServer::new(ServerConfig::default()));
        let bridge = WsBridge::new(server.clone()).await;
        let mut rx = server.subscribe();

        bridge
            .send_data(StateChange::set("face/mouth", Value::F64(0.5)))
            .await
            .expect("send_data");

        match rx.recv().await.expect("a push") {
            Outgoing::SlotValuesChanged { values } => {
                assert_eq!(values.get("face/mouth"), Some(&Value::F64(0.5)));
            }
            other => panic!("expected SlotValuesChanged, got {other:?}"),
        }
    }
}
