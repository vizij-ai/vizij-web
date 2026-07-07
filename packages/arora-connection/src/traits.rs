//! Abstract connection trait for the Arora API.
//!
//! This module defines the `AroraConnection` trait which abstracts the transport
//! used to connect external clients to an Arora-compatible runtime.
//! Implementations can use WebSocket, IPC, gRPC, or other transports.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use arora_schema::value::Value;

#[cfg(feature = "async")]
use tokio_util::sync::CancellationToken;

use crate::key::KeyInfo;
use crate::method::{InvokeResult, MethodInfo};

/// Result type for write values handler.
pub type WriteValuesResult = Result<(), String>;

/// Handler function type for WriteValues messages.
/// Called when an external client wants to write values to keys.
pub type WriteValuesHandler =
    Arc<dyn Fn(HashMap<String, Value>) -> WriteValuesResult + Send + Sync>;

/// Handler function type for ReadValues messages.
/// Called when an external client wants to read the current values of keys.
/// Returns a map of key paths to their current values.
pub type ReadValuesHandler = Arc<
    dyn Fn(Vec<String>) -> Pin<Box<dyn Future<Output = HashMap<String, Value>> + Send>>
        + Send
        + Sync,
>;

/// Handler function type for method invocations.
pub type MethodHandler = Arc<dyn Fn(HashMap<String, Value>) -> InvokeResult + Send + Sync>;

/// Handler called when a new client connects to this connection.
/// Receives the connection identifier (e.g., "ws://127.0.0.1:9000").
pub type OnClientConnectedHandler = Arc<dyn Fn(String) + Send + Sync>;

/// Abstract interface for a connection speaking the Arora API.
///
/// This trait defines the contract for any connection type that bridges
/// external clients to an Arora-compatible runtime. Implementations handle the
/// transport-specific details (WebSocket, IPC, etc.) while providing
/// a consistent interface to the application.
///
/// # Lifecycle
///
/// 1. Create the connection with transport-specific configuration
/// 2. Set up handlers for value read/write operations
/// 3. Register any custom methods via `register_method`
/// 4. Call `run` to start accepting connections
/// 5. Use `respond_read_values` when async responses are needed
#[cfg(feature = "async")]
#[allow(async_fn_in_trait)]
pub trait AroraConnection: Send + Sync {
    /// Set the available keys that clients can interact with.
    ///
    /// This is typically called when a model is loaded and we know
    /// what input paths are available.
    fn set_keys(&self, keys: Vec<KeyInfo>) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Set the handler for WriteValues messages.
    ///
    /// Called when an external client wants to write values to keys.
    /// The handler receives a map of paths to values and should apply
    /// them to the runtime.
    fn set_write_values_handler(
        &self,
        handler: WriteValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Set the handler for ReadValues messages.
    ///
    /// Called when an external client wants to read the current values of keys.
    /// The handler receives a list of paths and should return their
    /// current values from the runtime.
    fn set_read_values_handler(
        &self,
        handler: ReadValuesHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Register a method that can be invoked by external clients.
    ///
    /// Methods are identified by path and can accept parameters.
    /// This is used for operations like "reset" that don't fit the
    /// key/value model.
    fn register_method(
        &self,
        info: MethodInfo,
        handler: MethodHandler,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;

    /// Respond to a pending ReadValues request.
    ///
    /// Some implementations may need async value retrieval (e.g., from
    /// a frontend). This method provides the response to a pending
    /// request that was initiated by the ReadValues handler.
    fn respond_read_values(&self, values: HashMap<String, Value>);

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
