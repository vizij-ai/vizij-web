//! The device's skill plane: the pieces the arora run composes to serve
//! `look_at` and to read the ROS4HRI surface.
//!
//! The arora runtime owns everything operational — the step loop, the
//! built-in keys, bridge pumping, `DescribeMethods`, and the interpreter
//! module's SPAWN/HALT — so this module only *builds* the graph interpreter
//! holding the shipped look_at fragment, and states which keys a remote may
//! write. No module implements look_at: the fragment carries the contract's
//! description (from [`vizij_arora_behavior::gaze`]), so the interpreter
//! describes the method and a remote spawns it through the interpreter
//! module. The behavior stays data (the `skills/look_at.json` asset), exactly
//! as on the native app.

use std::collections::HashMap;

use arora_types::data::{DataStore, Key, KeyMeta};
use arora_types::value::Type;
use vizij_arora_behavior::{gaze, ProcessingGraph};

/// The graph interpreter the device runs: the shipped ROS4HRI profile as the
/// base graph — `standard/ros4hri/*` keys (typed topics, the gaze skill's
/// writes) become `standard/vizij/*` controls on the device — with the
/// look_at fragment registered on top (runs exist only while goals are live).
/// The controls carry no rig prefix: the device drives no face of its own.
pub fn interpreter() -> ProcessingGraph {
    let (_, profile) = vizij_arora_host::ros4hri::ros4hri_source("");
    let spec = vizij_arora_behavior::parse_spec(&profile.to_string())
        .expect("the shipped ros4hri profile parses");
    let mut graph = ProcessingGraph::from_spec(spec).expect("the ros4hri profile encodes");
    graph.set_task_fragment(
        gaze::look_at::ids::look_at::FUNCTION,
        gaze::look_at_fragment(),
    );
    graph
}

/// Open the ROS4HRI profile's inputs to remote writers: the keys the ROS 2
/// preset's typed topics (`/robot_face/look_at`, `/skill/set_expression`,
/// `/tts/viseme`, …) and any other bridge write, and the profile graph turns
/// into controls. Each states its range, its rest, and the type its profile
/// states, so the run refuses a write of another type — but for a structure:
/// the bridges land a gaze point in the store's vec3 form (`ArrayF32`), where
/// the profile names a structure, so that input states no type. Every other
/// key stays closed, the profile's outputs — what the device reports —
/// included.
pub fn open_ros4hri_inputs(store: &dyn DataStore) {
    let meta: HashMap<Key, KeyMeta> = vizij_arora_host::profile::ros4hri_profile()
        .keys
        .into_iter()
        .filter(|key| key.kind.as_deref() == Some("input"))
        .map(|key| {
            let mut meta = KeyMeta::new().editable();
            meta.ty = key.value_type.filter(|ty| !matches!(ty, Type::Structure));
            meta.min = key.min;
            meta.max = key.max;
            meta.default = key.default_value;
            (Key::from(key.path), meta)
        })
        .collect();
    if let Err(e) = store.set_meta(meta) {
        log::warn!("the store keeps no key meta: the ROS4HRI inputs stay closed ({e:?})");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    use arora_behavior::{interpreter_module, RunPolicy};
    use arora_simple_data_store::SimpleDataStore;
    use arora_types::call::Call;
    use arora_types::value::{StructureField, Value};
    use vizij_arora_behavior::task;
    use vizij_arora_host::ros4hri;

    /// The standalone's composition end to end: an arora over the shared
    /// store serves a look_at goal — spawn through the engine, the fragment
    /// grafts, steps write the gaze surface into the store the bridges
    /// observe, and the handle's stop call ends the run.
    #[test]
    fn the_arora_serves_a_look_at_run_on_the_shared_store() {
        let store = SimpleDataStore::new();
        let mut arora = arora::Arora::builder()
            .with_data_store(Box::new(store.clone()))
            .with_behavior_interpreter(Box::new(interpreter()))
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
        // look_at is described under the interpreter module, which spawns it.
        let look_at = Call {
            module_id: Some(interpreter_module::ID),
            id: gaze::look_at::ids::look_at::FUNCTION,
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
        // intent the run wrote onto standard/ros4hri/* comes out as
        // standard/vizij/* controls, unprefixed.
        let snapshot = store.snapshot();
        assert!(
            snapshot
                .storage
                .iter()
                .any(|(key, value)| key.path.starts_with("standard/vizij/") && value.is_some()),
            "the profile writes the standard controls"
        );
    }

    /// The profile's inputs are open, typed as the profile states but for the
    /// gaze point, which arrives as the preset's `ArrayF32`; its reported
    /// speech stays closed.
    #[test]
    fn the_ros4hri_inputs_are_open_and_its_outputs_closed() {
        let store = SimpleDataStore::new();
        open_ros4hri_inputs(&store);
        let meta = store.meta(&[
            Key::from(ros4hri::GAZE_TARGET_KEY),
            Key::from(ros4hri::EXPRESSION_NAME_KEY),
            Key::from(ros4hri::VISEME_KEY),
            Key::from(ros4hri::SPEECH_TEXT_KEY),
        ]);
        let input = |at: usize| meta[at].as_ref().expect("an input is described");
        for at in 0..3 {
            assert!(input(at).editable);
        }
        assert_eq!(input(0).ty, None);
        assert_eq!(input(1).ty, Some(Type::String));
        assert_eq!(input(2).ty, Some(Type::U8));
        assert!(!meta[3].as_ref().is_some_and(|meta| meta.editable));
    }
}
