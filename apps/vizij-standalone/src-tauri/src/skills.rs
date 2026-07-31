//! The device's skill plane: the pieces the arora run composes to serve
//! `look_at`.
//!
//! The arora runtime owns everything operational — the step loop, the
//! built-in keys, bridge pumping, `DescribeMethods`, and the interpreter
//! module's SPAWN/HALT — so this module only *builds*: the gaze host module
//! (the described `look_at` contract, from [`vizij_arora_behavior::gaze`])
//! and the graph interpreter holding the shipped look_at fragment. The
//! behavior stays data (the `skills/look_at.json` asset), exactly as on the
//! native app.

use arora::{HostModule, ModuleBuilder};
use arora_types::call::CallResult;
use vizij_arora_behavior::{gaze, task, ProcessingGraph};
use vizij_arora_host::skills::LOOK_AT_FUNCTION;

/// The graph interpreter the device runs: the shipped ROS4HRI profile as the
/// base graph — `standard/ros4hri/*` keys (typed topics, the gaze skill's
/// writes) become the face's `standard/vizij/*` controls right on the device,
/// so the webview only renders — with the look_at fragment registered on top
/// (runs exist only while goals are live). `rig_prefix` namespaces the
/// profile's outputs onto the face the webview advertised (empty: none did).
pub fn interpreter(rig_prefix: &str) -> ProcessingGraph {
    let (_, profile) = vizij_arora_host::ros4hri::ros4hri_source(rig_prefix);
    let spec = vizij_arora_behavior::parse_spec(&profile.to_string())
        .expect("the shipped ros4hri profile parses");
    let mut graph = ProcessingGraph::from_spec(spec).expect("the ros4hri profile encodes");
    graph.set_task_fragment(gaze::look_at_id(), gaze::look_at_fragment());
    graph
}

/// The rig prefix of the face the webview advertised — the path segment its
/// standard controls live under (e.g. `rig/quori_latest/` out of
/// `rig/quori_latest/standard/vizij/mouth/morph/jaw_open`). Empty until a
/// face with standard coverage loads.
pub fn rig_prefix_of(key_paths: impl Iterator<Item = String>) -> String {
    key_paths
        .filter_map(|path| {
            path.find("standard/vizij/")
                .map(|at| path[..at].to_string())
        })
        .next()
        .unwrap_or_default()
}

/// The gaze module: the look_at contract, described so bridges discover it
/// (and the ROS4HRI exposure profile binds `/skill/look_at` to it). The
/// closure is only reached when the device did not register the fragment —
/// it fails the run rather than pretending to gaze.
pub fn gaze_module() -> HostModule {
    ModuleBuilder::new(gaze::module_id())
        .described_function(
            gaze::look_at_id(),
            LOOK_AT_FUNCTION,
            gaze::look_at_signature(),
            |_call| {
                log::warn!("look_at invoked as a module call: no task fragment is registered");
                Ok(CallResult {
                    ret: task::failure(),
                    mutated: Vec::new(),
                })
            },
        )
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    use arora_behavior::{interpreter_module, RunPolicy};
    use arora_simple_data_store::SimpleDataStore;
    use arora_types::call::Call;
    use arora_types::data::{DataStore, Key};
    use arora_types::value::{StructureField, Value};
    use vizij_arora_host::ros4hri;

    /// The standalone's composition end to end: an arora over the SHARED
    /// store serves a look_at goal — spawn through the engine, the fragment
    /// grafts, steps write the gaze surface into the store the webview and
    /// bridges observe, and the handle's stop call ends the run.
    #[test]
    fn the_arora_serves_a_look_at_run_on_the_shared_store() {
        let store = SimpleDataStore::new();
        let mut arora = arora::Arora::builder()
            .with_data_store(Box::new(store.clone()))
            .with_host_module(gaze_module())
            .with_behavior_interpreter(Box::new(interpreter("rig/test_face/")))
            .build()
            .expect("the device composes");

        let parameters = gaze::look_at_parameters();
        let arg = |name: &str, value: Value| StructureField {
            id: *parameters
                .iter()
                .find(|(_, n)| n == &name)
                .expect("a declared parameter")
                .0,
            value: Box::new(value),
        };
        let look_at = Call {
            module_id: Some(gaze::module_id()),
            id: gaze::look_at_id(),
            args: vec![
                arg("policy", Value::String(String::new())),
                arg("target", Value::ArrayF32(vec![1.0, 0.3, 0.1])),
                arg("frame", Value::String("face".to_string())),
            ],
        };
        let spawned = arora
            .call(interpreter_module::encode_spawn(
                &look_at,
                RunPolicy::Concurrent,
            ))
            .expect("SPAWN dispatches through the engine");
        let handle =
            interpreter_module::decode_spawn_result(&spawned.ret).expect("a TaskHandle comes back");

        let read = |key: &Key| {
            store
                .read(std::slice::from_ref(key))
                .into_iter()
                .next()
                .flatten()
        };
        arora.step(Duration::from_millis(16)).expect("step");
        assert_eq!(
            read(&Key::from(ros4hri::GAZE_TARGET_KEY)),
            Some(Value::ArrayF32(vec![1.0, 0.3, 0.1])),
            "the run's gaze intent lands on the shared store"
        );
        assert_eq!(read(&handle.status), Some(task::running()));

        arora
            .call(handle.stop.clone())
            .expect("the halt dispatches through the engine");
        arora.step(Duration::from_millis(16)).expect("step");
        assert_ne!(read(&handle.status), Some(task::running()));

        // The ROS4HRI profile runs as the interpreter's base graph: the gaze
        // intent the run wrote onto standard/ros4hri/* comes out as the
        // face's rig-prefixed standard controls — ROS4HRI understanding on
        // the device itself, the webview only renders.
        let snapshot = store.snapshot();
        assert!(
            snapshot.storage.iter().any(|(key, value)| key
                .path
                .starts_with("rig/test_face/standard/vizij/")
                && value.is_some()),
            "the profile writes the face's standard controls"
        );
    }

    /// The rig prefix is read off the advertised catalog: the segment before
    /// the face's standard controls.
    #[test]
    fn the_rig_prefix_comes_from_the_catalog() {
        let paths = [
            "gaze/pupil/left/x".to_string(),
            "rig/quori_latest/standard/vizij/mouth/morph/jaw_open".to_string(),
        ];
        assert_eq!(rig_prefix_of(paths.into_iter()), "rig/quori_latest/");
        assert_eq!(rig_prefix_of(std::iter::empty()), "");
    }
}
