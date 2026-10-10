# @vizij/runtime-react

One Vizij face's lifecycle in React, over
[`@vizij/runtime`](https://www.npmjs.com/package/@vizij/runtime) — the Bevy
view and each face's Arora device in one wasm module. The provider loads the
face and hands its children the face's `Runtime`, unwrapped: every device
operation is called on it. The package adds only what React needs: the
provider owning the face's one change drain, hooks that subscribe a component
to keys, and a JS tween.

The design, with the justification of each export and the mapping of every
0.4 call, is [`DESIGN-1.0.md`](./DESIGN-1.0.md).

## Installation

```bash
pnpm add @vizij/runtime-react @vizij/render @vizij/runtime react
```

`@vizij/runtime` and `@vizij/render` are peer dependencies, so that a page
resolves one copy of each: one wasm module, one page canvas.

## Usage

```tsx
import { VizijCanvas } from "@vizij/render";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useAnimateValue,
  useVizijRuntime,
} from "@vizij/runtime-react";

export function Page() {
  return (
    <>
      <VizijCanvas />
      <VizijRuntimeProvider glb="/faces/Quori_Current_Extended.glb">
        <VizijRuntimeFace style={{ width: 480, height: 360 }} />
        <Controls />
      </VizijRuntimeProvider>
    </>
  );
}

function Controls() {
  const { runtime, status } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  if (!runtime || status !== "ready") return null;
  return (
    <>
      <button
        onClick={() =>
          animateValue(runtime.path("standard/vizij/expression/happy"), 1)
        }
      >
        happy
      </button>
      <button onClick={() => runtime.invoke("say", { text: "Hello" })}>
        say hello
      </button>
    </>
  );
}
```

A face is driven through its Arora API — the methods it declares (`invoke`)
and its store (`setValue`, `writeValues`) — on the keys of the Vizij face
standard, `runtime.path("standard/vizij/…")`. See
[`DESIGN-1.0.md`](./DESIGN-1.0.md) section 4 for every intent and its key or
method, and for the keys a composed mapping or a running program writes over.

## API

- **`<VizijRuntimeProvider glb vizijId? options? run?>`** — fetches the GLB
  (a URL, a `Blob` or bytes), reads it with `describe`, waits for the page's
  `<VizijCanvas>`, loads the face with `loadVizij(vizijId, bytes, options)` and
  runs its device (`run`, default `true`; `false` leaves the page to call
  `runtime.step(dtMs)`). A new `glb` reloads the face in place; unmounting
  unloads it. `options` are `loadVizij`'s, read at each load.
- **`useVizijRuntime()`** — the face: `vizijId`, `status` (`loading`,
  `ready`, `error`), `error`, `behaviorError` (the device's standing behavior
  error), `runtime` (the `Runtime`) and `description` (`describe(glb)`: poses,
  rig inputs, programs, animations, metadata, bounds).
  `useOptionalVizijRuntime()` returns `null` outside a provider.
- **`useVizijValues(paths)`** — the current values of `paths`, re-rendering on
  change.
- **`useVizijChanges(listener)`** — each batch of store changes, at most once
  per animation frame, the first batch after a (re)load being the whole store;
  for consumers that must not re-render per change.
- **`useAnimateValue()`** — `animateValue(path, target, options)` and
  `cancelAnimation(path)`: a JS tween, one `setValue` per animation frame, in
  the numeric kind the key holds or rests at; `options` are `duration`
  (seconds) and `easing`. A newer tween on a path replaces the running one;
  unmounting cancels a component's tweens.
- **`<VizijRuntimeFace …>`** — `@vizij/render`'s `<Vizij>` slot bound to the
  provider's face.

The provider is the only caller of `runtime.drainChanges()`, whose cursor is
one per `Runtime`; read changes through the two hooks.

## Development

```bash
pnpm --filter "@vizij/runtime-react" build
pnpm --filter "@vizij/runtime-react" test
pnpm --filter "@vizij/runtime-react" typecheck
pnpm --filter "@vizij/runtime-react" lint
```

The tests (Vitest, jsdom) run the provider and the hooks against stand-ins of
`@vizij/runtime` and `@vizij/render`.
