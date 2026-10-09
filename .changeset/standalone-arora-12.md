---
"vizij-standalone": minor
---

The Tauri side runs on arora 12 and `arora-studio-bridge-client` 10. The webview's key catalog is the store's key meta: its `input` keys are open to remote writers of their type (`f64`), and so are the ROS4HRI profile's inputs; every bridge, Studio included, refuses a write to any other key or of another type, whole. The app's methods (`reset`, `speak`, `interrupt`, `mute_microphone`, `get_mic_muted`, `transport/*`) are a module of the device, served on every bridge. Studio's commands are answered by the device run, and the device publishes each key to Studio under its own path as it wrote it (protocol 3), which a Studio reads from studio client 10 on.
