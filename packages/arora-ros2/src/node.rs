//! ROS2 node implementing the [`AroraConnection`] trait.
//!
//! [`AroraRos2Node`] creates a ROS2 node that exposes arora slots as
//! native ROS2 topics and arora methods as ROS2 services.

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;

use arora_connection::{
  AroraConnection, CancellationToken, GetSlotValuesHandler, InvokeResult,
  MethodHandler, MethodInfo, OnClientConnectedHandler, SetSlotValuesHandler,
  SlotInfo, Value,
};
use futures::StreamExt;
use log::{info, warn};
use ros2_client::{
  AService, Context, ContextOptions, Name, Node, NodeName, NodeOptions,
  ServiceMapping, ServiceTypeName, DEFAULT_SUBSCRIPTION_QOS,
};
use tokio::sync::{watch, RwLock};
use tokio::task::{AbortHandle, JoinHandle};

use crate::conversions::{drive_slot_streams, setup_slot_subscriber};
use crate::msg_types::{InvokeRequest, InvokeResponse};

/// ROS2 implementation of [`AroraConnection`].
///
/// Creates one ROS2 topic per slot and one ROS2 service per method.
/// ROS2's own discovery mechanisms replace ListSlots / ListMethods.
pub struct AroraRos2Node {
  namespace: String,
  domain_id: u16,
  set_slot_values_handler: RwLock<Option<SetSlotValuesHandler>>,
  get_slot_values_handler: RwLock<Option<GetSlotValuesHandler>>,
  on_client_connected_handler: RwLock<Option<OnClientConnectedHandler>>,
  methods: RwLock<Vec<(MethodInfo, MethodHandler)>>,
  slots_tx: watch::Sender<Vec<SlotInfo>>,
  slots_rx: watch::Receiver<Vec<SlotInfo>>,
  is_running: RwLock<bool>,
}

impl AroraRos2Node {
  /// Create a new ROS2 node configuration.
  ///
  /// The node is not started until [`AroraConnection::run`] is called.
  pub fn new(namespace: &str, domain_id: u16) -> Self {
    let (slots_tx, slots_rx) = watch::channel(Vec::new());
    Self {
      namespace: namespace.to_string(),
      domain_id,
      set_slot_values_handler: RwLock::new(None),
      get_slot_values_handler: RwLock::new(None),
      on_client_connected_handler: RwLock::new(None),
      methods: RwLock::new(Vec::new()),
      slots_tx,
      slots_rx,
      is_running: RwLock::new(false),
    }
  }
}

impl AroraConnection for AroraRos2Node {
  fn set_slots(
    &self,
    slots: Vec<SlotInfo>,
  ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
    Box::pin(async move {
      let _ = self.slots_tx.send(slots);
    })
  }

  fn set_set_slot_values_handler(
    &self,
    handler: SetSlotValuesHandler,
  ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
    Box::pin(async move {
      *self.set_slot_values_handler.write().await = Some(handler);
    })
  }

  fn set_get_slot_values_handler(
    &self,
    handler: GetSlotValuesHandler,
  ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
    Box::pin(async move {
      *self.get_slot_values_handler.write().await = Some(handler);
    })
  }

  fn register_method(
    &self,
    info: MethodInfo,
    handler: MethodHandler,
  ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
    Box::pin(async move {
      self.methods.write().await.push((info, handler));
    })
  }

  fn respond_slot_values(&self, _values: HashMap<String, Value>) {
    // No-op: ROS2 uses a push model; there are no pending
    // GetSlotValues requests to respond to.
  }

