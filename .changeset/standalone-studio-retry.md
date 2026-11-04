---
"vizij-standalone": patch
---

The device retries its Semio Studio connection and its registration every 1 to 60 s instead of giving up on the first failure, so a device that starts before its network is up reaches Studio once it can.
