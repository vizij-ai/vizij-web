//! Integration tests for the arora-zenoh package.
//!
//! These tests create actual Zenoh sessions and verify end-to-end
//! communication: publishing to key expressions (slots) and querying
//! queryables (methods). Each test uses a unique namespace for isolation.
//!
//! **Important:** All tests use `#[tokio::test(flavor = "multi_thread")]`
//! because Zenoh requires the multi-thread tokio scheduler internally.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Duration;

use arora_zenoh::{
    AroraConnection, AroraZenohSession, CancellationToken, InvokeResult, MethodInfo, SlotInfo,
    Value,
};
use tokio::sync::mpsc;

/// Helper: construct a typical set of vizij-like face-morph input slots.
fn vizij_face_slots() -> Vec<SlotInfo> {
    let paths = [
        "face/mouth/open",
        "face/mouth/smile",
        "face/brow/left/raise",
        "face/brow/right/raise",
        "face/eye/left/blink",
        "face/eye/right/blink",
    ];
    paths
        .iter()
        .map(|p| SlotInfo {
            path: p.to_string(),
            kind: Some("input".to_string()),
            value_type: Some(arora_connection::Type::F64),
            min: Some(0.0),
            max: Some(1.0),
            default_value: Some(Value::F64(0.0)),
            description: None,
        })
        .collect()
}

/// Helper: start a session in the background and return the cancel token.
/// Waits until `is_running()` returns true.
async fn start_session(session: &Arc<AroraZenohSession>) -> CancellationToken {
    let cancel = CancellationToken::new();
    let session_clone = session.clone();
    let cancel_clone = cancel.clone();
    tokio::spawn(async move {
        if let Err(e) = session_clone.run(cancel_clone).await {
            eprintln!("Session error: {e}");
        }
    });

    // Wait for session to be running.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        if session.is_running().await {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            panic!("Timed out waiting for session to start");
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    cancel
}

/// Helper: generate a unique namespace for test isolation.
/// Uses PID + atomic counter to ensure uniqueness across parallel tests.
fn unique_namespace(prefix: &str) -> String {
    static COUNTER: AtomicU32 = AtomicU32::new(0);
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}_{}_{n}", std::process::id())
}

