# vizij-standalone

## 0.4.0

### Minor Changes

- ca85ce0: The page writes the face standard's conversation state on its face, each `standard/vizij/conversation/<state>` an `f32`, 1 while it holds and 0 at rest: `speaking` from the moment the `say` run is spawned until its status reads terminal or the page stops it, `user_speaking` as Deepgram's voice activity says, `thinking` while a call to OpenAI is pending. Showing another face returns all three to 0 on the face being left. The shipped Quori's conversational program takes a listening, a thinking and a speaking posture from them.

## 0.3.1

### Patch Changes

- 5c8df57: The page runs on `@vizij/runtime` 8.

## 0.3.0

### Minor Changes

- 2e5eb2a: The Tauri shell's device runs on arora 13 and `arora-studio-bridge-client` 10. A remote may write the ROS4HRI profile's inputs (`standard/ros4hri/*`), each of the type the profile states but for the gaze point, and no other key: every bridge, Studio included, refuses a write to any other key or of another type, whole. A remote may call the device's methods. Studio's commands are answered by the device run, so Studio lists the device's keys with their meta and its methods, and calls them. The device publishes each key to Studio under its own path as it wrote it (protocol 3), which a Studio reads from studio client 10 on. The shell serves the page `get_glb_source`, `read_glb_file` and `get_speech_keys`; the store mirror's commands and events, the endpoint and owner commands, and the WebSocket app methods (`reset`, `speak`, `interrupt`, `mute_microphone`, `get_mic_muted`, `transport/*`) are gone, since the page neither calls nor listens to them. With `ros2`, `/skill/set_expression` lands on the expression keys.

### Patch Changes

- 63493e1: With `ros2`, the shell's bridge is arora-bridge-ros2 11.1, which speaks ros2-client 0.14 (RustDDS 0.14): a reliable writer's send window is `ResourceLimits::max_samples` (8192) rather than its history depth, so a reader behind by one sample no longer stalls a reliable writer for its blocking time and a dropped sample.

## 0.2.0

### Minor Changes

- f95b7f8: The page is a face on the Bevy view with a voice agent, on `@vizij/runtime` 6 directly: `mount` the canvas, `loadVizij` the GLB, `run` the device; speech through the device's `say` skill, invoked by name (lips from its viseme players, audio through the runtime's Web Audio player, a halt cutting it within 250 ms); the ear (Deepgram) and the mind (OpenAI) as this app's own source; expressions as the face standard's weights (`standard/vizij/expression/<name>` set to 1, the previous one back to 0), each write of the key's declared type, and no rig path written. `@vizij/runtime-react`, `@vizij/render`, `@vizij/speech-react`, three.js and the store mirror to the Tauri side are gone; the Tauri shell wraps the page and still takes `--glb` and the speech flags.

## 0.1.3

### Patch Changes

- Updated dependencies [64bbc65]
- Updated dependencies [556b721]
  - @vizij/runtime-react@0.4.0
  - @vizij/speech-react@0.1.3

## 0.1.2

### Patch Changes

- abf9fc5: Expand ROS 2 connection diagnostics: per-topic debug logging and bounded
  error-backoff in the `arora-ros2` subscription streams, `publish_slot` /
  `subscribe_slot` example binaries for cross-process DDS testing (with a
  subscription-appropriate Reliable QoS option), connection-manager logging in
  the standalone app, and many-slot stress plus Docker-driven `ros2 topic pub`
  integration tests.
- Updated dependencies [b48bd8c]
- Updated dependencies [f63fde7]
- Updated dependencies [be44e99]
- Updated dependencies [1eaa5bf]
- Updated dependencies [1eaa5bf]
  - @vizij/node-graph-authoring@0.2.1
  - @vizij/node-graph-react@0.2.1
  - @vizij/render@0.1.2
  - @vizij/runtime-react@0.3.1
  - @vizij/speech-react@0.1.2
  - @vizij/utils@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [c70b674]
- Updated dependencies [2ffda39]
- Updated dependencies [22c1a61]
- Updated dependencies [6e7a15e]
  - @vizij/node-graph-react@0.2.0
  - @vizij/orchestrator-react@0.2.0
  - @vizij/node-graph-authoring@0.2.0
  - @vizij/runtime-react@0.2.0
  - @vizij/render@0.1.1
  - @vizij/speech-react@0.1.1
