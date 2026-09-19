---
"vizij-standalone": minor
---

The page is a face on the Bevy view with a voice agent, on `@vizij/runtime` 3 directly: `mount` the canvas, `loadFace` the GLB, `run` the device; speech through the device's `say` skill (lips from its viseme players, audio through the runtime's Web Audio player, a halt cutting it within 250 ms); the ear (Deepgram) and the mind (OpenAI) as this app's own source; expressions by their ROS4HRI names and nothing written under `rig/<faceId>/…`. `@vizij/runtime-react`, `@vizij/render`, `@vizij/speech-react`, three.js and the store mirror to the Tauri side are gone; the Tauri shell wraps the page and still takes `--glb` and the speech flags. The agent tutorial (`tutorial-agent-face`) is this page.
