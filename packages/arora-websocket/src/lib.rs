//! Arora WebSocket
//!
//! This crate provides a WebSocket implementation of the Arora API connection,
//! speaking the arora-websocket 1.0 wire format. It implements the
//! [`AroraConnection`] trait from `arora-connection` and includes type-safe
//! message definitions, a method registry, and a ready-to-use server.
//!
//! # Features
//!
//! - **Message Types**: Type-safe [`Incoming`] and [`Outgoing`] message enums
//! - **Registry**: Store keys and methods with [`Registry`]
//! - **Server**: Full WebSocket server with [`AroraWSServer`] (requires `server` feature)
//! - **Connection Trait**: Implements [`AroraConnection`] for transport-agnostic usage
//!
//! # Wire Format Overview
//!
//! Messages are JSON-encoded with a `type` field discriminator:
//!
//! ```json
//! // Client -> Server
//! {"type": "write_values", "values": {"face/mouth": {"f64": 0.5}}}
//! {"type": "read_values", "keys": ["face/mouth"]}
//! {"type": "list_keys", "path": "face"}
//! {"type": "list_methods"}
//! {"type": "invoke", "method": "reset", "request_id": "req-1"}
//!
//! // Server -> Client
//! {"type": "write_values_resp", "success": true}
//! {"type": "read_values_resp", "values": {"face/mouth": {"f64": 0.5}}}
//! {"type": "list_keys_resp", "keys": [...]}
//! {"type": "list_methods_resp", "methods": [...]}
//! {"type": "invoke_resp", "success": true, "request_id": "req-1"}
//! {"type": "values_changed", "values": {"face/mouth": {"f64": 0.5}}}
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
//!     // Set write handler
//!     server.set_write_values_handler(|values| {
//!         println!("Received {} writes", values.len());
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
pub use arora_connection::{InvokeResult, KeyInfo, MethodInfo, MethodParam, Type, Value};

// Re-export connection trait and handler types (feature-gated)
#[cfg(feature = "server")]
pub use arora_connection::{
    AroraConnection, CancellationToken, MethodHandler, OnClientConnectedHandler,
    ReadValuesHandler, WriteValuesHandler as ConnectionWriteValuesHandler, WriteValuesResult,
};

// Re-export arora-schema types for convenience
pub use arora_schema::keyvalue::{KeyValue, KeyValueField};

// Wire-format message types (WebSocket-specific)
pub use messages::{Incoming, Outgoing};

// Registry types
pub use registry::Registry;

// Server types (feature-gated)
#[cfg(feature = "server")]
pub use server::{process_message, AroraWSServer, ServerConfig, WriteValuesHandler};
