---
"@vizij/render": minor
"@vizij/runtime-react": minor
---

A face's slot shows a loading view until the face is drawn: an image, a progress bar and the stage's label — the runtime's download (in MB), compile and start from `@vizij/runtime`'s `onInitProgress`, the view starting (`mount`), then the face's GLB, its load and its first frame. `@vizij/runtime` `^6.2.0` is required for `onInitProgress`.

- `<Vizij loadingImage>` replaces the image, a face outline shipped as inline SVG; `null` leaves it out. `<Vizij loading>` replaces the whole view with the page's element, given `{ stage, label, fraction }`; `loading={null}` shows none.
- `setVizijProgress(vizijId, progress)` reports a face's own stages — `fetch` with its bytes, `load`, `draw`, `failed` — for its slot; `null` says the face is unloaded. `VizijRuntimeProvider` reports its face's.
- The bar is a `role="progressbar"` with `aria-valuetext`, and `aria-valuenow` when the stage counts bytes against a known total; indeterminate otherwise.
- The view hides once the face is drawn and stays hidden through reloads, whose previous scene draws meanwhile.
- `<VizijCanvas>` gives the browser a frame to paint the slots' stage before `mount` and before `canvasMounted()` resolves, since `mount` and `loadVizij` hold the main thread.