  fn run(
    &self,
    cancel_token: CancellationToken,
  ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + '_>> {
    Box::pin(async move {
      // ── 1. Create ROS2 context and node ──────────────────────────
      let ctx = Context::with_options(
        ContextOptions::new().domain_id(self.domain_id),
      )
      .map_err(|e| format!("failed to create ROS2 context: {e:?}"))?;

      let node_name =
        NodeName::new(&format!("/{}", self.namespace), "vizij_node")
          .map_err(|e| format!("invalid node name: {e:?}"))?;

      let mut node = ctx
        .new_node(node_name, NodeOptions::new().enable_rosout(true))
        .map_err(|e| format!("failed to create ROS2 node: {e:?}"))?;

      // ── 2. Spin the node in a background task ────────────────────
      let spinner = node
        .spinner()
        .map_err(|e| format!("failed to create spinner: {e:?}"))?;

      let spinner_abort = tokio::spawn(spinner.spin()).abort_handle();

      // ── 3. Collect abort handles for cleanup ─────────────────────
      let mut abort_handles: Vec<AbortHandle> = Vec::new();

      // ── 4. Create service servers for each method ────────────────
      let methods = self.methods.read().await;

      for (info, handler) in methods.iter() {
        let service_name = format!(
          "/{}/methods/{}",
          self.namespace, info.path
        );
        match spawn_method_service(
          &mut node,
          &service_name,
          handler.clone(),
        ) {
          Ok(abort) => {
            info!("ROS2 service: {}", service_name);
            abort_handles.push(abort);
          }
          Err(e) => {
            warn!(
              "Failed to create service for method '{}': {}",
              info.path, e
            );
          }
        }
      }

      drop(methods);

      // ── 5. Mark as running ───────────────────────────────────────
      *self.is_running.write().await = true;
      info!(
        "ROS2 node started (domain_id={}, namespace={})",
        self.domain_id, self.namespace
      );

      // ── 6. React to slot changes (hot-reload) ────────────────────
      // The slot subscription driver task is (re-)spawned whenever
      // set_slots() delivers a new list via the watch channel.
      // We keep the full JoinHandle so that before creating new DDS
      // subscriptions we can await the previous task's completion,
      // ensuring old Subscription objects (and their DDS DataReaders)
      // are fully dropped and deregistered from the node.
      let mut slots_rx = self.slots_rx.clone();
      let mut slot_driver_handle: Option<JoinHandle<()>> = None;

      loop {
        tokio::select! {
          _ = cancel_token.cancelled() => break,
          result = slots_rx.changed() => {
            if result.is_err() {
              // Sender dropped — node is being destroyed.
              break;
            }

            // Abort the previous slot driver and await its completion
            // so that the old DDS subscriptions are fully cleaned up
            // before new ones are created on the same node.
            if let Some(prev) = slot_driver_handle.take() {
              prev.abort();
              // Wait for the task to finish, handling cancellation so
              // we don't block shutdown.
              tokio::select! {
                biased;
                _ = cancel_token.cancelled() => break,
                _ = prev => {},
              }
            }

            let slots = slots_rx.borrow_and_update().clone();
            let handler = self.set_slot_values_handler.read().await;

            if let Some(ref handler) = *handler {
              let mut streams = Vec::new();

              for slot in slots.iter() {
                if slot.kind.as_deref() != Some("input") {
                  continue;
                }
                match setup_slot_subscriber(
                  &mut node,
                  slot,
                  &self.namespace,
                ) {
                  Ok(stream) => {
                    info!(
                      "ROS2 topic: /{}/slots/{}",
                      self.namespace, slot.path
                    );
                    streams.push(stream);
                  }
                  Err(e) => {
                    warn!(
                      "Failed to create subscriber for slot '{}': {}",
                      slot.path, e
                    );
                  }
                }
              }

              if !streams.is_empty() {
                let handler = handler.clone();
                slot_driver_handle = Some(tokio::spawn(drive_slot_streams(
                  streams, handler,
                )));
              }
            }
          }
        }
      }

      // ── 7. Clean up ──────────────────────────────────────────────
      info!("ROS2 node shutting down");
      *self.is_running.write().await = false;

      if let Some(handle) = slot_driver_handle {
        handle.abort();
        let _ = handle.await;
      }
      for handle in abort_handles {
        handle.abort();
      }
      spinner_abort.abort();

      Ok(())
    })
  }

  fn is_running(
    &self,
  ) -> Pin<Box<dyn Future<Output = bool> + Send + '_>> {
    Box::pin(async move { *self.is_running.read().await })
  }

  fn connection_id(&self) -> String {
    format!("ros2://{}", self.namespace)
  }

  fn set_on_client_connected_handler(
    &self,
    handler: OnClientConnectedHandler,
  ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
    Box::pin(async move {
      *self.on_client_connected_handler.write().await = Some(handler);
    })
  }

  fn disconnect_client(
    &self,
  ) -> Pin<Box<dyn Future<Output = ()> + Send + '_>> {
    // No-op: ROS2 pub/sub has no persistent client connections.
    Box::pin(async {})
  }
}

// =========================================================================
// Helpers
// =========================================================================

/// Create a service server for a single method and spawn a task to handle
/// incoming requests.
fn spawn_method_service(
  node: &mut Node,
  service_name: &str,
  handler: MethodHandler,
) -> Result<AbortHandle, String> {
  let name = Name::parse(service_name)
    .map_err(|e| format!("invalid service name '{service_name}': {e}"))?;

  let server = node
    .create_server::<AService<InvokeRequest, InvokeResponse>>(
      ServiceMapping::Enhanced,
      &name,
      &ServiceTypeName::new("arora_interfaces", "Invoke"),
      DEFAULT_SUBSCRIPTION_QOS.clone(),
      DEFAULT_SUBSCRIPTION_QOS.clone(),
    )
    .map_err(|e| {
      format!("failed to create service '{service_name}': {e:?}")
    })?;

  Ok(tokio::spawn(async move {
    let stream = server.receive_request_stream();
    futures::pin_mut!(stream);
    while let Some(result) = stream.next().await {
      match result {
        Ok((req_id, request)) => {
          // Parse args from JSON.
          let args: HashMap<String, Value> = if request.args.is_empty() {
            HashMap::new()
          } else {
            serde_json::from_str(&request.args).unwrap_or_else(|e| {
              warn!("Failed to parse service args JSON: {e}");
              HashMap::new()
            })
          };

          let result: InvokeResult = handler(args);

          let response = InvokeResponse {
            success: result.success,
            value: result
              .value
              .as_ref()
              .map(|v| serde_json::to_string(v).unwrap_or_default())
              .unwrap_or_default(),
            message: result.message.unwrap_or_default(),
          };

          if let Err(e) = server.async_send_response(req_id, response).await
          {
            warn!("Failed to send service response: {e:?}");
          }
        }
        Err(e) => {
          warn!("Service request error: {e:?}");
        }
      }
    }
  })
  .abort_handle())
}
