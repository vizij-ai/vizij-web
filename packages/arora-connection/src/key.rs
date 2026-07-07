//! Key metadata types for the Arora API.

use arora_schema::value::{Type, Value};
use serde::{Deserialize, Serialize};

/// Metadata describing a key exposed by the runtime's data layer.
///
/// A key is a hierarchical path into the store; its value is an arora `Value`.
/// Keys represent controllable parameters or observable outputs, with optional
/// type/constraint information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyInfo {
    /// Hierarchical path identifier (e.g., "face/mouth/open", "body/arm/left/rotation")
    pub path: String,

    /// Key kind/category (e.g., "input", "output", "computed")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,

    /// The arora Type of the values this key accepts/produces
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_type: Option<Type>,

    /// Minimum value constraint (for numeric types)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,

    /// Maximum value constraint (for numeric types)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,

    /// Default value
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub default_value: Option<Value>,

    /// Human-readable description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
