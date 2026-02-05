//! RPC method metadata types for WebSocket protocol.

use arora_schema::value::{Type, Value};
use serde::{Deserialize, Serialize};

/// Descriptor for an RPC method parameter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodParam {
    /// Parameter name
    pub name: String,

    /// Parameter type
    pub param_type: Type,

    /// Whether this parameter is required
    #[serde(default)]
    pub required: bool,

    /// Default value if not provided
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<Value>,

    /// Human-readable description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// Metadata describing an available RPC method.
///
/// Methods represent callable operations that can be invoked via the Invoke message.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MethodInfo {
    /// Method path/name (e.g., "audio/play", "animation/trigger", "reset")
    pub path: String,

    /// Method parameters
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub params: Vec<MethodParam>,

    /// Return type (None means void/unit)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub return_type: Option<Type>,

    /// Human-readable description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