/// Helper: repeatedly put a JSON Value to a key expression until the receiver
/// gets a message. Returns a handle that can be aborted to stop publishing.
fn spawn_publisher(
    pub_session: zenoh::Session,
    key_expr: String,
    value: Value,
) -> tokio::task::JoinHandle<()> {
    let payload = serde_json::to_vec(&value).unwrap();
    tokio::spawn(async move {
        loop {
            let _ = pub_session.put(&key_expr, payload.clone()).await;
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
}

// =========================================================================
// Topic subscription tests
// =========================================================================

/// Put a JSON-serialized F64 value to a slot key expression and verify the
/// SetSlotValuesHandler receives the correct Value::F64.
#[tokio::test(flavor = "multi_thread")]
async fn test_slot_subscription_f64() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_f64");

    let (tx, mut rx) = mpsc::channel::<HashMap<String, Value>>(16);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .set_set_slot_values_handler(Arc::new(move |values| {
            let _ = tx.try_send(values);
            Ok(())
        }))
        .await;

    session
        .set_slots(vec![SlotInfo {
            path: "face/mouth/open".to_string(),
            kind: Some("input".to_string()),
            value_type: Some(arora_connection::Type::F64),
            min: Some(0.0),
            max: Some(1.0),
            default_value: None,
            description: None,
        }])
        .await;

    let cancel = start_session(&session).await;

    // Brief delay so the subscriber is declared before we start publishing.
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Create a separate Zenoh session as the publisher.
    let pub_session = zenoh::open(zenoh::Config::default()).await.unwrap();
    let key_expr = format!("{namespace}/slots/face/mouth/open");
    let pub_handle = spawn_publisher(pub_session, key_expr, Value::F64(0.75));

    let values = tokio::time::timeout(Duration::from_secs(10), rx.recv())
        .await
        .expect("timed out waiting for slot value")
        .expect("channel closed");

    assert_eq!(
        values.get("face/mouth/open"),
        Some(&Value::F64(0.75)),
        "Expected F64(0.75), got: {values:?}"
    );

    pub_handle.abort();
    cancel.cancel();
}

/// Put a JSON-serialized Bool value and verify Value::Boolean is received.
#[tokio::test(flavor = "multi_thread")]
async fn test_slot_subscription_bool() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_bool");

    let (tx, mut rx) = mpsc::channel::<HashMap<String, Value>>(16);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .set_set_slot_values_handler(Arc::new(move |values| {
            let _ = tx.try_send(values);
            Ok(())
        }))
        .await;

    session
        .set_slots(vec![SlotInfo {
            path: "enabled".to_string(),
            kind: Some("input".to_string()),
            value_type: Some(arora_connection::Type::Boolean),
            min: None,
            max: None,
            default_value: None,
            description: None,
        }])
        .await;

    let cancel = start_session(&session).await;
    tokio::time::sleep(Duration::from_millis(500)).await;

    let pub_session = zenoh::open(zenoh::Config::default()).await.unwrap();
    let key_expr = format!("{namespace}/slots/enabled");
    let pub_handle = spawn_publisher(pub_session, key_expr, Value::Boolean(true));

    let values = tokio::time::timeout(Duration::from_secs(10), rx.recv())
        .await
        .expect("timed out")
        .expect("channel closed");

    assert_eq!(values.get("enabled"), Some(&Value::Boolean(true)));

    pub_handle.abort();
    cancel.cancel();
}

/// Put a JSON-serialized String value and verify Value::String is received.
#[tokio::test(flavor = "multi_thread")]
async fn test_slot_subscription_string() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_string");

    let (tx, mut rx) = mpsc::channel::<HashMap<String, Value>>(16);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .set_set_slot_values_handler(Arc::new(move |values| {
            let _ = tx.try_send(values);
            Ok(())
        }))
        .await;

    session
        .set_slots(vec![SlotInfo {
            path: "status".to_string(),
            kind: Some("input".to_string()),
            value_type: Some(arora_connection::Type::String),
            min: None,
            max: None,
            default_value: None,
            description: None,
        }])
        .await;

    let cancel = start_session(&session).await;
    tokio::time::sleep(Duration::from_millis(500)).await;

    let pub_session = zenoh::open(zenoh::Config::default()).await.unwrap();
    let key_expr = format!("{namespace}/slots/status");
    let pub_handle = spawn_publisher(
        pub_session,
        key_expr,
        Value::String("hello zenoh".to_string()),
    );

    let values = tokio::time::timeout(Duration::from_secs(10), rx.recv())
        .await
        .expect("timed out")
        .expect("channel closed");

    assert_eq!(
        values.get("status"),
        Some(&Value::String("hello zenoh".to_string()))
    );

    pub_handle.abort();
    cancel.cancel();
}

