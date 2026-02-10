//! Arora connection types and Tauri-specific extensions.
//!
//! This module re-exports the core `AroraConnection` trait from `arora-connection`
//! and provides the Tauri-specific `AroraConnectionTauriExt` extension trait for
//! integrating connections with Tauri's event system.

use std::future::Future;
use std::pin::Pin;

use tauri::AppHandle;

// Re-export core types from arora-connection
pub use arora_connection::{
    AroraConnection, CancellationToken, GetSlotValuesHandler, InvokeResult, MethodHandler,
    MethodInfo, SetSlotValuesHandler, SlotInfo, Value,
};

/// Extension trait for setting up Tauri integration with an AroraConnection.
///
/// This provides a convenient way to wire up the connection to Tauri's
/// event system for frontend communication.
pub trait AroraConnectionTauriExt: AroraConnection {
    /// Set up Tauri event integration for the connection.
    ///
    /// This configures handlers to emit Tauri events when messages are received,
    /// allowing the frontend to react to external client commands.
    fn setup_tauri_integration(
        &self,
        app_handle: AppHandle,
    ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>>;
}
