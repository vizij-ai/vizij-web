//! Arora ROS2 Connection
//!
//! This crate provides a ROS2 implementation of the [`AroraConnection`] trait
//! from `arora-connection`. It creates one ROS2 topic per slot (using native
//! std_msgs types) and one ROS2 service per method.
//!
//! # Usage
//!
//! ```rust,no_run
//! use arora_ros2::AroraRos2Node;
//! use arora_connection::{AroraConnection, CancellationToken};
//!
//! # async fn example() {
//! let node = AroraRos2Node::new("vizij", 0);
//!
//! // Register handlers (same pattern as arora-websocket)
//! node.set_set_slot_values_handler(std::sync::Arc::new(|values| {
//!     println!("Received {} updates", values.len());
//!     Ok(())
//! })).await;
//!
//! // Run the node
//! let cancel = CancellationToken::new();
//! node.run(cancel).await.unwrap();
//! # }
//! ```

pub mod conversions;
pub mod msg_types;
pub mod node;

// Re-export the main type for convenience.
pub use node::AroraRos2Node;

// Re-export core arora types.
pub use arora_connection::{
    AroraConnection, CancellationToken, InvokeResult, MethodInfo, SlotInfo, Value,
};
