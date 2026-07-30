---
"@vizij/render": patch
---

`applyVizijBundle` strips stale `VIZIJ_bundle` copies from descendant nodes for the export window (restoring them on detach). A face loaded from a GLB kept its load-time bundle in the cloned scene's `userData`, so every re-export carried two bundles — and first-match readers (the authoring app itself, the native runtime) saw the stale one, shadowing any edit made since load.
