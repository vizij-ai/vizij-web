//! List all ROS 2 nodes discovered via the `ros_discovery_info` DDS topic.
//!
//! ## How ROS 2 Node Discovery Works
//!
//! ROS 2 maps multiple *nodes* onto a single DDS *DomainParticipant*. To let
//! other participants know which nodes are running inside each participant,
//! every participant publishes a
//! [`ParticipantEntitiesInfo`](ros2_client::entities_info::ParticipantEntitiesInfo)
//! message on the built-in `ros_discovery_info` topic (type
//! `rmw_dds_common::msg::dds_::ParticipantEntitiesInfo_`). That message
//! carries the participant's GUID and a list of
//! [`NodeEntitiesInfo`](ros2_client::entities_info::NodeEntitiesInfo) entries,
//! each containing the node's namespace, base name, and the GUIDs of its
//! DDS readers and writers.
//!
//! This example creates a minimal ROS 2 node, spins it so the DDS discovery
//! protocol runs, listens for `ros_discovery_info` updates via
//! [`Node::status_receiver`], and prints every node it discovers.
//!
//! ## Timeout Behaviour
//!
//! It follows the same settle-timeout pattern as `list_topics`:
//! - Wait up to 10 s if nothing is discovered at all.
//! - Once the first node is seen, wait 1 s of silence before printing.
//!
//! # Usage
//!
//! ```bash
//! cargo run --example list_nodes
//! # or with a specific domain:
//! ROS_DOMAIN_ID=42 cargo run --example list_nodes
//! ```

use std::collections::BTreeMap;
use std::time::Duration;

use ros2_client::entities_info::NodeEntitiesInfo;
use ros2_client::{Context, ContextOptions, NodeName, NodeOptions};

/// Maximum time to wait when no nodes are discovered at all.
const NO_NODE_TIMEOUT: Duration = Duration::from_secs(10);

/// After the first node is discovered, wait this long without any new
/// discoveries before considering the list complete.
const SETTLE_TIMEOUT: Duration = Duration::from_secs(1);

#[tokio::main(flavor = "multi_thread", worker_threads = 1)]
async fn main() {
    let domain_id: u16 = std::env::var("ROS_DOMAIN_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    println!("Discovering nodes on DDS domain {domain_id} ...");

    let ctx = Context::with_options(ContextOptions::new().domain_id(domain_id))
        .expect("failed to create ROS context");
    let node_name = NodeName::new("/", "list_nodes").expect("invalid node name");
    let mut node = ctx
        .new_node(node_name, NodeOptions::new())
        .expect("failed to create ROS node");

    // The Spinner must be running for ros_discovery_info to be processed.
    let spinner = node.spinner().expect("failed to create spinner");
    tokio::spawn(spinner.spin());

    // status_receiver() yields NodeEvent variants for both DDS-level and
    // ROS-level discovery. We only care about NodeEvent::ROS, which carries
    // a ParticipantEntitiesInfo — the list of nodes inside one participant.
    let status_rx = node.status_receiver();

    // Keyed by fully-qualified node name to deduplicate across updates.
    // Value is (namespace, base_name, reader_count, writer_count).
    let mut nodes: BTreeMap<String, NodeEntry> = BTreeMap::new();

    let start = tokio::time::Instant::now();
    let mut last_new_node = None::<tokio::time::Instant>;

    loop {
        let poll_timeout = Duration::from_millis(50);
        match tokio::time::timeout(poll_timeout, status_rx.recv()).await {
            Ok(Ok(event)) => {
                if let ros2_client::NodeEvent::ROS(participant_info) = event {
                    for node_info in participant_info.nodes() {
                        let fqn = node_info.fully_qualified_name();
                        nodes.entry(fqn).or_insert_with(|| {
                            last_new_node = Some(tokio::time::Instant::now());
                            NodeEntry::from(node_info)
                        });
                    }
                }
            }
            Ok(Err(_)) => break, // channel closed
            Err(_) => {}         // timeout — check settle condition
        }

        // Check timeouts.
        if let Some(last) = last_new_node {
            if last.elapsed() >= SETTLE_TIMEOUT {
                break;
            }
        } else if start.elapsed() >= NO_NODE_TIMEOUT {
            println!("No nodes discovered after {NO_NODE_TIMEOUT:?}.");
            return;
        }
    }

    // Filter out our own discovery node.
    let visible: Vec<_> = nodes
        .iter()
        .filter(|(fqn, _)| fqn.as_str() != "/list_nodes")
        .collect();

    println!("\nDiscovered {} node(s):\n", visible.len());

    for (fqn, entry) in &visible {
        println!(
            "  {fqn}  ({} reader(s), {} writer(s))",
            entry.readers, entry.writers
        );
    }
}

struct NodeEntry {
    readers: usize,
    writers: usize,
}

impl From<&NodeEntitiesInfo> for NodeEntry {
    fn from(info: &NodeEntitiesInfo) -> Self {
        // The reader/writer GID fields on NodeEntitiesInfo are private, but
        // the struct derives Serialize (via `#[serde(into = "repr::…")]`).
        // A quick JSON roundtrip lets us count them without forking the crate.
        let (readers, writers) = serde_json::to_value(info)
            .ok()
            .map(|v| {
                let r = v["reader_gid_seq"].as_array().map_or(0, |a| a.len());
                let w = v["writer_gid_seq"].as_array().map_or(0, |a| a.len());
                (r, w)
            })
            .unwrap_or((0, 0));
        NodeEntry { readers, writers }
    }
}
