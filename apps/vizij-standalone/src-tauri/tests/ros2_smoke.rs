//! Smoke test: starts vizij-standalone and calls the "reset" ROS2 service.
//!
//! Prerequisites:
//!   1. Build the frontend assets: `pnpm --filter vizij-standalone build`
//!   2. A display must be available (the Tauri app opens a window)
//!
//! Run with:
//!   cargo test --features ros2 -- --ignored

#![cfg(feature = "ros2")]

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::thread;
use std::time::Duration;

use arora_ros2::msg_types::{InvokeRequest, InvokeResponse};
use rand::Rng;
use ros2_client::{
    AService, Context, ContextOptions, Name, NodeName, NodeOptions, ServiceMapping,
    ServiceTypeName, DEFAULT_SUBSCRIPTION_QOS,
};

const FRONTEND_PORT: u16 = 1420;

/// RAII guard that kills the child process on drop.
struct AppProcess(Child);

impl Drop for AppProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

/// Serves the built `../dist` directory on Tauri's dev URL so the debug test
/// binary can load the frontend bundle.
struct FrontendServer {
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl FrontendServer {
    fn start() -> Self {
        let dist_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../dist")
            .canonicalize()
            .expect(
                "frontend dist directory should exist; run `pnpm --filter vizij-standalone build`",
            );

        let listener = match TcpListener::bind(("127.0.0.1", FRONTEND_PORT)) {
            Ok(listener) => listener,
            Err(error) if error.kind() == std::io::ErrorKind::AddrInUse => {
                wait_for_frontend();
                if existing_frontend_is_compatible() {
                    return Self {
                        stop: Arc::new(AtomicBool::new(false)),
                        thread: None,
                    };
                }

                panic!(
                    "frontend server port 127.0.0.1:{FRONTEND_PORT} is already in use by a non-vizij process"
                );
            }
            Err(error) => {
                panic!("failed to bind frontend server on 127.0.0.1:{FRONTEND_PORT}: {error}")
            }
        };
        listener
            .set_nonblocking(true)
            .expect("frontend listener should support nonblocking mode");

        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = stop.clone();

        let thread = thread::spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let _ = handle_request(stream, &dist_dir);
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(25));
                    }
                    Err(error) => panic!("frontend server accept failed: {error}"),
                }
            }
        });

        wait_for_frontend();

        Self {
            stop,
            thread: Some(thread),
        }
    }
}

impl Drop for FrontendServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        let _ = std::net::TcpStream::connect(("127.0.0.1", FRONTEND_PORT));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
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

fn wait_for_frontend() {
    for _ in 0..50 {
        if TcpStream::connect(("127.0.0.1", FRONTEND_PORT)).is_ok() {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    panic!("frontend server did not become ready on 127.0.0.1:{FRONTEND_PORT}");
}

fn existing_frontend_is_compatible() -> bool {
    let mut stream = match TcpStream::connect(("127.0.0.1", FRONTEND_PORT)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    if stream
        .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = String::new();
    if stream.read_to_string(&mut response).is_err() {
        return false;
    }

    response.contains("<title>Vizij Standalone</title>")
}

fn handle_request(mut stream: std::net::TcpStream, dist_dir: &Path) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let request_path = parts.next().unwrap_or("/");

    loop {
        let mut header = String::new();
        if reader.read_line(&mut header)? == 0 || header == "\r\n" {
            break;
        }
    }

    let mut relative = request_path.trim_start_matches('/');
    if relative.is_empty() {
        relative = "index.html";
    }

    let candidate = dist_dir.join(relative);
    let path = match candidate.canonicalize() {
        Ok(path) if path.starts_with(dist_dir) && path.is_file() => path,
        _ => dist_dir.join("index.html"),
    };

    let body = fs::read(&path)?;
    let content_type = content_type_for(&path);
    let head_only = method.eq_ignore_ascii_case("HEAD");

    write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: {}\r\nConnection: close\r\n\r\n",
        body.len(),
        content_type
    )?;
    if !head_only {
        stream.write_all(&body)?;
    }
    stream.flush()?;
    Ok(())
}

fn content_type_for(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        _ => "application/octet-stream",
    }
}

/// Start vizij-standalone and call the "reset" service via ROS2.
#[ignore]
#[tokio::test]
async fn test_reset_service_via_app() {
    let domain_id = random_domain_id();
    let namespace = "smoke_test";
    let port: u16 = rand::rng().random_range(19000..20000);

    let _frontend = FrontendServer::start();
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

    assert!(found.is_ok(), "reset service not discovered within 30s");

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

        match tokio::time::timeout(
            Duration::from_secs(2),
            client.async_receive_response(req_id),
        )
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
