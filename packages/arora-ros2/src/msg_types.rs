//! Native ROS2 message type wrappers compatible with std_msgs.
//!
//! These structs match the CDR serialization layout of standard ROS2
//! message types, allowing direct interoperability with ros2 CLI tools
//! and other ROS2 nodes.
//!
//! The [`MessageType`] trait and [`impl_message_type!`] macro provide
//! a compile-time association between Rust structs and their ROS2 type
//! names (e.g. `"std_msgs/Float64"`).

use serde::{Deserialize, Serialize};

/// A ROS2 message type with a compile-time type name.
pub trait MessageType:
    Clone + std::fmt::Debug + Send + Sync + Serialize + serde::de::DeserializeOwned + 'static
{
    /// The ROS2 message type name in `"package/Type"` format.
    const MESSAGE_TYPE_STR: &'static str;

    /// Build a [`ros2_client::MessageTypeName`] for DDS topic creation.
    fn message_type_name() -> ros2_client::MessageTypeName;
}

/// Implement [`MessageType`] for a struct defined in this module.
macro_rules! impl_message_type {
    ($package:expr, $struct_name:ident) => {
        impl MessageType for $struct_name {
            const MESSAGE_TYPE_STR: &'static str = concat!($package, "/", stringify!($struct_name));
            fn message_type_name() -> ros2_client::MessageTypeName {
                ros2_client::MessageTypeName::new($package, stringify!($struct_name))
            }
        }
    };
}

// ====== std_msgs =========================================================

/// `std_msgs/Float64`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct Float64 {
    pub data: f64,
}
impl_message_type!("std_msgs", Float64);

/// `std_msgs/Float32`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct Float32 {
    pub data: f32,
}
impl_message_type!("std_msgs", Float32);

/// `std_msgs/Int64`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct Int64 {
    pub data: i64,
}
impl_message_type!("std_msgs", Int64);

/// `std_msgs/Int32`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct Int32 {
    pub data: i32,
}
impl_message_type!("std_msgs", Int32);

/// `std_msgs/UInt64`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct UInt64 {
    pub data: u64,
}
impl_message_type!("std_msgs", UInt64);

/// `std_msgs/UInt32`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct UInt32 {
    pub data: u32,
}
impl_message_type!("std_msgs", UInt32);

/// `std_msgs/Bool`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct Bool {
    pub data: bool,
}
impl_message_type!("std_msgs", Bool);

/// `std_msgs/String`
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct String {
    pub data: std::string::String,
}
impl_message_type!("std_msgs", String);

// ====== service types ====================================================

/// Generic service request for method invocation.
/// The args field contains a JSON-encoded `HashMap<String, Value>`.
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct InvokeRequest {
    pub args: std::string::String,
}

/// Generic service response for method invocation.
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
pub struct InvokeResponse {
    pub success: bool,
    /// JSON-encoded `Option<Value>`, empty string if None.
    pub value: std::string::String,
    /// Error message, empty string if success.
    pub message: std::string::String,
}
