//! WebSocket server implementation of AroraConnection.
//!
//! This module provides a WebSocket-based implementation of the AroraConnection
//! trait, wrapping `arora_websocket::AroraWSServer`.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use arora_websocket::{AroraWSServer, ServerConfig};
use log::warn;

use crate::connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, MethodHandler, MethodInfo,
    OnClientConnectedHandler, SetSlotValuesHandler, SlotInfo, Value,
};

/// WebSocket implementation of AroraConnection.
///
/// Wraps `arora_websocket::AroraWSServer` and delegates all trait methods
/// to the underlying server.
pub struct WsServer {
    server: Arc<AroraWSServer>,
}

impl WsServer {
    /// Create a new WebSocket server on the specified port.
    pub fn new(port: u16, serve_control_panel: bool) -> Self {
        let config = ServerConfig::with_port(port)
            .validate_paths(true)
            .serve_control_panel(serve_control_panel);
        Self {
            server: Arc::new(AroraWSServer::new(config)),
        }
    }
}

impl AroraConnection for WsServer {
    fn set_slots(
        &self,
        slots: Vec<SlotInfo>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server.registry().set_slots(slots).await;
        })
    }

    fn set_set_slot_values_handler(
        &self,
        handler: SetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server
                .set_set_slot_values_handler(move |values| handler(values))
                .await;
        })
    }

    fn set_get_slot_values_handler(
        &self,
        handler: GetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server.set_get_slot_values_handler(handler).await;
        })
    }

    fn register_method(
        &self,
        info: MethodInfo,
        handler: MethodHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server
                .registry()
                .register_method_fn(info, move |args| handler(args))
                .await;
        })
    }

    fn respond_slot_values(&self, _values: HashMap<String, Value>) {
        warn!("respond_slot_values called on WsServer directly; use ConnectionManager instead");
    }

    fn run(
        &self,
        cancel_token: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
        Box::pin(async move { self.server.run(cancel_token).await })
    }

    fn is_running(&self) -> Pin<Box<dyn Future<Output = bool> + Send + '_>> {
        Box::pin(async move { self.server.is_running().await })
    }

    fn connection_id(&self) -> String {
        format!("ws://127.0.0.1:{}", self.server.port())
    }

    fn set_on_client_connected_handler(
        &self,
        handler: OnClientConnectedHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server.set_on_client_connected_handler(handler).await;
        })
    }

    fn disconnect_client(&self) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
        Box::pin(async move {
            self.server.disconnect_client().await;
        })
    }
}
