//! Arora connection types.
//!
//! This module re-exports the core `AroraConnection` trait and related types
//! from `arora-connection` for use throughout the application.

// Re-export core types from arora-connection
pub use arora_connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, InvokeResult, MethodHandler,
    MethodInfo, MethodParam, OnClientConnectedHandler, SetSlotValuesHandler, SlotInfo, Type, Value,
};
