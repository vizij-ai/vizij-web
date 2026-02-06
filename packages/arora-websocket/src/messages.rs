//! WebSocket protocol message types.
//!
//! This module defines the standard message format for arora-based WebSocket communication.
//! Messages are serialized as JSON with a `type` field discriminator.

use arora_schema::value::Value;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::method::MethodInfo;
use crate::node::NodeInfo;

/// Messages received from WebSocket clients.
///
/// All incoming messages use a `type` field to discriminate the message kind.
/// Example JSON: `{"type": "set_slot_values", "values": {...}}`
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Incoming {
    /// Set values on slots.
    ///
    /// Example: `{"type": "set_slot_values", "values": {"face/mouth": {"f64": 0.5}}}`
    SetSlotValues {
        /// Map of slot paths to their new values
        values: HashMap<String, Value>,
    },

    /// Request the list of available nodes.
    ///
    /// Example: `{"type": "list_slots"}` or `{"type": "list_slots", "path": "face"}`
    ListSlots {
        /// Optional path prefix to filter nodes
        #[serde(default)]
        path: Option<String>,
    },

    /// Request the list of available RPC methods.
    ///
    /// Example: `{"type": "list_methods"}` or `{"type": "list_methods", "path": "audio"}`
    ListMethods {
        /// Optional path prefix to filter methods
        #[serde(default)]
        path: Option<String>,
    },

    /// Invoke an RPC method.
    ///
    /// Example: `{"type": "invoke", "method": "reset", "request_id": "req-1"}`
    Invoke {
        /// Method path/name to invoke
        method: String,

        /// Arguments as key-value pairs
        #[serde(default)]
        args: HashMap<String, Value>,

        /// Optional request ID for correlating responses
        #[serde(default)]
        request_id: Option<String>,
    },
}

/// Messages sent to WebSocket clients.
///
/// All outgoing messages use a `type` field to discriminate the message kind.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Outgoing {
    /// Response to SetSlotValues message.
    ///
    /// Example: `{"type": "set_slot_values_resp", "success": true}`
    SetSlotValuesResp {
        /// Whether the setter was successful
        success: bool,

        /// Error message if success is false
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },

    /// Response to ListSlots message.
    ///
    /// Example: `{"type": "list_slots_resp", "nodes": [...]}`
    ListSlotsResp {
        /// List of matching nodes
        nodes: Vec<NodeInfo>,
    },

    /// Response to ListMethods message.
    ///
    /// Example: `{"type": "list_methods_resp", "methods": [...]}`
    ListMethodsResp {
        /// List of matching methods
        methods: Vec<MethodInfo>,
    },

    /// Response to Invoke message.
    ///
    /// Example: `{"type": "invoke_resp", "success": true, "request_id": "req-1"}`
    InvokeResp {
        /// Whether the invocation was successful
        success: bool,

        /// Echo back request_id if provided in the request
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,

        /// Return value from the method (if any)
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<Value>,

        /// Error message if success is false
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },

    /// Generic error response for parse failures or unknown message types.
    ///
    /// Example: `{"type": "error", "message": "Invalid JSON"}`
    Error {
        /// Echo back request_id if available
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,

        /// Error description
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incoming_set_slot_values_deserialize() {
        let json = r#"{"type": "set_slot_values", "values": {"test/path": {"f64": 0.5}}}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::SetSlotValues { values } => {
                assert!(values.contains_key("test/path"));
            }
            _ => panic!("Expected SetSlotValues message"),
        }
    }

    #[test]
    fn test_incoming_get_slot_values_deserialize() {
        let json = r#"{"type": "get_slot_values", "slots": ["face/mouth", "face/eyes"]}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::GetSlotValues { slots } => {
                assert_eq!(slots, vec!["face/mouth", "face/eyes"]);
            }
            _ => panic!("Expected GetSlotValues message"),
        }
    }

    #[test]
    fn test_incoming_list_slots_deserialize() {
        let json = r#"{"type": "list_slots", "path": "face"}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::ListSlots { path } => {
                assert_eq!(path, Some("face".to_string()));
            }
            _ => panic!("Expected ListSlots message"),
        }
    }

    #[test]
    fn test_incoming_invoke_deserialize() {
        let json = r#"{"type": "invoke", "method": "reset", "request_id": "req-1"}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::Invoke {
                method,
                args,
                request_id,
            } => {
                assert_eq!(method, "reset");
                assert!(args.is_empty());
                assert_eq!(request_id, Some("req-1".to_string()));
            }
            _ => panic!("Expected Invoke message"),
        }
    }

    #[test]
    fn test_outgoing_set_slot_values_resp_serialize() {
        let msg = Outgoing::SetSlotValuesResp {
            success: true,
            message: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"set_slot_values_resp""#));
        assert!(json.contains(r#""success":true"#));
        assert!(!json.contains("message"));
    }

    #[test]
    fn test_outgoing_invoke_resp_serialize() {
        let msg = Outgoing::InvokeResp {
            success: false,
            request_id: Some("req-1".to_string()),
            value: None,
            message: Some("Method not found".to_string()),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"invoke_resp""#));
        assert!(json.contains(r#""request_id":"req-1""#));
        assert!(json.contains(r#""message":"Method not found""#));
    }
}
