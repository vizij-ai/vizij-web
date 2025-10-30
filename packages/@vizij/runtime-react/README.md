# @vizij/runtime-react

React provider that bundles Vizij renderer assets with orchestrator controllers.

> **Status:** experimental. APIs may evolve before the first release.

## Install

```bash
pnpm add @vizij/runtime-react @vizij/render @vizij/orchestrator-react react react-dom
```

## Quick start

```tsx
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
} from "@vizij/runtime-react";

const bundle = {
  namespace: "demo",
  glb: { kind: "url", src: new URL("./face.glb", import.meta.url).href },
  rig: { id: "rig:demo", spec: rigGraphJson },
};

export function App() {
  return (
    <VizijRuntimeProvider assetBundle={bundle} autostart>
      <Face />
    </VizijRuntimeProvider>
  );
}

function Face() {
  const { loading, error } = useVizijRuntime();
  if (loading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <VizijRuntimeFace />;
}
```

Refer to `proposal.md` for the full design goals and API surface planned for this package.

## Root IDs and Bounds

Vizij exports embed hierarchy metadata (including `rootBounds`) inside the GLB. When `VizijRuntimeProvider` loads an asset bundle it:

1. Parses the GLB via `loadGLTF` / `loadGLTFFromBlob`, storing every renderable plus its bounds in the shared Vizij store. If the GLB lacks explicit bounds (aggressive-import mode), they are derived from the scene extents before being stored.
2. Scans the stored world object to locate the first group with `rootBounds`; the group id is cached in the runtime status (`status.rootId`) together with the namespace and face id.
3. `VizijRuntimeFace` reads `rootId`/namespace from `useVizijRuntime()` and renders the underlying `<Vizij>` component. The renderer uses the stored bounds to frame the camera and draw the optional safe-area overlay.

Because bounds are part of the GLB data, no additional configuration is required—once the bundle loads, the camera automatically fits the face using the same values you saw during authoring.
