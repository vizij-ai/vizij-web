---
"vizij-standalone": patch
---

The device retries its Semio Studio connection every 1 to 60 s instead of giving up on the first failure, so a device that starts before its network is up connects once it can. Production Studio still refuses to create its record, so a fresh install has none there.
