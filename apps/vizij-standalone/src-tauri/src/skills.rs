//! The device's skill plane: a Vizij graph interpreter serving `look_at`.
//!
//! The standalone's host runs no `arora` engine, so this module carries the
//! two engine seams a bridge needs to serve a skill as a ROS 2 action:
//!
//! - **DescribeMethods** — the described `look_at` signature
//!   ([`vizij_arora_behavior::gaze`]), answered on the value plane as
//!   `Vec<MethodSignature>`, which `arora-bridge-ros2`'s ROS4HRI exposure
//!   profile binds to `/skill/look_at`.
//! - **The interpreter module** — SPAWN/HALT calls (the well-known
//!   [`arora_behavior::interpreter_module`] ABI) dispatched into a
//!   [`ProcessingGraph`] holding the shipped look_at fragment. A spawned run
//!   grafts the fragment; [`tick`](SkillHost::tick) advances it against the
//!   shared store, where its gaze intent lands on the `standard/ros4hri/*`
//!   keys — mirrored to the webview and served over every attached bridge.
//!
//! The behavior stays data (the `skills/look_at.json` asset), exactly as on
//! the native app; only the hosting differs.

use std::sync::{Arc, Mutex as StdMutex};
use std::time::Instant;

use arora_behavior::{interpreter_module, BehaviorContext, BehaviorInterpreter};
use arora_bridge::MethodSignature;
use arora_simple_data_store::SimpleDataStore;
use std::rc::Rc;

use arora_types::call::{Call, CallBridge, CallError, CallResult, Callable, CallableId};
use arora_types::data::{DataStore, StateChange};
use arora_types::value::Value;
use vizij_arora_behavior::{gaze, ProcessingGraph};
use vizij_arora_host::skills::LOOK_AT_FUNCTION;
use vizij_graph_core::types::GraphSpec;

/// The interpreter and its clock, shared between the tick loop and the pumps.
pub type SharedSkillHost = Arc<StdMutex<SkillHost>>;

/// The graph interpreter hosting the device's skills.
pub struct SkillHost {
    graph: ProcessingGraph,
    last_tick: Option<Instant>,
}

impl SkillHost {
    /// An interpreter over an empty graph with the shipped look_at fragment
    /// registered: runs exist only while goals are live.
    pub fn new() -> Self {
        let mut graph =
            ProcessingGraph::from_spec(GraphSpec::default()).expect("an empty graph spec encodes");
        graph.set_task_fragment(gaze::look_at_id(), gaze::look_at_fragment());
        Self {
            graph,
            last_tick: None,
        }
    }

    /// The described methods this device serves — what a bridge's
    /// `DescribeMethods` learns and the ROS4HRI profile binds against.
    pub fn signatures(&self, prefix: Option<&str>) -> Value {
        let all = [MethodSignature {
            module_id: gaze::module_id(),
            id: gaze::look_at_id(),
            name: LOOK_AT_FUNCTION.to_string(),
            function: gaze::look_at_signature(),
        }];
        let matching: Vec<&MethodSignature> = all
            .iter()
            .filter(|s| prefix.is_none_or(|p| s.name.starts_with(p)))
            .collect();
        arora_types::value_serde::to_value(&matching)
            .expect("method signatures encode on the value plane")
    }

    /// The served method names — the deprecated `ListMethods` answer.
    pub fn method_names(&self, prefix: Option<&str>) -> Vec<String> {
        [LOOK_AT_FUNCTION]
            .iter()
            .filter(|n| prefix.is_none_or(|p| n.starts_with(p)))
            .map(|n| n.to_string())
            .collect()
    }

    /// Dispatch a bridge's `Call`: the interpreter module's SPAWN/HALT (how a
    /// bridge starts and cancels a task run). Anything else is refused — the
    /// skill functions themselves are graph content, not callables.
    pub fn dispatch(&mut self, call: &Call) -> Result<CallResult, String> {
        if call.module_id != Some(interpreter_module::ID) {
            return Err(format!(
                "calls are served only for the interpreter module (got {:?})",
                call.module_id
            ));
        }
        if call.id == interpreter_module::SPAWN {
            let (inner, policy) = interpreter_module::decode_spawn(call)?;
            if inner.id != gaze::look_at_id() {
                return Err(format!("no task-run function {}", inner.id));
            }
            let handle = self.graph.spawn(inner, policy).map_err(|e| e.message)?;
            return Ok(CallResult {
                ret: interpreter_module::encode_spawn_result(&handle),
                mutated: Vec::new(),
            });
        }
        if call.id == interpreter_module::HALT {
            let task = interpreter_module::decode_halt(call)?;
            self.graph.halt(task).map_err(|e| e.message)?;
            return Ok(CallResult {
                ret: Value::Unit,
                mutated: Vec::new(),
            });
        }
        Err(format!("unsupported interpreter call {}", call.id))
    }

