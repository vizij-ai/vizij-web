---
"vizij-standalone": patch
---

Expand ROS 2 connection diagnostics: per-topic debug logging and bounded
error-backoff in the `arora-ros2` subscription streams, `publish_slot` /
`subscribe_slot` example binaries for cross-process DDS testing (with a
subscription-appropriate Reliable QoS option), connection-manager logging in
the standalone app, and many-slot stress plus Docker-driven `ros2 topic pub`
integration tests.
