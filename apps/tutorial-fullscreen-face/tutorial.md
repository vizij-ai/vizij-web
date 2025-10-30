# Tutorial: Vizij Runtime React Quickstart

This guide shows how to stand up a fullscreen Vizij face using the **new `@vizij/runtime-react` package**. The runtime bundles the renderer, orchestrator, asset loading, graph merging, and value bridging so you only have to define an asset bundle and render a component.

---

## 1. Prerequisites

- Node.js ≥ 18
- React + TypeScript project (Vite, CRA, Next, etc.)
- Vizij export bundle:
  - `face.glb` – renderer asset
  - `rig.graph.json` – low-level rig graph
  - `pose-rig.graph.json` – pose controller
  - `pose-rig.config.json` – pose metadata (neutral defaults + preset definitions)

> The tutorial demo stores these files under `src/assets/`. Adjust paths to match your project layout.

---

## 2. Install dependencies

```bash
pnpm add react react-dom three
pnpm add @vizij/runtime-react @vizij/render @vizij/utils
```

`@vizij/runtime-react` reuses `@vizij/render`, `@vizij/orchestrator-react`, and `@vizij/value-json` internally, so you don’t have to install them separately unless other parts of your app need them.

---

## 3. Define the asset bundle

Create an index alongside your exported files so the bundle stays declarative and type-safe.

```ts
// src/assets/index.ts
import faceGlb from "./face.glb";
import rigGraph from "./rig.graph.json";
import poseRigGraph from "./pose-rig.graph.json";
import poseRigConfig from "./pose-rig.config.json";

import type { VizijAssetBundle } from "@vizij/runtime-react";

export const FACE_ID = (poseRigConfig.faceId ?? "face").toLowerCase();

export const fullscreenFaceBundle: VizijAssetBundle = {
  namespace: "fullscreen-face",
  faceId: FACE_ID,
  glb: {
    kind: "url",
    src: faceGlb,
    aggressiveImport: true,
  },
  rig: {
    id: `rig:${FACE_ID}`,
    spec: rigGraph,
  },
  pose: {
    graph: {
      id: `pose:${FACE_ID}`,
      spec: poseRigGraph,
    },
    config: poseRigConfig,
    // Optional: keep GLB colours intact by skipping colour channels
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};
```

### Why the filter?
Neutral configs often set every colour channel to `0`. Returning `false` for paths containing `/color/` prevents neutral staging from overwriting the GLB’s baked colours.

---

## 4. Wrap your app with the runtime provider

Replace the old renderer/orchestrator wiring with a single provider + runtime-aware face component.

```tsx
// src/FaceApp.tsx
import { useEffect, useMemo } from "react";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
} from "@vizij/runtime-react";

import { fullscreenFaceBundle, FACE_ID, poseRigConfiguration } from "./assets";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { usePoseHotkeys, POSE_HOTKEY_ORDER } from "./hooks/usePoseHotkeys";

export function FaceApp() {
  return (
    <VizijRuntimeProvider assetBundle={fullscreenFaceBundle} autostart>
      <FaceRuntime />
    </VizijRuntimeProvider>
  );
}

function FaceRuntime() {
  const { ready, loading, error, stagePoseNeutral } = useVizijRuntime();
  const gazeRef = useMouseGaze(ready);
  usePoseHotkeys(poseRigConfiguration, ready);

  useEffect(() => {
    if (ready) stagePoseNeutral();
  }, [ready, stagePoseNeutral]);

  const hotkeyHints = useMemo(
    () =>
      poseRigConfiguration.poses
        .slice(0, POSE_HOTKEY_ORDER.length)
        .map((pose, idx) => ({
          key: POSE_HOTKEY_ORDER[idx],
          label: pose.name ?? `Pose ${idx + 1}`,
        })),
    [],
  );

  if (loading) return <Status message="Loading face…" />;
  if (error) return <Status tone="error" message={error.message} />;
  if (!ready) return <Status message="Initialising orchestrator…" />;

  return (
    <div className="fullscreen">
      <div ref={gazeRef} className="canvas-wrapper">
        <VizijRuntimeFace className="face-canvas" showSafeArea />
      </div>
      <Hints hotkeyHints={hotkeyHints} />
    </div>
  );
}

function Status({ message, tone }: { message: string; tone?: "error" }) {
  const className = tone === "error" ? "status error" : "status";
  return (
    <div className="fullscreen">
      <div className={className}>{message}</div>
    </div>
  );
}
```

> `VizijRuntimeFace` automatically discovers the GLB root id and namespace from the provider, so you no longer need the custom `<FaceCanvas />` wrapper.

---

## 5. Optional interaction helpers

- **Mouse gaze:** Update rig inputs in response to pointer movement.
- **Hotkeys:** Stage pose weights with a single button press.
- **Runtime hooks:** `useVizijRuntime()` exposes `setInput`, `animateValue`, `playAnimation`, and other orchestrator helpers.

### Mouse gaze example

