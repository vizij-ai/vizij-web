//! Arora Connection - Abstract Connection Interface
//!
//! This crate provides the core traits and types for implementing connections
//! to the Arora API. It defines an abstract `AroraConnection` trait that can be
//! implemented by different transport mechanisms (WebSocket, IPC, gRPC, etc.).
//!
//! # Features
//!
//! - **Key Types**: [`KeyInfo`] for describing controllable parameters
//! - **Method Types**: [`MethodInfo`], [`MethodParam`], [`InvokeResult`] for RPC
//! - **Connection Trait**: [`AroraConnection`] for transport implementations
//!
//! # Example
//!
//! ```rust,ignore
//! use arora_connection::{AroraConnection, KeyInfo, MethodInfo, InvokeResult};
//!
//! // Implement AroraConnection for your transport
//! struct MyConnection { /* ... */ }
//!
//! impl AroraConnection for MyConnection {
//!     // ... implement trait methods
//! }
//! ```

mod key;
mod method;
mod traits;

// Re-export arora-schema types for convenience
pub use arora_schema::value::{Type, Value};

// Key types
pub use key::KeyInfo;

// Method types
pub use method::{InvokeResult, MethodInfo, MethodParam};

// Connection trait and handler types
#[cfg(feature = "async")]
pub use traits::{
    AroraConnection, MethodHandler, OnClientConnectedHandler, ReadValuesHandler,
    WriteValuesHandler, WriteValuesResult,
};

// Re-export cancellation token for convenience
#[cfg(feature = "async")]
pub use tokio_util::sync::CancellationToken;
