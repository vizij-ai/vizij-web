//! Arora WebSocket Protocol
//!
//! This crate provides a WebSocket implementation of the Arora protocol connection.
//! It implements the [`AroraConnection`] trait from `arora-connection` and includes
//! type-safe message definitions, a method registry, and a ready-to-use server.
//!
//! # Features
//!
//! - **Message Types**: Type-safe [`Incoming`] and [`Outgoing`] message enums
//! - **Registry**: Store slots and methods with [`Registry`]
//! - **Server**: Full WebSocket server with [`AroraWSServer`] (requires `server` feature)
//! - **Connection Trait**: Implements [`AroraConnection`] for protocol-agnostic usage
//!
//! # Protocol Overview
//!
//! Messages are JSON-encoded with a `type` field discriminator:
//!
//! ```json
//! // Client -> Server
//! {"type": "set_slot_values", "values": {"face/mouth": {"f64": 0.5}}}
//! {"type": "list_slots", "path": "face"}
//! {"type": "list_methods"}
//! {"type": "invoke", "method": "reset", "request_id": "req-1"}
//!
//! // Server -> Client
//! {"type": "set_slot_values_resp", "success": true}
//! {"type": "list_slots_resp", "slots": [...]}
//! {"type": "list_methods_resp", "methods": [...]}
//! {"type": "invoke_resp", "success": true, "request_id": "req-1"}
//! ```
//!
//! # Server Example
//!
//! ```rust,no_run
//! use arora_websocket::{AroraWSServer, ServerConfig, MethodInfo, InvokeResult};
//! use tokio_util::sync::CancellationToken;
//!
//! #[tokio::main]
//! async fn main() {
//!     let server = AroraWSServer::with_port(9000);
//!
//!     // Register a method
//!     server.registry().register_method_fn(
//!         MethodInfo {
//!             path: "reset".to_string(),
//!             params: vec![],
//!             return_type: None,
//!             description: Some("Reset to defaults".to_string()),
//!         },
//!         |_args| InvokeResult::ok(),
//!     ).await;
//!
//!     // Set update handler
//!     server.set_set_slot_values_handler(|values| {
//!         println!("Received {} updates", values.len());
//!         Ok(())
//!     }).await;
//!
//!     // Run the server
//!     let cancel = CancellationToken::new();
//!     server.run(cancel).await.unwrap();
//! }
//! ```

mod messages;
mod registry;

#[cfg(feature = "server")]
mod server;

// Re-export all core types from arora-connection
pub use arora_connection::{InvokeResult, MethodInfo, MethodParam, SlotInfo, Type, Value};

// Re-export connection trait and handler types (feature-gated)
#[cfg(feature = "server")]
pub use arora_connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, MethodHandler,
    OnClientConnectedHandler, SetSlotValuesHandler as ConnectionSetSlotValuesHandler,
    SetSlotValuesResult,
};

// Re-export arora-schema types for backwards compatibility
pub use arora_schema::keyvalue::{KeyValue, KeyValueField};

// Protocol message types (WebSocket-specific)
pub use messages::{Incoming, Outgoing};

// Registry types
pub use registry::Registry;

// Server types (feature-gated)
#[cfg(feature = "server")]
pub use server::{process_message, AroraWSServer, ServerConfig, SetSlotValuesHandler};
