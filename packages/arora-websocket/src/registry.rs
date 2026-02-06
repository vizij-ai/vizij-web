//! Registry for slots and methods.
//!
//! Provides thread-safe storage for available slots and invocable methods.

#[cfg(feature = "server")]
use tokio::sync::RwLock;

#[cfg(not(feature = "server"))]
use std::sync::RwLock;

use std::collections::HashMap;
use std::sync::Arc;

use arora_connection::{InvokeResult, MethodInfo, SlotInfo, Value};

/// Trait for method handlers in the registry.
///
/// Implement this trait to create custom method handlers.
pub trait RegistryMethodHandler: Send + Sync {
    /// Handle a method invocation.
    fn invoke(&self, args: HashMap<String, Value>) -> InvokeResult;
}

/// Function-based method handler.
impl<F> RegistryMethodHandler for F
where
    F: Fn(HashMap<String, Value>) -> InvokeResult + Send + Sync,
{
    fn invoke(&self, args: HashMap<String, Value>) -> InvokeResult {
        self(args)
    }
}

/// Registry for slots and methods.
///
/// This is the core state container for the WebSocket server.
/// It stores available slots and registered methods.
#[cfg(feature = "server")]
pub struct Registry {
    slots: RwLock<Vec<SlotInfo>>,
    methods: RwLock<Vec<MethodInfo>>,
    handlers: RwLock<HashMap<String, Arc<dyn RegistryMethodHandler>>>,
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
            slots: RwLock::new(Vec::new()),
            methods: RwLock::new(Vec::new()),
            handlers: RwLock::new(HashMap::new()),
        }
    }

    /// Set the available slots.
    pub async fn set_slots(&self, slots: Vec<SlotInfo>) {
        *self.slots.write().await = slots;
    }

    /// Get all registered slots.
    pub async fn get_slots(&self) -> Vec<SlotInfo> {
        self.slots.read().await.clone()
    }

    /// Get slots filtered by path prefix.
    pub async fn get_slots_filtered(&self, prefix: Option<&str>) -> Vec<SlotInfo> {
        let slots = self.slots.read().await;
        match prefix {
            Some(prefix) => {
                let prefix = prefix.trim_end_matches('/');
                slots
                    .iter()
                    .filter(|n| {
                        n.path.starts_with(prefix) || n.path.starts_with(&format!("{}/", prefix))
                    })
                    .cloned()
                    .collect()
            }
            None => slots.clone(),
        }
    }

    /// Get input slots (slots with kind == "input").
    pub async fn get_input_paths(&self) -> Vec<String> {
        self.slots
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
        H: RegistryMethodHandler + 'static,
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
