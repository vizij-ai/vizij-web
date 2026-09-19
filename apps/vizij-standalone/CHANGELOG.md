# vizij-standalone

## 0.2.0

### Minor Changes

- The page is a face on the Bevy view with a voice agent, on `@vizij/runtime` 3 directly: `mount` the canvas, `loadFace` the GLB, `run` the device; speech through the device's `say` skill (lips from its viseme players, audio through the runtime's Web Audio player, a halt cutting it within 250 ms); the ear (Deepgram) and the mind (OpenAI) as this app's own source; expressions by their ROS4HRI names and nothing written under `rig/<faceId>/…`. `@vizij/runtime-react`, `@vizij/render`, `@vizij/speech-react`, three.js and the store mirror to the Tauri side are gone; the Tauri shell wraps the page and still takes `--glb` and the speech flags. The agent tutorial (`tutorial-agent-face`) is this page.

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
