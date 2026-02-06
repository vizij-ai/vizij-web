//! Registry for nodes and methods.
//!
//! Provides thread-safe storage for available nodes and invocable methods.

#[cfg(feature = "server")]
use tokio::sync::RwLock;

#[cfg(not(feature = "server"))]
use std::sync::RwLock;

use std::collections::HashMap;
use std::sync::Arc;

use arora_schema::value::Value;

use crate::method::MethodInfo;
use crate::node::SlotInfo;

/// Result type for method invocation.
#[derive(Debug, Clone)]
pub struct InvokeResult {
    pub success: bool,
    pub value: Option<Value>,
    pub message: Option<String>,
}

impl InvokeResult {
    /// Create a successful result with no return value.
    pub fn ok() -> Self {
        Self {
            success: true,
            value: None,
            message: None,
        }
    }

    /// Create a successful result with a return value.
    pub fn ok_with_value(value: Value) -> Self {
        Self {
            success: true,
            value: Some(value),
            message: None,
        }
    }

    /// Create an error result.
    pub fn err(message: impl Into<String>) -> Self {
        Self {
            success: false,
            value: None,
            message: Some(message.into()),
        }
    }
}

/// Trait for method handlers.
///
/// Implement this trait to create custom method handlers.
pub trait MethodHandler: Send + Sync {
    /// Handle a method invocation.
    fn invoke(&self, args: HashMap<String, Value>) -> InvokeResult;
}

/// Function-based method handler.
impl<F> MethodHandler for F
where
    F: Fn(HashMap<String, Value>) -> InvokeResult + Send + Sync,
{
    fn invoke(&self, args: HashMap<String, Value>) -> InvokeResult {
        self(args)
    }
}

/// Registry for nodes and methods.
///
/// This is the core state container for the WebSocket server.
/// It stores available nodes and registered methods.
#[cfg(feature = "server")]
pub struct Registry {
    nodes: RwLock<Vec<SlotInfo>>,
    methods: RwLock<Vec<MethodInfo>>,
    handlers: RwLock<HashMap<String, Arc<dyn MethodHandler>>>,
}

#[cfg(feature = "server")]
impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "server")]
impl Registry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            nodes: RwLock::new(Vec::new()),
            methods: RwLock::new(Vec::new()),
            handlers: RwLock::new(HashMap::new()),
        }
    }

    /// Set the available nodes.
    pub async fn set_slots(&self, nodes: Vec<SlotInfo>) {
        *self.nodes.write().await = nodes;
    }

    /// Get all registered nodes.
    pub async fn get_nodes(&self) -> Vec<SlotInfo> {
        self.nodes.read().await.clone()
    }

    /// Get nodes filtered by path prefix.
    pub async fn get_nodes_filtered(&self, prefix: Option<&str>) -> Vec<SlotInfo> {
        let nodes = self.nodes.read().await;
        match prefix {
            Some(prefix) => {
                let prefix = prefix.trim_end_matches('/');
                nodes
                    .iter()
                    .filter(|n| {
                        n.path.starts_with(prefix) || n.path.starts_with(&format!("{}/", prefix))
                    })
                    .cloned()
                    .collect()
            }
            None => nodes.clone(),
        }
    }

    /// Get input nodes (nodes with kind == "input").
    pub async fn get_input_paths(&self) -> Vec<String> {
        self.nodes
            .read()
            .await
            .iter()
            .filter(|n| n.kind.as_deref() == Some("input"))
            .map(|n| n.path.clone())
            .collect()
    }

    /// Register a method with its handler.
    pub async fn register_method<H>(&self, info: MethodInfo, handler: H)
    where
        H: MethodHandler + 'static,
    {
        let path = info.path.clone();
        self.methods.write().await.push(info);
        self.handlers.write().await.insert(path, Arc::new(handler));
    }

    /// Register a method using a closure.
    pub async fn register_method_fn<F>(&self, info: MethodInfo, handler: F)
    where
        F: Fn(HashMap<String, Value>) -> InvokeResult + Send + Sync + 'static,
    {
        self.register_method(info, handler).await;
    }

    /// Get all registered methods.
    pub async fn get_methods(&self) -> Vec<MethodInfo> {
        self.methods.read().await.clone()
    }

    /// Get methods filtered by path prefix.
    pub async fn get_methods_filtered(&self, prefix: Option<&str>) -> Vec<MethodInfo> {
        let methods = self.methods.read().await;
        match prefix {
            Some(prefix) => {
                let prefix = prefix.trim_end_matches('/');
                methods
                    .iter()
                    .filter(|m| {
                        m.path.starts_with(prefix) || m.path.starts_with(&format!("{}/", prefix))
                    })
                    .cloned()
                    .collect()
            }
            None => methods.clone(),
        }
    }

    /// Invoke a method by path.
    pub async fn invoke_method(&self, path: &str, args: HashMap<String, Value>) -> InvokeResult {
        let handlers = self.handlers.read().await;
        match handlers.get(path) {
            Some(handler) => {
                let handler = handler.clone();
                drop(handlers); // Release lock before invoking
                handler.invoke(args)
            }
            None => InvokeResult::err(format!("Method not found: {}", path)),
        }
    }

    /// Check if a method exists.
    pub async fn has_method(&self, path: &str) -> bool {
        self.handlers.read().await.contains_key(path)
    }
}
