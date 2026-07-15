//! Subscribe to a vizij key topic over ROS 2 and print received values.
//!
//! Used to test cross-process DDS communication.
//!
//! # Usage
//!
//! ```bash
//! # In terminal 1 - start subscriber:
//! cargo run --example subscribe_slot -- /vizij/keys/blink
//!
//! # In terminal 2 - publish:
//! cargo run --example publish_slot -- /vizij/keys/blink 0.8
//! ```

use std::env;

use futures_util::StreamExt;
use ros2_client::ros2::{policy::Reliability, Duration as DdsDuration, QosPolicyBuilder};
use ros2_client::{
    Context, ContextOptions, MessageTypeName, Name, NodeName, NodeOptions, DEFAULT_SUBSCRIPTION_QOS,
};
use serde::{Deserialize, Serialize};

/// std_msgs/Float64
#[derive(Default, Debug, Clone, Serialize, Deserialize)]
struct Float64 {
    data: f64,
}
impl ros2_client::Message for Float64 {}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: subscribe_slot <topic> [--reliable]");
        eprintln!("  topic      - ROS 2 topic name, e.g. /vizij/keys/blink");
        eprintln!("  --reliable - use Reliable QoS instead of BestEffort");
        eprintln!();
        eprintln!("Example:");
        eprintln!("  cargo run --example subscribe_slot -- /vizij/keys/blink");
        std::process::exit(1);
    }

    let topic_name = &args[1];
    let reliable = args.iter().any(|a| a == "--reliable");

    let domain_id: u16 = env::var("ROS_DOMAIN_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    println!("Subscribing to topic: {topic_name}");
    println!("Domain ID: {domain_id}");
    println!("QoS: {}", if reliable { "Reliable" } else { "BestEffort" });
    println!();

    // Create ROS 2 context and node.
    let ctx = Context::with_options(ContextOptions::new().domain_id(domain_id))
        .expect("failed to create ROS2 context");
    let node_name = NodeName::new("/", "subscribe_slot").expect("invalid node name");
    let mut node = ctx
        .new_node(node_name, NodeOptions::new())
        .expect("failed to create ROS2 node");

    // Spin the node in a background task (same runtime, like the official tests).
    let spinner = node.spinner().expect("failed to create spinner");
    tokio::spawn(spinner.spin());

    // Create topic and subscription using the same pattern as the official test.
    let ros_name = Name::parse(topic_name).expect("invalid topic name");
    // `--reliable` keeps the subscription defaults and switches only the
    // reliability policy — the publisher defaults differ on more than that.
    let qos = if reliable {
        DEFAULT_SUBSCRIPTION_QOS.modify_by(
            &QosPolicyBuilder::new()
                .reliability(Reliability::Reliable {
                    max_blocking_time: DdsDuration::from_millis(100),
                })
                .build(),
        )
    } else {
        DEFAULT_SUBSCRIPTION_QOS.clone()
    };
    let topic = node
        .create_topic(&ros_name, MessageTypeName::new("std_msgs", "Float64"), &qos)
        .expect("failed to create topic");
    let subscription = node
        .create_subscription::<Float64>(&topic, None)
        .expect("failed to create subscription");

    println!("Waiting for messages (Ctrl+C to stop)...");

    // Print discovered topics periodically.
    let ctx_clone = ctx.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
            let topics: Vec<_> = ctx_clone
                .discovered_topics()
                .iter()
                .map(|t| t.topic_name().clone())
                .collect();
            println!("[discovery] {} topics visible", topics.len());
        }
    });

    // Use async_stream like the official tests do.
    let mut stream = Box::pin(subscription.async_stream());
    while let Some(result) = stream.next().await {
        match result {
            Ok((msg, _info)) => {
                println!("Received: {}", msg.data);
            }
            Err(e) => {
                eprintln!("Error: {e:?}");
            }
        }
    }
}
