---
"@vizij/render": major
---

Faces draw on `@vizij/runtime`'s Bevy view, a peer dependency (`^6.0.0`); `three` serves only the loader and the exporter.

- `<VizijCanvas options? className? style? />` renders the page's one canvas and mounts the view on it once (`mount(canvas, options)`); a second `<VizijCanvas>`, a remount or React StrictMode's second effect shows the same canvas. By default it is fixed over the page with pointer events off. While it is shown, one animation-frame loop places each face over its slot (`placeVizij`) and hands each pick to the slot it names (`drainPicks`). `canvasMounted()` resolves with the canvas once mounted.
- `<Vizij vizijId />` is a face slot: a `<div>` where the face loaded under `vizijId` draws, with `data-vizij-id` and `data-vizij-ready`. `rootId` and `namespace` are replaced by `vizijId`; `toneMapping`, `fit`, `zoom` and `bounds` set the face's view (`setView`); `showSafeArea` outlines `safeArea(vizijId)` as a DOM overlay; `selection` sets the glowing elements (`setSelection`) in place of `showSelectionGlow`; `onPick` receives each press, a miss as `elementId: null`, in place of `onPointerMissed`.
- The react-three-fiber canvas, `InnerVizij`, the renderables (`Renderable` and the group, shape, ellipse and rectangle components), the selection glow, `useFeatures` and the canvas render counters are removed, with the `@react-three/fiber`, `@react-three/drei`, `react-error-boundary`, `clsx`, `deep-equal` and `tailwindcss` dependencies.
- The store no longer holds what only a mounted renderer wrote or read: `refs`, `setReference`, `getExportableBodies`, `onElementClick`, `hoveredElement`, `setHoveredElement`, `renderHit`, `slotConfig`, `setSlot`, `setSlots` and `clearSlot` are removed. Exporting builds the scene from the world with `buildSceneGraph`.
- `buildSceneGraph` exports an ellipse or a rectangle as a node with no mesh carrying its `RobotData` (`type`, `width`, `height`, `fillColor`, `fillOpacity`, …), which the Bevy view draws as a unit circle or square scaled by the width and height; the node holds the translation and rotation, and the width and height as its scale.
- `ToneMappingMode` is `@vizij/runtime`'s `ToneMapping`; `resolveToneMapping`, which returned three.js constants, is removed.
