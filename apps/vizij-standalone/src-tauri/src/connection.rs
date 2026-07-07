//! Arora connection types.
//!
//! This module re-exports the core `AroraConnection` trait and related types
//! from `arora-connection` for use throughout the application.

// Re-export core types from arora-connection
pub use arora_connection::{
    AroraConnection, CancellationToken, InvokeResult, KeyInfo, MethodHandler, MethodInfo,
    MethodParam, OnClientConnectedHandler, ReadValuesHandler, Type, Value, WriteValuesHandler,
};
