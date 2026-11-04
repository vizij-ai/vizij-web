---
"vizij-standalone": patch
---

On Android, a model opened with the app loads at that launch: the shell reads it from `files/`, where the activity saves it. A cold start without a model shows the default face. A model opened while the app is running is neither shown nor kept.
