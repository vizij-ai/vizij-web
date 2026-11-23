---
"@vizij/render": major
"@vizij/runtime-react": major
"vizij-authoring": patch
"vizij-standalone": patch
---

Faces run on `@vizij/runtime` 11, whose page drives its faces through the handle `mount` resolves to, by instance, and hears from them through one pushed event stream.

- **`@vizij/render`** takes `@vizij/runtime` ^11 (breaking). `<VizijCanvas>` keeps the App's handle and its event handler: `vizijHandle()` resolves to the handle once the canvas is mounted, `onVizijEvent(listener)` hears every event after the canvas has acted on it, and `isVizijDrawn(vizijId)` says whether a face has drawn since its last load, as its slot's `data-vizij-ready` does. A face's readiness and picks now come from the App's `ready` and `pick` events rather than from polling each frame; the frame loop still places each slot's face over the slot. `<Vizij>`'s `onPick` receives a `VizijPick` (`{ vizijId, elementId }`, exported), the same shape as before; a pick is now a click decided on release, so a drag that ends over nothing is no pick. A page listens through `onVizijEvent`, not the handle's `onEvent`, which the canvas owns.
- **`@vizij/runtime-react`** takes `@vizij/runtime` ^11 and `@vizij/render` ^4 (breaking). `VizijRuntimeProvider` loads its face through the canvas's handle, whose `load` resolves once the face's scene is indexed and its device built, and waits for the face's `ready` event rather than polling.
- **vizij-authoring** writes an edited in-place value through the handle's `setValue`, a vector, euler or RGB colour as its three numbers.
- **vizij-standalone** mounts, loads, places and unloads its face through the handle, and starts its device once the face's `ready` event arrives.
