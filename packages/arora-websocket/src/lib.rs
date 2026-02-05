//! Reusable arora-types WebSocket protocol utilities
//!
//! This crate provides common types and utilities for WebSocket communication
//! using arora-schema types, making it easy to build Rust programs that can
//! communicate with arora-based WebSocket servers.

pub use arora_schema::keyvalue::{KeyValue, KeyValueField};
pub use arora_schema::value::{Type, Value};

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Generic update payload using arora Value
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AroraUpdate {
    pub values: HashMap<String, Value>,
}

/// Generic acknowledgment response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AroraAck {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_arora_update_serialization() {
        let mut values = HashMap::new();
        values.insert("test/path".to_string(), Value::F64(0.5));

        let update = AroraUpdate { values };
        let json = serde_json::to_string(&update).unwrap();

        // Verify it contains the expected structure
        assert!(json.contains("test/path"));
        assert!(json.contains("f64"));
    }

    #[test]
    fn test_arora_ack_serialization() {
        let ack = AroraAck {
            success: true,
            message: None,
        };
        let json = serde_json::to_string(&ack).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(!json.contains("message")); // Should be skipped when None
    }
}
