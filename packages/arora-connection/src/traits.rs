//! Abstract connection trait for the Arora protocol.
//!
//! This module defines the `AroraConnection` trait which abstracts the communication
//! protocol used to connect external clients to an Arora-compatible runtime.
//! Implementations can use WebSocket, IPC, gRPC, or other protocols.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use arora_schema::value::Value;

#[cfg(feature = "async")]
use tokio_util::sync::CancellationToken;

use crate::method::{InvokeResult, MethodInfo};
use crate::slot::SlotInfo;

/// Result type for set slot values handler.
pub type SetSlotValuesResult = Result<(), String>;

/// Handler function type for SetSlotValues messages.
/// Called when an external client wants to update slot values.
pub type SetSlotValuesHandler =
    Arc<dyn Fn(HashMap<String, Value>) -> SetSlotValuesResult + Send + Sync>;

/// Handler function type for GetSlotValues messages.
/// Called when an external client wants to read current slot values.
/// Returns a map of slot paths to their current values.
pub type GetSlotValuesHandler = Arc<dyn Fn(Vec<String>) -> HashMap<String, Value> + Send + Sync>;

/// Handler function type for method invocations.
pub type MethodHandler = Arc<dyn Fn(HashMap<String, Value>) -> InvokeResult + Send + Sync>;

/// Handler called when a new client connects to this connection.
/// Receives the connection identifier (e.g., "ws://127.0.0.1:9000").
pub type OnClientConnectedHandler = Arc<dyn Fn(String) + Send + Sync>;

/// Abstract interface for an Arora protocol connection.
///
/// This trait defines the contract for any connection type that bridges
/// external clients to an Arora-compatible runtime. Implementations handle the
/// protocol-specific details (WebSocket, IPC, etc.) while providing
/// a consistent interface to the application.
///
/// # Lifecycle
///
/// 1. Create the connection with protocol-specific configuration
/// 2. Set up handlers for slot value operations
/// 3. Register any custom methods via `register_method`
/// 4. Call `run` to start accepting connections
/// 5. Use `respond_slot_values` when async responses are needed
#[cfg(feature = "async")]
#[allow(async_fn_in_trait)]
pub trait AroraConnection: Send + Sync {
    /// Set the available slots that clients can interact with.
    ///
    /// This is typically called when a model is loaded and we know
    /// what input paths are available.
    fn set_slots(
        &self,
        slots: Vec<SlotInfo>,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Set the handler for SetSlotValues messages.
    ///
    /// Called when an external client wants to update slot values.
    /// The handler receives a map of paths to values and should apply
    /// them to the runtime.
    fn set_set_slot_values_handler(
        &self,
        handler: SetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Set the handler for GetSlotValues messages.
    ///
    /// Called when an external client wants to read current slot values.
    /// The handler receives a list of paths and should return their
    /// current values from the runtime.
    fn set_get_slot_values_handler(
        &self,
        handler: GetSlotValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Register a method that can be invoked by external clients.
    ///
    /// Methods are identified by path and can accept parameters.
    /// This is used for operations like "reset" that don't fit the
    /// slot value model.
    fn register_method(
        &self,
        info: MethodInfo,
        handler: MethodHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Respond to a pending GetSlotValues request.
    ///
    /// Some implementations may need async value retrieval (e.g., from
    /// a frontend). This method provides the response to a pending
    /// request that was initiated by the GetSlotValues handler.
    fn respond_slot_values(&self, values: HashMap<String, Value>);

    /// Run the connection, accepting clients until cancelled.
    ///
    /// Returns an error if the connection cannot be established.
    fn run(
        &self,
        cancel_token: CancellationToken,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>>;

    /// Check if the connection is currently running.
    fn is_running(&self) -> Pin<Box<dyn Future<Output = bool> + Send + '_>>;

    /// Get the connection identifier (e.g., "ws://127.0.0.1:9000" for WebSocket).
    fn connection_id(&self) -> String;

    /// Set a handler that is called when a new client connects.
    ///
    /// The handler receives the connection identifier. It is called before
    /// the client enters its message loop. Used by the ConnectionManager
    /// to enforce exclusive client policy across connections.
    fn set_on_client_connected_handler(
        &self,
        handler: OnClientConnectedHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Disconnect the current active client on this connection.
    ///
    /// Each connection supports at most one active client. This method
    /// forcefully closes that client's connection (e.g., sends a WS Close
    /// frame and drops the connection).
    fn disconnect_client(&self) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;
}
