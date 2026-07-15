//! Publish a value to a vizij key topic over ROS 2.
//!
//! This example creates a ROS 2 node, discovers available key topics,
//! and publishes a Float64 message to a specified topic.
//!
//! # Usage
//!
//! ```bash
//! # Publish 0.8 to the blink key (default namespace "vizij"):
//! cargo run --example publish_slot -- /vizij/keys/blink 0.8
//!
//! # With a custom domain:
//! ROS_DOMAIN_ID=42 cargo run --example publish_slot -- /vizij/keys/blink 1.0
//!
//! # Publish repeatedly (every 100ms) for 5 seconds:
//! cargo run --example publish_slot -- /vizij/keys/blink 0.5 --repeat
//! ```

use std::env;
use std::time::Duration;

use ros2_client::{
    Context, ContextOptions, MessageTypeName, Name, NodeName, NodeOptions, DEFAULT_PUBLISHER_QOS,
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

    if args.len() < 3 {
        eprintln!("Usage: publish_slot <topic> <value> [--repeat]");
        eprintln!("  topic   - ROS 2 topic name, e.g. /vizij/keys/blink");
        eprintln!("  value   - f64 value to publish, e.g. 0.8");
        eprintln!("  --repeat - publish repeatedly for 5 seconds");
        eprintln!();
        eprintln!("Example:");
        eprintln!("  cargo run --example publish_slot -- /vizij/keys/blink 0.8");
        std::process::exit(1);
    }

    let topic_name = &args[1];
    let value: f64 = args[2].parse().expect("value must be a valid f64");
    let repeat = args.iter().any(|a| a == "--repeat");

    let domain_id: u16 = env::var("ROS_DOMAIN_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    println!("Publishing to topic: {topic_name}");
    println!("Value: {value}");
    println!("Domain ID: {domain_id}");
    println!("Repeat: {repeat}");
    println!();

    // Create ROS 2 context and node.
    let ctx = Context::with_options(ContextOptions::new().domain_id(domain_id))
        .expect("failed to create ROS2 context");
    let node_name = NodeName::new("/", "publish_slot").expect("invalid node name");
    let mut node = ctx
        .new_node(node_name, NodeOptions::new())
        .expect("failed to create ROS2 node");

    // Spin the node in a background task (same runtime).
    let spinner = node.spinner().expect("failed to create spinner");
    tokio::spawn(spinner.spin());

    // Create topic and publisher.
    let ros_name = Name::parse(topic_name).expect("invalid topic name");
    let topic = node
        .create_topic(
            &ros_name,
            MessageTypeName::new("std_msgs", "Float64"),
            &DEFAULT_PUBLISHER_QOS,
        )
        .expect("failed to create topic");
    let publisher = node
        .create_publisher::<Float64>(&topic, None)
        .expect("failed to create publisher");

    // Wait for DDS discovery.
    println!("Waiting for subscribers...");
    publisher.wait_for_subscription(&node).await;
    println!("Subscriber found!");

    let msg = Float64 { data: value };

    if repeat {
        println!("Publishing every 100ms for 5 seconds...");
        let start = std::time::Instant::now();
        let mut count = 0u64;
        while start.elapsed() < Duration::from_secs(5) {
            publisher
                .async_publish(msg.clone())
                .await
                .expect("publish failed");
            count += 1;
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        println!("Published {count} messages.");
    } else {
        // Publish a few times to ensure delivery.
        for i in 0..10 {
            publisher
                .async_publish(msg.clone())
                .await
                .expect("publish failed");
            if i == 0 {
                println!("Published value {value}");
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        println!("Done (sent 10 copies).");
    }
}
