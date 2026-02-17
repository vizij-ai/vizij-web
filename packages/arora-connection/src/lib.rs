//! Arora Connection - Abstract Protocol Interface
//!
//! This crate provides the core traits and types for implementing Arora protocol
//! connections. It defines an abstract `AroraConnection` trait that can be implemented
//! by different transport mechanisms (WebSocket, IPC, gRPC, etc.).
//!
//! # Features
//!
//! - **Slot Types**: [`SlotInfo`] for describing controllable parameters
//! - **Method Types**: [`MethodInfo`], [`MethodParam`], [`InvokeResult`] for RPC
//! - **Connection Trait**: [`AroraConnection`] for protocol implementations
//!
//! # Example
//!
//! ```rust,ignore
//! use arora_connection::{AroraConnection, SlotInfo, MethodInfo, InvokeResult};
//!
//! // Implement AroraConnection for your transport
//! struct MyConnection { /* ... */ }
//!
//! impl AroraConnection for MyConnection {
//!     // ... implement trait methods
//! }
//! ```

mod method;
mod slot;
mod traits;

// Re-export arora-schema types for convenience
pub use arora_schema::value::{Type, Value};

// Slot types
pub use slot::SlotInfo;

// Method types
pub use method::{InvokeResult, MethodInfo, MethodParam};

// Connection trait and handler types
#[cfg(feature = "async")]
pub use traits::{
    AroraConnection, GetSlotValuesHandler, MethodHandler, OnClientConnectedHandler,
    SetSlotValuesHandler, SetSlotValuesResult,
};

// Re-export cancellation token for convenience
#[cfg(feature = "async")]
pub use tokio_util::sync::CancellationToken;