```tsx
// src/hooks/useMouseGaze.ts
import { useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

const STANDARD_PATHS = {
  leftX: "standard/left_eye/pos/x",
  leftY: "standard/left_eye/pos/y",
  rightX: "standard/right_eye/pos/x",
  rightY: "standard/right_eye/pos/y",
} as const;

export function useMouseGaze(enabled: boolean) {
  const { setInput, faceId } = useVizijRuntime();
  const ref = useRef<HTMLDivElement>(null);
  const resolvedFaceId = (faceId ?? "face").toLowerCase();

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const node = ref.current;

    const clamp = (value: number) => Math.min(Math.max(value, -1), 1);
    const setEye = (path: string, value: number) => {
      setInput(`rig/${resolvedFaceId}/${path}`, { float: clamp(value) });
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;
      const normalizedX = clamp(xRatio * 2 - 1);
      const normalizedY = clamp((1 - yRatio) * 2 - 1);
      setEye(STANDARD_PATHS.leftX, normalizedX);
      setEye(STANDARD_PATHS.rightX, normalizedX);
      setEye(STANDARD_PATHS.leftY, normalizedY);
      setEye(STANDARD_PATHS.rightY, normalizedY);
    };

    const reset = () => {
      setEye(STANDARD_PATHS.leftX, 0);
      setEye(STANDARD_PATHS.leftY, 0);
      setEye(STANDARD_PATHS.rightX, 0);
      setEye(STANDARD_PATHS.rightY, 0);
    };

    node.addEventListener("pointermove", handlePointer);
    node.addEventListener("pointerdown", handlePointer);
    node.addEventListener("pointerleave", reset);
    node.addEventListener("pointerup", reset);

    return () => {
      node.removeEventListener("pointermove", handlePointer);
      node.removeEventListener("pointerdown", handlePointer);
      node.removeEventListener("pointerleave", reset);
      node.removeEventListener("pointerup", reset);
    };
  }, [enabled, setInput, resolvedFaceId]);

  return ref;
}
```

### Pose hotkeys example

```tsx
// src/hooks/usePoseHotkeys.ts
import { useEffect } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { PoseRigConfig, PoseDefinition } from "../assets";

export const POSE_HOTKEY_ORDER = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"] as const;

const toPathSegment = (pose: PoseDefinition) =>
  (pose.name ?? pose.id ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export function usePoseHotkeys(config: PoseRigConfig, enabled: boolean) {
  const { setInput, faceId } = useVizijRuntime();
  const resolvedFaceId = (faceId ?? "face").toLowerCase();

  useEffect(() => {
    if (!enabled) return;

    const bindings = POSE_HOTKEY_ORDER.reduce((acc, code, index) => {
      const pose = config.poses[index];
      if (pose) acc.set(code, pose);
      return acc;
    }, new Map<string, PoseDefinition>());
    if (bindings.size === 0) return;

    const activeKeys = new Set<string>();

    const applyWeight = (pose: PoseDefinition, weight: number) => {
      const path = `rig/${resolvedFaceId}/poses/${toPathSegment(pose)}.weight`;
      setInput(path, { float: weight });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const pose = bindings.get(event.code);
      if (!pose || activeKeys.has(event.code)) return;
      activeKeys.add(event.code);
      applyWeight(pose, 1);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const pose = bindings.get(event.code);
      if (!pose) return;
      activeKeys.delete(event.code);
      applyWeight(pose, 0);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      bindings.forEach((pose) => applyWeight(pose, 0));
    };
  }, [config.poses, enabled, resolvedFaceId, setInput]);
}
```

---

## 6. Runtime helpers worth knowing

`useVizijRuntime()` returns everything you need to drive the face:

| Helper | Purpose |
| --- | --- |
| `ready / loading / error` | Lifecycle flags for UI states |
| `namespace`, `faceId`, `rootId` | Useful when wiring custom logic |
| `setInput(path, value)` | Stage values directly into the orchestrator |
| `animateValue(path, target, options?)` | Tween input values over time |
| `playAnimation(id, options?)` / `stopAnimation(id)` | Trigger registered animation clips |
| `stagePoseNeutral(force?)` | Stage (filtered) neutral inputs on demand |
| `useVizijOutputs(paths)` | Subscribe to renderer values (e.g., debug overlays) |
| `useRigInput(path)` | Read/write a single channel as `[value, setValue]` |

Because the provider already registers rig + pose graphs and mirrors orchestrator writes into the renderer, you typically only need a few of these helpers to build rich interactions.

---

## 7. Summary

With `@vizij/runtime-react` you can bootstrap a Vizij face in three moves:

1. **Define a `VizijAssetBundle`.**
2. **Wrap your app with `<VizijRuntimeProvider assetBundle={...}>`.**
3. **Render `<VizijRuntimeFace />` and hook into `useVizijRuntime()` as needed.**

Everything else—GLB parsing, rig/pose merging, frame conversion, and orchestrator lifecycle—is handled automatically. Use runtime hooks to add gaze steering, hotkeys, or animation triggers without re-implementing the renderer/orchestrator bridge.
