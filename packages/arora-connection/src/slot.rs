//! Slot metadata types for the Arora protocol.

use arora_types::value::{Type, Value};
use serde::{Deserialize, Serialize};

/// Metadata describing an available slot in the system.
///
/// Slots represent controllable parameters or observable outputs.
/// Each slot has a hierarchical path and optional type/constraint information.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlotInfo {
    /// Hierarchical path identifier (e.g., "face/mouth/open", "body/arm/left/rotation")
    pub path: String,

    /// Slot kind/category (e.g., "input", "output", "computed")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,

    /// The arora Type that this slot accepts/produces
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
