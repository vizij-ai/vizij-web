//! List all ROS 2 topics discovered via DDS.
//!
//! Uses DDS endpoint detection events (`WriterDetected` / `ReaderDetected`)
//! from the node's status receiver to enumerate topics as they appear.
//!
//! Exits when no new topic has been found for 1 second after the first
//! discovery, or after 10 seconds if nothing is discovered at all.
//!
//! # Usage
//!
//! ```bash
//! cargo run --example list_topics
//! # or with a specific domain:
//! ROS_DOMAIN_ID=42 cargo run --example list_topics
//! # show raw DDS topic names instead of ROS names:
//! cargo run --example list_topics -- --dds-names
//! # also show services, actions, and unknown topics:
//! cargo run --example list_topics -- --hidden
//! ```

use std::collections::BTreeMap;
use std::time::{Duration, Instant};
use std::{env, thread};

use ros2_client::rustdds::DomainParticipantStatusEvent;
use ros2_client::{Context, ContextOptions, NodeEvent, NodeName, NodeOptions};

/// Maximum time to wait when no topics are discovered at all.
const NO_TOPIC_TIMEOUT: Duration = Duration::from_secs(10);

/// After the first topic is discovered, wait this long without any new
/// discoveries before considering the list complete.
const SETTLE_TIMEOUT: Duration = Duration::from_secs(1);

/// Poll interval between event drain rounds.
const POLL_INTERVAL: Duration = Duration::from_millis(50);

/// A discovered topic entry (keyed by raw DDS topic name).
struct TopicEntry {
    type_name: String,
    kind: TopicKind,
    has_writers: bool,
    has_readers: bool,
}

// ---------------------------------------------------------------------------
// Topic classification helpers
// ---------------------------------------------------------------------------

/// Classification of a DDS topic based on its name pattern.
enum TopicKind {
    /// A regular pub/sub topic (`rt/…`), carrying the clean ROS topic name.
    Normal(String),
    /// A service request channel (`rq/…`).
    ServiceRequest(String),
    /// A service reply channel (`rr/…`).
    ServiceReply(String),
    /// An action-related topic (`rt/…/_action/…`).
    Action(String),
    /// Anything that doesn't match a known pattern.
    Unknown,
}

/// Classify a raw DDS topic name.
fn topic_kind(dds_name: &str) -> TopicKind {
    if let Some(rest) = dds_name.strip_prefix("rq/") {
        let service = rest
            .strip_suffix("Request")
            .and_then(|s| s.strip_suffix('/'))
            .unwrap_or(rest);
        TopicKind::ServiceRequest(format!("/{service}"))
    } else if let Some(rest) = dds_name.strip_prefix("rr/") {
        let service = rest
            .strip_suffix("Reply")
            .and_then(|s| s.strip_suffix('/'))
            .unwrap_or(rest);
        TopicKind::ServiceReply(format!("/{service}"))
    } else if let Some(rest) = dds_name.strip_prefix("rt/") {
        if let Some(idx) = rest.find("/_action/") {
            TopicKind::Action(format!("/{}", &rest[..idx]))
        } else {
            TopicKind::Normal(format!("/{rest}"))
        }
    } else {
        TopicKind::Unknown
    }
}

