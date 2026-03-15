//! Zenoh implementation of the Arora connection protocol.
//!
//! This crate provides [`AroraZenohSession`], a Zenoh-based implementation of
//! the [`AroraConnection`] trait from `arora-connection`. It creates one Zenoh
//! subscriber per input slot and one Zenoh queryable per method.
//!
//! # Why Zenoh?
//!
//! [Zenoh](https://zenoh.io) is a pub/sub and distributed-query protocol that
//! operates over TCP, UDP, shared memory, or serial links. Compared to the
//! ROS 2 / DDS transport provided by `arora-ros2`, Zenoh offers:
//!
//! - **Zero infrastructure** — no ROS 2 installation, no DDS vendor library,
//!   no `ros2 daemon`. A single `zenoh` Rust crate is all that is needed.
//! - **Built-in routing** — a Zenoh router can bridge networks, clouds, and
//!   edge devices without multicast.
//! - **Query/reply** — Zenoh *queryables* provide request/reply semantics
//!   natively, used here for method invocation (analogous to ROS 2 services).
//! - **Peer discovery** — Zenoh peers find each other via UDP multicast (like
//!   DDS SPDP) or through a configured router — no rosmaster required.
//!
//! # Serialization
//!
//! All slot-value and method payloads use **JSON-serialized
//! [`arora_schema::Value`]**. Unlike the ROS 2 implementation, which must map
//! each slot type to a native `std_msgs` wrapper for ecosystem interop, Zenoh
//! imposes no wire-format constraints. JSON provides:
//!
//! - Uniform handling of every `Value` variant (scalars, arrays, structs, …)
//! - Human-readable payloads — debuggable with `z_sub` or `zenoh-cli`
//! - No per-type message-wrapper boilerplate
//!
//! # Key Expression Layout
//!
//! | Resource | Key expression |
//! |----------|---------------|
//! | Slot value | `{namespace}/slots/{slot_path}` |
//! | Method | `{namespace}/methods/{method_path}` |
//!
//! For example, with namespace `"vizij"`:
//! - Subscribing to face morphs: `vizij/slots/face/**`
//! - Querying the reset method: `zenoh.get("vizij/methods/reset")`
//!
//! # Usage
//!
//! ```rust,no_run
//! use arora_zenoh::AroraZenohSession;
//! use arora_connection::{AroraConnection, CancellationToken};
//!
//! # async fn example() {
//! let session = AroraZenohSession::new("vizij", None);
//!
//! // Register handlers (same pattern as arora-websocket / arora-ros2)
//! session.set_set_slot_values_handler(std::sync::Arc::new(|values| {
//!     println!("Received {} updates", values.len());
//!     Ok(())
//! })).await;
//!
//! // Run the session
//! let cancel = CancellationToken::new();
//! session.run(cancel).await.unwrap();
//! # }
//! ```

pub mod session;

pub use session::AroraZenohSession;

pub use arora_connection::{
    AroraConnection, CancellationToken, InvokeResult, MethodInfo, SlotInfo, Value,
};
