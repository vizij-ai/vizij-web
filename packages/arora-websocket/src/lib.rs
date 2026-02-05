//! Arora WebSocket Protocol
//!
//! This crate provides a complete WebSocket server implementation for arora-based
//! real-time communication. It includes type-safe message definitions, a method
//! registry for RPC-style invocations, and a ready-to-use WebSocket server.
//!
//! # Features
//!
//! - **Message Types**: Type-safe [`Incoming`] and [`Outgoing`] message enums
//! - **Registry**: Store nodes and methods with [`Registry`]
//! - **Server**: Full WebSocket server with [`AroraWSServer`] (requires `server` feature)
//!
//! # Protocol Overview
//!
//! Messages are JSON-encoded with a `type` field discriminator:
//!
//! ```json
//! // Client -> Server
//! {"type": "update", "values": {"face/mouth": {"f64": 0.5}}}
//! {"type": "list_nodes", "path": "face"}
//! {"type": "list_methods"}
//! {"type": "invoke", "method": "reset", "request_id": "req-1"}
//!
//! // Server -> Client
//! {"type": "update_resp", "success": true}
//! {"type": "list_nodes_resp", "nodes": [...]}
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
//!     server.set_update_handler(|values| {
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
mod method;
mod node;
mod registry;

#[cfg(feature = "server")]
mod server;

// Re-export arora-schema types for convenience
pub use arora_schema::keyvalue::{KeyValue, KeyValueField};
pub use arora_schema::value::{Type, Value};

// Protocol message types
pub use messages::{Incoming, Outgoing};

// Metadata types
pub use method::{MethodInfo, MethodParam};
pub use node::NodeInfo;

// Registry types
pub use registry::{InvokeResult, MethodHandler, Registry};

// Server types (feature-gated)
#[cfg(feature = "server")]
pub use server::{AroraWSServer, ServerConfig, UpdateHandler};

// Re-export cancellation token for convenience
#[cfg(feature = "server")]
pub use tokio_util::sync::CancellationToken;