/// Convert a DDS type name (e.g. `std_msgs::msg::dds_::String_`) to a
/// ROS 2 type name (`std_msgs/String`).
fn dds_type_to_ros(dds_type: &str) -> String {
    let parts: Vec<&str> = dds_type.split("::").collect();
    if parts.len() >= 4 && parts[1] == "msg" && parts[2] == "dds_" {
        let pkg = parts[0];
        let raw = parts[3];
        let type_name = raw.strip_suffix('_').unwrap_or(raw);
        return format!("{pkg}/{type_name}");
    }
    dds_type.to_owned()
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fn main() {
    let args: Vec<String> = env::args().collect();
    let use_dds_names = args.iter().any(|a| a == "--dds-names");
    let show_hidden = args.iter().any(|a| a == "--hidden");

    let domain_id: u16 = env::var("ROS_DOMAIN_ID")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    println!("Discovering topics on DDS domain {domain_id} ...");

    let ctx = Context::with_options(ContextOptions::new().domain_id(domain_id))
        .expect("failed to create ROS context");
    let node_name = NodeName::new("/", "list_topics").expect("invalid node name");
    let mut node = ctx
        .new_node(node_name, NodeOptions::new())
        .expect("failed to create ROS node");

    let spinner = node.spinner().expect("failed to create spinner");
    let event_rx = node.status_receiver();

    // Spin the node in a background thread so DDS discovery runs.
    thread::Builder::new()
        .name("ros_spinner".into())
        .spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("tokio runtime")
                .block_on(spinner.spin())
                .ok();
        })
        .expect("failed to spawn spinner thread");

    let mut topics: BTreeMap<String, TopicEntry> = BTreeMap::new();
    let start = Instant::now();
    let mut last_new_topic = None::<Instant>;

    loop {
        // Drain all pending events.
        while let Ok(event) = event_rx.try_recv() {
            let NodeEvent::DDS(dds_event) = event else {
                continue;
            };
            match dds_event {
                DomainParticipantStatusEvent::WriterDetected { writer } => {
                    let entry = topics.entry(writer.topic_name.clone()).or_insert_with(|| {
                        last_new_topic = Some(Instant::now());
                        TopicEntry {
                            type_name: dds_type_to_ros(&writer.type_name),
                            kind: topic_kind(&writer.topic_name),
                            has_writers: false,
                            has_readers: false,
                        }
                    });
                    entry.has_writers = true;
                }
                DomainParticipantStatusEvent::ReaderDetected { reader } => {
                    let entry = topics.entry(reader.topic_name.clone()).or_insert_with(|| {
                        last_new_topic = Some(Instant::now());
                        TopicEntry {
                            type_name: dds_type_to_ros(&reader.type_name),
                            kind: topic_kind(&reader.topic_name),
                            has_writers: false,
                            has_readers: false,
                        }
                    });
                    entry.has_readers = true;
                }
                _ => {}
            }
        }

        // Check timeouts.
        if let Some(last) = last_new_topic {
            if last.elapsed() >= SETTLE_TIMEOUT {
                break;
            }
        } else if start.elapsed() >= NO_TOPIC_TIMEOUT {
            println!("No topics discovered after {NO_TOPIC_TIMEOUT:?}.");
            return;
        }

        thread::sleep(POLL_INTERVAL);
    }

    // Filter topics based on flags.
    let visible: Vec<_> = topics
        .iter()
        .filter(|(_, entry)| match entry.kind {
            TopicKind::Normal(_) => true,
            _ => show_hidden,
        })
        .collect();

    // Print results.
    println!("\nDiscovered {} topic(s):\n", visible.len());

    for (dds_name, entry) in &visible {
        let dir = match (entry.has_writers, entry.has_readers) {
            (true, true) => "pub/sub",
            (true, false) => "pub",
            (false, true) => "sub",
            (false, false) => "?",
        };
        let display_name = if use_dds_names {
            dds_name.to_string()
        } else {
            match &entry.kind {
                TopicKind::Normal(name) => name.clone(),
                TopicKind::ServiceRequest(name) => name.clone(),
                TopicKind::ServiceReply(name) => name.clone(),
                TopicKind::Action(name) => name.clone(),
                TopicKind::Unknown => dds_name.to_string(),
            }
        };
        let kind_label = match &entry.kind {
            TopicKind::Normal(_) => "topic ",
            TopicKind::ServiceRequest(_) => "svc-rq",
            TopicKind::ServiceReply(_) => "svc-rr",
            TopicKind::Action(_) => "action",
            TopicKind::Unknown => "???   ",
        };
        println!(
            "  [{dir:>7}] {kind_label} {display_name}  ({})",
            entry.type_name
        );
    }
}