/// Register multiple face-morph slots, publish to two of them, and
/// verify both updates arrive at the handler.
#[tokio::test(flavor = "multi_thread")]
async fn test_multiple_face_morph_slots() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_multi");

    let (tx, mut rx) = mpsc::channel::<HashMap<String, Value>>(64);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .set_set_slot_values_handler(Arc::new(move |values| {
            let _ = tx.try_send(values);
            Ok(())
        }))
        .await;

    session.set_slots(vizij_face_slots()).await;
    let cancel = start_session(&session).await;
    tokio::time::sleep(Duration::from_millis(500)).await;

    let pub_session = zenoh::open(zenoh::Config::default()).await.unwrap();

    // Publish to mouth/open and eye/left/blink.
    let mouth_key = format!("{namespace}/slots/face/mouth/open");
    let blink_key = format!("{namespace}/slots/face/eye/left/blink");
    let mouth_payload = serde_json::to_vec(&Value::F64(0.5)).unwrap();
    let blink_payload = serde_json::to_vec(&Value::F64(1.0)).unwrap();

    let ps1 = pub_session.clone();
    let mk = mouth_key.clone();
    let mp = mouth_payload.clone();
    let h1 = tokio::spawn(async move {
        loop {
            let _ = ps1.put(&mk, mp.clone()).await;
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });

    let ps2 = pub_session.clone();
    let bk = blink_key.clone();
    let bp = blink_payload.clone();
    let h2 = tokio::spawn(async move {
        loop {
            let _ = ps2.put(&bk, bp.clone()).await;
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });

    // Collect values until we have both slots.
    let mut received_mouth = false;
    let mut received_blink = false;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(10);

    while !(received_mouth && received_blink) {
        let remaining = deadline - tokio::time::Instant::now();
        let values = tokio::time::timeout(remaining, rx.recv())
            .await
            .expect("timed out waiting for both slots")
            .expect("channel closed");

        if values.contains_key("face/mouth/open") {
            assert_eq!(values.get("face/mouth/open"), Some(&Value::F64(0.5)));
            received_mouth = true;
        }
        if values.contains_key("face/eye/left/blink") {
            assert_eq!(values.get("face/eye/left/blink"), Some(&Value::F64(1.0)));
            received_blink = true;
        }
    }

    h1.abort();
    h2.abort();
    cancel.cancel();
}

/// Verify that output-kind slots do not get subscribers — only input slots.
#[tokio::test(flavor = "multi_thread")]
async fn test_output_slots_ignored() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_output_ignored");

    let (tx, mut rx) = mpsc::channel::<HashMap<String, Value>>(16);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .set_set_slot_values_handler(Arc::new(move |values| {
            let _ = tx.try_send(values);
            Ok(())
        }))
        .await;

    // One input slot, one output slot.
    session
        .set_slots(vec![
            SlotInfo {
                path: "input_val".to_string(),
                kind: Some("input".to_string()),
                value_type: Some(arora_connection::Type::F64),
                min: None,
                max: None,
                default_value: None,
                description: None,
            },
            SlotInfo {
                path: "output_val".to_string(),
                kind: Some("output".to_string()),
                value_type: Some(arora_connection::Type::F64),
                min: None,
                max: None,
                default_value: None,
                description: None,
            },
        ])
        .await;

    let cancel = start_session(&session).await;
    tokio::time::sleep(Duration::from_millis(500)).await;

    let pub_session = zenoh::open(zenoh::Config::default()).await.unwrap();

    // Publish to the output slot — should NOT be received.
    let output_key = format!("{namespace}/slots/output_val");
    let output_payload = serde_json::to_vec(&Value::F64(99.0)).unwrap();
    pub_session.put(&output_key, output_payload).await.unwrap();

    // Publish to the input slot — should be received.
    let input_key = format!("{namespace}/slots/input_val");
    let pub_handle = spawn_publisher(pub_session, input_key, Value::F64(42.0));

    let values = tokio::time::timeout(Duration::from_secs(10), rx.recv())
        .await
        .expect("timed out")
        .expect("channel closed");

    // The received value must be the input slot, not the output slot.
    assert_eq!(values.get("input_val"), Some(&Value::F64(42.0)));
    assert!(!values.contains_key("output_val"));

    pub_handle.abort();
    cancel.cancel();
}

// =========================================================================
// Method / queryable tests
// =========================================================================

/// Register a "reset" method and invoke it via Zenoh get().
/// Verify the handler fires and the reply indicates success.
#[tokio::test(flavor = "multi_thread")]
async fn test_method_invocation_reset() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_method_reset");

    let (tx, mut rx) = mpsc::channel::<String>(4);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .register_method(
            MethodInfo {
                path: "reset".to_string(),
                params: vec![],
                return_type: None,
                description: Some("Reset all values".to_string()),
            },
            Arc::new(move |_args| {
                let _ = tx.try_send("reset_called".to_string());
                InvokeResult::ok()
            }),
        )
        .await;

    let cancel = start_session(&session).await;
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Query the method from a separate session.
    let client = zenoh::open(zenoh::Config::default()).await.unwrap();
    let selector = format!("{namespace}/methods/reset");

    let replies = client
        .get(&selector)
        .timeout(Duration::from_secs(5))
        .await
        .unwrap();

    // Consume the reply.
    let reply = tokio::time::timeout(Duration::from_secs(5), replies.recv_async())
        .await
        .expect("timed out waiting for reply")
        .expect("channel closed");

    let sample = reply.result().expect("expected Ok reply, got error");
    let response: serde_json::Value =
        serde_json::from_slice(&sample.payload().to_bytes()).unwrap();
    assert_eq!(response["success"], true);

    // Verify the handler was called.
    let msg = tokio::time::timeout(Duration::from_secs(1), rx.recv())
        .await
        .expect("timed out")
        .expect("channel closed");
    assert_eq!(msg, "reset_called");

    cancel.cancel();
}

