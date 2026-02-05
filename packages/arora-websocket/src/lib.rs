//! Arora WebSocket Protocol
//!
//! This crate defines the standard message protocol for arora-based WebSocket communication.
//! It provides type-safe message definitions for both client-to-server ([`Incoming`]) and
//! server-to-client ([`Outgoing`]) messages.
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
//! # Example Usage
//!
//! ```rust
//! use arora_websocket::{Incoming, Outgoing, NodeInfo};
//!
//! // Parse incoming message
//! let json = r#"{"type": "list_nodes"}"#;
//! let msg: Incoming = serde_json::from_str(json).unwrap();
//!
//! // Create response
//! let response = Outgoing::ListNodesResp {
//!     nodes: vec![NodeInfo {
//!         path: "face/mouth".to_string(),
//!         kind: Some("input".to_string()),
//!         value_type: None,
//!         min: Some(0.0),
//!         max: Some(1.0),
//!         default_value: None,
//!         description: None,
//!     }],
//! };
//! let response_json = serde_json::to_string(&response).unwrap();
//! ```

mod messages;
mod method;
mod node;

// Re-export arora-schema types for convenience
pub use arora_schema::keyvalue::{KeyValue, KeyValueField};
pub use arora_schema::value::{Type, Value};

// Protocol message types
pub use messages::{Incoming, Outgoing};

// Metadata types
pub use method::{MethodInfo, MethodParam};
pub use node::NodeInfo;
