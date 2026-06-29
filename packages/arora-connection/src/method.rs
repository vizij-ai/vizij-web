//! RPC method metadata types for the Arora protocol.

use arora_types::value::{Type, Value};
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

/// Result type for method invocation.
#[derive(Debug, Clone)]
pub struct InvokeResult {
    pub success: bool,
    pub value: Option<Value>,
    pub message: Option<String>,
}

impl InvokeResult {
    /// Create a successful result with no return value.
    pub fn ok() -> Self {
        Self {
            success: true,
            value: None,
            message: None,
        }
    }

    /// Create a successful result with a return value.
    pub fn ok_with_value(value: Value) -> Self {
        Self {
            success: true,
            value: Some(value),
            message: None,
        }
    }

    /// Create an error result.
    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            value: None,
            message: Some(message.into()),
        }
    }
}
