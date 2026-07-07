//! WebSocket message types bridging the Arora API.
//!
//! Messages are serialized as JSON with a `type` field discriminator, and
//! speak the Arora data-layer vocabulary: values are written to and read from
//! **keys** (hierarchical paths into the store). This is the arora-websocket
//! 1.0 wire format.

use arora_connection::{KeyInfo, MethodInfo, Value};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Messages received from WebSocket clients.
///
/// All incoming messages use a `type` field to discriminate the message kind.
/// Example JSON: `{"type": "write_values", "values": {...}}`
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Incoming {
    /// Write values to keys.
    ///
    /// Example: `{"type": "write_values", "values": {"face/mouth": {"f64": 0.5}}}`
    WriteValues {
        /// Map of key paths to their new values
        values: HashMap<String, Value>,
    },

    /// Read the current values of keys.
    ///
    /// Example: `{"type": "read_values", "keys": ["face/mouth", "face/eyes"]}`
    ReadValues {
        /// List of key paths to retrieve
        keys: Vec<String>,
    },

    /// Request the list of available keys.
    ///
    /// Example: `{"type": "list_keys"}` or `{"type": "list_keys", "path": "face"}`
    ListKeys {
        /// Optional path prefix to filter keys
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
    /// Response to WriteValues message.
    ///
    /// Example: `{"type": "write_values_resp", "success": true}`
    WriteValuesResp {
        /// Whether the write was successful
        success: bool,

        /// Error message if success is false
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },

    /// Response to ReadValues message.
    ///
    /// Example: `{"type": "read_values_resp", "values": {"face/mouth": {"f64": 0.5}}}`
    ReadValuesResp {
        /// Map of key paths to their current values
        values: HashMap<String, Value>,
    },

    /// Response to ListKeys message.
    ///
    /// Example: `{"type": "list_keys_resp", "keys": [...]}`
    ListKeysResp {
        /// List of matching keys
        keys: Vec<KeyInfo>,
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

    /// Server-initiated push: values changed (e.g. the runtime wrote new
    /// state). Sent unsolicited to subscribed clients.
    ///
    /// Example: `{"type": "values_changed", "values": {"face/mouth": {"f64": 0.5}}}`
    ValuesChanged {
        /// Map of key paths to their new values.
        values: HashMap<String, Value>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_incoming_write_values_deserialize() {
        let json = r#"{"type": "write_values", "values": {"test/path": {"f64": 0.5}}}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::WriteValues { values } => {
                assert!(values.contains_key("test/path"));
            }
            _ => panic!("Expected WriteValues message"),
        }
    }

    #[test]
    fn test_incoming_read_values_deserialize() {
        let json = r#"{"type": "read_values", "keys": ["face/mouth", "face/eyes"]}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::ReadValues { keys } => {
                assert_eq!(keys, vec!["face/mouth", "face/eyes"]);
            }
            _ => panic!("Expected ReadValues message"),
        }
    }

    #[test]
    fn test_incoming_list_keys_deserialize() {
        let json = r#"{"type": "list_keys", "path": "face"}"#;
        let msg: Incoming = serde_json::from_str(json).unwrap();
        match msg {
            Incoming::ListKeys { path } => {
                assert_eq!(path, Some("face".to_string()));
            }
            _ => panic!("Expected ListKeys message"),
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
    fn test_outgoing_write_values_resp_serialize() {
        let msg = Outgoing::WriteValuesResp {
            success: true,
            message: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"write_values_resp""#));
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

    #[test]
    fn test_outgoing_values_changed_serialize() {
        let values: HashMap<String, Value> =
            serde_json::from_str(r#"{"face/mouth": {"f64": 0.5}}"#).unwrap();
        let msg = Outgoing::ValuesChanged { values };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""type":"values_changed""#));
        assert!(json.contains(r#""face/mouth""#));
    }
}
