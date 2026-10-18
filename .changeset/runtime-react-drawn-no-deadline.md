---
"@vizij/runtime-react": patch
---

`VizijRuntimeProvider` reports its face `ready` once the face is drawn, however long that takes. A face whose GPU compiles its pipelines for more than a minute — a software GPU's — stays `loading` until it draws instead of ending in `error`, and a face unmounted or replaced before it is drawn is taken down at once.