    /// Advance the interpreter one step against the store: publish the
    /// built-in `dt` (nanoseconds since the previous tick) the graph's
    /// time-driven nodes read, then tick. Errors are transient by the
    /// interpreter contract; they are logged and the next tick retries.
    pub fn tick(&mut self, store: &SimpleDataStore) {
        let now = Instant::now();
        let dt = self
            .last_tick
            .map(|last| now.duration_since(last).as_nanos() as u64)
            .unwrap_or(0);
        self.last_tick = Some(now);
        if let Err(e) = store.write(StateChange::set(
            arora_behavior::built_in::DT,
            Value::U64(dt),
        )) {
            log::warn!("skills: dt write failed: {e}");
        }
        let mut calls = NoModules;
        let mut ctx = BehaviorContext {
            store,
            call_bridge: &mut calls,
        };
        if let Err(e) = self.graph.tick(&mut ctx) {
            log::warn!("skills: tick failed: {}", e.message);
        }
    }
}

/// The tick context's call bridge: this host loads no modules, and the
/// shipped fragments are pure graph content, so a call is a misconfiguration.
struct NoModules;

impl CallBridge for NoModules {
    fn arora_call(&mut self, call: Call) -> Result<CallResult, CallError> {
        Err(CallError::Generic {
            message: format!("this host serves no module calls (function {})", call.id),
        })
    }

    fn arora_register_callable(&mut self, _callable: Rc<dyn Callable>) -> CallableId {
        CallableId { id: 0 }
    }

    fn arora_unregister_callable(&mut self, _callable_id: &CallableId) {}

    fn arora_call_indirect(&mut self, _callable_id: &CallableId) -> Result<Value, CallError> {
        Err(CallError::Generic {
            message: "this host serves no indirect calls".to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use arora_behavior::RunPolicy;
    use arora_types::data::Key;
    use arora_types::value::StructureField;
    use vizij_arora_behavior::task;
    use vizij_arora_host::ros4hri;

    /// A look_at goal spawned over the interpreter-module wire (the bridge's
    /// path) grafts the shipped fragment: ticks write the gaze target, the
    /// status runs, and the handle's stop call ends the run.
    #[test]
    fn the_skill_host_serves_a_look_at_run() {
        let store = SimpleDataStore::new();
        let mut host = SkillHost::new();

        // The routed spawn call the bound action would build: policy "" =
        // track, target in the face frame.
        let parameters = gaze::look_at_parameters();
        let arg = |name: &str, value: Value| StructureField {
            id: *parameters
                .iter()
                .find(|(_, n)| n == &name)
                .expect("a declared parameter")
                .0,
            value: Box::new(value),
        };
        let inner = Call {
            module_id: Some(gaze::module_id()),
            id: gaze::look_at_id(),
            args: vec![
                arg("policy", Value::String(String::new())),
                arg("target", Value::ArrayF32(vec![1.0, 0.3, 0.1])),
                arg("frame", Value::String("face".to_string())),
            ],
        };
        let spawn = interpreter_module::encode_spawn(&inner, RunPolicy::Concurrent);
        let result = host.dispatch(&spawn).expect("the spawn is served");
        let handle = interpreter_module::decode_spawn_result(&result.ret)
            .expect("the reply is the run's handle");

        for _ in 0..5 {
            host.tick(&store);
            std::thread::sleep(std::time::Duration::from_millis(5));
        }

        // The fragment steers the gaze surface and reports Running.
        let gaze_target = store
            .read(&[Key::from(ros4hri::GAZE_TARGET_KEY)])
            .into_iter()
            .next()
            .flatten()
            .expect("the run writes the gaze target");
        assert_eq!(gaze_target, Value::ArrayF32(vec![1.0, 0.3, 0.1]));
        let status = store
            .read(&[handle.status.clone()])
            .into_iter()
            .next()
            .flatten()
            .expect("the run reports its status");
        assert_eq!(status, task::running());

        // The handle's stop call (what a cancel dispatches) ends the run.
        host.dispatch(&handle.stop).expect("the halt is served");
        host.tick(&store);
        let status = store
            .read(&[handle.status])
            .into_iter()
            .next()
            .flatten()
            .expect("the status key outlives the run");
        assert_ne!(status, task::running());
    }
}
