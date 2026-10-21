---
"vizij-standalone": patch
---

With `ros2`, the shell's bridge is arora-bridge-ros2 11.1, which speaks ros2-client 0.14 (RustDDS 0.14): a reliable writer's send window is `ResourceLimits::max_samples` (8192) rather than its history depth, so a reader behind by one sample no longer stalls a reliable writer for its blocking time and a dropped sample.
