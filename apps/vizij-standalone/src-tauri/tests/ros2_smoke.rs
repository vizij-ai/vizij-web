//! Smoke test: starts vizij-standalone and calls the "reset" ROS2 service.
//!
//! Prerequisites:
//!   1. Build the frontend: `pnpm --filter vizij-standalone build`
//!   2. A display must be available (the Tauri app opens a window)
//!
//! Run with:
//!   cargo test --features ros2 -- --ignored

#![cfg(feature = "ros2")]

use std::process::{Child, Command, Stdio};
use std::time::Duration;

use arora_ros2::msg_types::{InvokeRequest, InvokeResponse};
use rand::Rng;
use ros2_client::{
    AService, Context, ContextOptions, Name, NodeName, NodeOptions, ServiceMapping,
    ServiceTypeName, DEFAULT_SUBSCRIPTION_QOS,
};

/// RAII guard that kills the child process on drop.
struct AppProcess(Child);

impl Drop for AppProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn random_domain_id() -> u16 {
    rand::rng().random_range(100..250)
}

fn start_app(domain_id: u16, namespace: &str, port: u16) -> AppProcess {
    let bin = env!("CARGO_BIN_EXE_vizij-standalone");
    let child = Command::new(bin)
        .args(["--port", &port.to_string()])
        .args(["--no-web-control"])
        .args(["--ros2-domain-id", &domain_id.to_string()])
        .args(["--ros2-namespace", namespace])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("failed to start vizij-standalone");
    AppProcess(child)
}

fn create_client_node(domain_id: u16, suffix: &str) -> (Context, ros2_client::Node) {
    let ctx = Context::with_options(ContextOptions::new().domain_id(domain_id))
        .expect("failed to create context");
    let name = NodeName::new("/", &format!("test_{suffix}")).expect("valid node name");
    let mut node = ctx
        .new_node(name, NodeOptions::new())
        .expect("failed to create node");
    tokio::spawn(node.spinner().unwrap().spin());
    (ctx, node)
}

/// Start vizij-standalone and call the "reset" service via ROS2.
#[ignore]
#[tokio::test]
async fn test_reset_service_via_app() {
    let domain_id = random_domain_id();
    let namespace = "smoke_test";
    let port: u16 = rand::rng().random_range(19000..20000);

    let _app = start_app(domain_id, namespace, port);

    let (_ctx, mut node) = create_client_node(domain_id, "smoke");

    let service_name =
        Name::parse(&format!("/{namespace}/methods/reset")).expect("valid service name");
    let client = node
        .create_client::<AService<InvokeRequest, InvokeResponse>>(
            ServiceMapping::Enhanced,
            &service_name,
            &ServiceTypeName::new("arora_interfaces", "Invoke"),
            DEFAULT_SUBSCRIPTION_QOS.clone(),
            DEFAULT_SUBSCRIPTION_QOS.clone(),
        )
        .expect("create service client");

    // The app needs time to start: Tauri init, webview load, frontend calls
    // start_ws_server, ROS2 node starts. Give it a generous timeout.
    let found = tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            client.wait_for_service(&node).await;
            break;
        }
    })
    .await;

    assert!(
        found.is_ok(),
        "reset service not discovered within 30s — is the frontend built?"
    );

    // DDS discovery stabilisation.
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Call reset with a retry loop (DDS response channel race).
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    let response = loop {
        if tokio::time::Instant::now() >= deadline {
            panic!("timed out waiting for reset response");
        }
        let req_id = client
            .async_send_request(InvokeRequest {
                args: "{}".to_string(),
            })
            .await
            .expect("send request");

        match tokio::time::timeout(Duration::from_secs(2), client.async_receive_response(req_id))
            .await
        {
            Ok(Ok(resp)) => break resp,
            _ => tokio::time::sleep(Duration::from_millis(200)).await,
        }
    };

    assert!(
        response.success,
        "reset should succeed: {}",
        response.message
    );
}