/// Register an "echo" method that returns its arguments and verify the
/// round-trip through query payload → handler → reply payload.
#[tokio::test(flavor = "multi_thread")]
async fn test_method_invocation_with_return_value() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_method_echo");

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .register_method(
            MethodInfo {
                path: "echo".to_string(),
                params: vec![],
                return_type: None,
                description: Some("Echo the input".to_string()),
            },
            Arc::new(|args| {
                let text = args
                    .get("text")
                    .cloned()
                    .unwrap_or(Value::String("no text".to_string()));
                InvokeResult::ok_with_value(text)
            }),
        )
        .await;

    let cancel = start_session(&session).await;
    tokio::time::sleep(Duration::from_millis(500)).await;

    let client = zenoh::open(zenoh::Config::default()).await.unwrap();
    let selector = format!("{namespace}/methods/echo");

    // Send a query with a JSON payload containing the method arguments.
    let args: HashMap<String, Value> =
        HashMap::from([("text".to_string(), Value::String("hello".to_string()))]);
    let payload = serde_json::to_vec(&args).unwrap();

    let replies = client
        .get(&selector)
        .payload(payload)
        .timeout(Duration::from_secs(5))
        .await
        .unwrap();

    let reply = tokio::time::timeout(Duration::from_secs(5), replies.recv_async())
        .await
        .expect("timed out")
        .expect("channel closed");

    let sample = reply.result().expect("expected Ok reply");
    let response: serde_json::Value =
        serde_json::from_slice(&sample.payload().to_bytes()).unwrap();
    assert_eq!(response["success"], true);
    assert_eq!(response["value"], serde_json::json!({"str": "hello"}));

    cancel.cancel();
}

// =========================================================================
// Lifecycle tests
// =========================================================================

/// Verify the session lifecycle: starts → is_running → cancel → stopped.
#[tokio::test(flavor = "multi_thread")]
async fn test_session_lifecycle() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_lifecycle");

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    assert!(!session.is_running().await);

    let cancel = start_session(&session).await;
    assert!(session.is_running().await);

    cancel.cancel();

    // Wait for the session to stop.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    loop {
        if !session.is_running().await {
            break;
        }
        if tokio::time::Instant::now() >= deadline {
            panic!("Timed out waiting for session to stop");
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    assert!(!session.is_running().await);
}

/// Register many slots (270+) and verify that publishing to one of
/// them still arrives at the handler.
#[tokio::test(flavor = "multi_thread")]
async fn test_many_slots_still_receive() {
    let _ = env_logger::try_init();
    let namespace = unique_namespace("test_many_slots");

    let (tx, mut rx) = mpsc::channel::<HashMap<String, Value>>(16);

    let session = Arc::new(AroraZenohSession::new(&namespace, None));
    session
        .set_set_slot_values_handler(Arc::new(move |values| {
            let _ = tx.try_send(values);
            Ok(())
        }))
        .await;

    // Generate 270 input slots.
    let mut slots: Vec<SlotInfo> = (0..270)
        .map(|i| SlotInfo {
            path: format!("slot_{i}"),
            kind: Some("input".to_string()),
            value_type: Some(arora_connection::Type::F64),
            min: Some(0.0),
            max: Some(1.0),
            default_value: None,
            description: None,
        })
        .collect();

    // Add a specific one we'll publish to.
    slots.push(SlotInfo {
        path: "target_slot".to_string(),
        kind: Some("input".to_string()),
        value_type: Some(arora_connection::Type::F64),
        min: Some(0.0),
        max: Some(1.0),
        default_value: None,
        description: None,
    });

    session.set_slots(slots).await;
    let cancel = start_session(&session).await;

    // Extra delay for 271 subscribers to be declared.
    tokio::time::sleep(Duration::from_secs(1)).await;

    let pub_session = zenoh::open(zenoh::Config::default()).await.unwrap();
    let key_expr = format!("{namespace}/slots/target_slot");
    let pub_handle = spawn_publisher(pub_session, key_expr, Value::F64(0.42));

    // Wait for the specific slot to arrive.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    loop {
        let remaining = deadline - tokio::time::Instant::now();
        let values = tokio::time::timeout(remaining, rx.recv())
            .await
            .expect("timed out waiting for target_slot")
            .expect("channel closed");

        if values.contains_key("target_slot") {
            assert_eq!(values.get("target_slot"), Some(&Value::F64(0.42)));
            break;
        }
    }

    pub_handle.abort();
    cancel.cancel();
}
