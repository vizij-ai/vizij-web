//! Conversions between arora Value types and native ROS2 message types.
//!
//! Provides helpers to create typed topic subscribers that convert incoming
//! native ROS2 messages into arora [`Value`]s before forwarding them to
//! the slot values handler.

use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;

use arora_connection::{SetSlotValuesHandler, SlotInfo, Type, Value};
use futures::stream::unfold;
use futures::{Stream, StreamExt};
use log::warn;
use ros2_client::{DEFAULT_SUBSCRIPTION_QOS, Name, Node};

use crate::msg_types::{self, MessageType};

/// A boxed stream of slot value updates produced by a single subscription.
pub type SlotValueStream = Pin<
  Box<
    dyn Stream<Item = Result<HashMap<std::string::String, Value>, std::string::String>>
      + Send,
  >,
>;

/// Create a typed subscription for a slot and return a stream of value
/// updates. The caller is responsible for driving the stream (e.g. via
/// `select_all` in a single task).
pub fn setup_slot_subscriber(
  node: &mut Node,
  slot: &SlotInfo,
  namespace: &str,
) -> Result<SlotValueStream, std::string::String> {
  let value_type = slot.value_type.clone().unwrap_or(Type::F64);
  let path = slot.path.clone();
  let topic_name = format!("/{namespace}/slots/{}", slot.path);

  match value_type {
    Type::F64 => setup_typed::<msg_types::Float64>(
      node, &topic_name, path,
      |msg| Value::F64(msg.data),
    ),
    Type::F32 => setup_typed::<msg_types::Float32>(
      node, &topic_name, path,
      |msg| Value::F32(msg.data),
    ),
    Type::I64 => setup_typed::<msg_types::Int64>(
      node, &topic_name, path,
      |msg| Value::I64(msg.data),
    ),
    Type::I32 => setup_typed::<msg_types::Int32>(
      node, &topic_name, path,
      |msg| Value::I32(msg.data),
    ),
    Type::U64 => setup_typed::<msg_types::UInt64>(
      node, &topic_name, path,
      |msg| Value::U64(msg.data),
    ),
    Type::U32 => setup_typed::<msg_types::UInt32>(
      node, &topic_name, path,
      |msg| Value::U32(msg.data),
    ),
    Type::Boolean => setup_typed::<msg_types::Bool>(
      node, &topic_name, path,
      |msg| Value::Boolean(msg.data),
    ),
    Type::String => setup_typed::<msg_types::String>(
      node, &topic_name, path,
      |msg| Value::String(msg.data),
    ),
    other => {
      // Fallback: subscribe as String, expect JSON-encoded Value.
      warn!(
        "Slot '{}' has unsupported type {:?}, falling back to JSON String topic",
        slot.path, other
      );
      setup_typed::<msg_types::String>(
        node, &topic_name, path,
        |msg| {
          serde_json::from_str::<Value>(&msg.data).unwrap_or_else(|e| {
            warn!("Failed to parse JSON Value from topic: {e}");
            Value::String(msg.data)
          })
        },
      )
    }
  }
}

/// Forward received slot values from a combined stream to the handler.
/// Intended to be called inside `tokio::spawn`.
pub async fn drive_slot_streams(
  mut streams: Vec<SlotValueStream>,
  handler: SetSlotValuesHandler,
) {
  let combined = futures::stream::select_all(streams.iter_mut());
  tokio::pin!(combined);

  while let Some(result) = combined.next().await {
    match result {
      Ok(values) => {
        if let Err(e) = handler(values) {
          warn!("set_slot_values_handler error: {}", e);
        }
      }
      Err(e) => {
        warn!("Subscription error: {}", e);
      }
    }
  }
}

/// Create a typed subscription and return a stream that converts messages
/// to `HashMap<String, Value>`.
fn setup_typed<M: MessageType>(
  node: &mut Node,
  topic_name: &str,
  path: std::string::String,
  convert: impl Fn(M) -> Value + Send + Sync + 'static,
) -> Result<SlotValueStream, std::string::String> {
  let ros_name = Name::parse(topic_name)
    .map_err(|e| format!("invalid topic name '{topic_name}': {e}"))?;

  let topic = node
    .create_topic(&ros_name, M::message_type_name(), &DEFAULT_SUBSCRIPTION_QOS)
    .map_err(|e| format!("failed to create topic {topic_name}: {e:?}"))?;

  let subscription = node
    .create_subscription::<M>(&topic, None)
    .map_err(|e| format!("failed to subscribe to {topic_name}: {e:?}"))?;

  let convert = Arc::new(convert);
  let stream = unfold(subscription, move |sub| {
    let path = path.clone();
    let convert = convert.clone();
    async move {
      match sub.async_take().await {
        Ok((msg, _info)) => {
          let value = convert(msg);
          let values = HashMap::from([(path, value)]);
          Some((Ok(values), sub))
        }
        Err(e) => {
          Some((Err(format!("{e:?}")), sub))
        }
      }
    }
  });

  Ok(stream.boxed())
}
