# Tutorial: Build a Fullscreen Vizij Face App (Standalone)

## Overview

This guide walks through recreating the `fullscreen-face` experience from the `vizij-web` monorepo inside a fresh React project of your own. You will wire Vizij’s renderer, orchestrator, pose hotkeys, and mouse gaze without depending on the monorepo tooling.

The steps below reflect the latest fixes in the demo app:

- The pose and rig graphs are registered as a single merged controller so pose blends feed the low-level rig immediately.
- Neutral inputs are staged **once** at startup (or when the orchestrator reconnects) instead of being reapplied every frame.

## Prerequisites

- Node.js 18+ and npm (or pnpm/yarn)
- A basic React + TypeScript project (Vite, CRA, or similar)
- Vizij asset bundle exported from Vizij Studio or the authoring demos:
  - `face.glb` (renderer asset)
  - `rig.graph.json` (low-level rig)
  - `pose-rig.graph.json` (pose graph)
  - `pose-rig.config.json` (pose metadata and neutral defaults)

> `@vizij/render` expects `three` as a peer dependency, so install it alongside the Vizij packages.

### Install Vizij packages

```bash
npm install react react-dom three
npm install @vizij/render @vizij/orchestrator-react @vizij/value-json @vizij/utils
```

All subsequent examples live under `src/`.

## 1. Project bootstrap

Start from any React setup. For example, with Vite:

```bash
npm create vite@latest vizij-face -- --template react-ts
cd vizij-face
npm install
```

Create `src/assets/` and drop your Vizij files there. Add a helper index so imports stay tidy:

```ts
// src/assets/index.ts
import faceGlb from "./face.glb";
import rigGraph from "./rig.graph.json";
import poseRigGraph from "./pose-rig.graph.json";
import poseRigConfig from "./pose-rig.config.json";

export type PoseDefinition = {
  id: string;
  name?: string;
  description?: string;
  values: Record<string, number | undefined>;
};

export type PoseRigConfig = {
  version: number;
  faceId?: string;
  neutralInputs: Record<string, number>;
  poses: PoseDefinition[];
};

export const faceAssetUrl = faceGlb;
export const rigGraphSpec = rigGraph;
export const poseRigGraphSpec = poseRigGraph;
export const poseRigConfiguration = poseRigConfig as PoseRigConfig;
```

> Vite handles JSON/GLB imports by default. If you use another bundler, configure loaders accordingly.

## 2. Bridge orchestrator writes into the renderer

`@vizij/orchestrator-react` exposes `useOrchFrame` so you can inspect each merged frame. The helper below converts values to shapes the Vizij renderer accepts and writes them through the store.

```tsx
// src/orchestrator/RenderBridge.tsx
import { useEffect, useMemo } from "react";
import { useVizijStore } from "@vizij/render";
import { useOrchFrame, type ValueJSON } from "@vizij/orchestrator-react";
import {
  isNormalizedValue,
  valueAsBool,
  valueAsColorRgba,
  valueAsNumber,
  valueAsTransform,
  valueAsVector,
} from "@vizij/value-json";
import type { RawValue } from "@vizij/utils";

function asRaw(value: ValueJSON | undefined): RawValue | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return value as unknown as RawValue;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => asRaw(entry as ValueJSON)) as unknown as RawValue;
  }
  if (typeof value === "object" && !("type" in value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, asRaw(entry as ValueJSON)]),
    ) as unknown as RawValue;
  }
  if (!isNormalizedValue(value)) return undefined;

  switch (value.type) {
    case "float":
      return valueAsNumber(value) as RawValue;
    case "bool":
      return valueAsBool(value) as RawValue;
    case "vector":
    case "vec2":
    case "vec3":
    case "vec4":
    case "quat": {
      const vec = valueAsVector(value);
      return vec ? [...vec] as unknown as RawValue : undefined;
    }
    case "colorrgba": {
      const color = valueAsColorRgba(value);
      return color ? { r: color[0], g: color[1], b: color[2], a: color[3] } as RawValue : undefined;
    }
    case "transform": {
      const transform = valueAsTransform(value);
      if (!transform) return undefined;
      return {
        translation: [...transform.translation],
        rotation: [...transform.rotation],
        scale: [...transform.scale],
      } as unknown as RawValue;
    }
    case "record": {
      return Object.fromEntries(
        Object.entries(value.data ?? {}).map(([key, entry]) => [key, asRaw(entry)]),
      ) as unknown as RawValue;
    }
    case "enum": {
      const [tag, payload] = value.data;
      return { tag, value: asRaw(payload) } as unknown as RawValue;
    }
    default:
      return undefined;
  }
}

export function RenderBridge({
  namespace,
  outputPaths,
  enabled,
}: {
  namespace: string;
  outputPaths: string[];
  enabled: boolean;
}) {
  const frame = useOrchFrame();
  const setValue = useVizijStore((state) => state.setValue);
  const allow = useMemo(() => new Set(outputPaths), [outputPaths]);

  useEffect(() => {
    if (!enabled || !frame || allow.size === 0) return;

    for (const write of frame.merged_writes ?? []) {
      const path = write.path.startsWith("debug/") ? write.path.slice("debug/".length) : write.path;
      if (!allow.has(path)) continue;
      const raw = asRaw(write.value);
      if (raw === undefined) continue;
      setValue(path, namespace, raw);
    }
  }, [allow, enabled, frame, namespace, setValue]);

  return null;
}
```

## 3. Bootstrap and merge rig graphs

The latest fullscreen demo creates a **merged graph** that includes the low-level rig and the pose bridge. This ensures pose outputs reach the rig every frame.

```tsx
// src/orchestrator/useRigBootstrap.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useOrchestrator,
  type GraphRegistrationConfig,
} from "@vizij/orchestrator-react";

import {
  rigGraphSpec,
  poseRigGraphSpec,
  poseRigConfiguration,
  type PoseRigConfig,
} from "../assets";

type GraphLike = {
  nodes?: Array<{
    id?: string;
    type?: string;
    params?: { path?: string };
  }>;
};

function collectOutputPaths(spec: GraphLike): string[] {
  const paths = new Set<string>();
  (spec.nodes ?? []).forEach((node) => {
    if (String(node?.type ?? "").toLowerCase() !== "output") return;
    const path = node?.params?.path;
    if (typeof path === "string" && path.trim()) {
      paths.add(path.trim());
    }
  });
  return Array.from(paths);
}

function collectInputPaths(spec: GraphLike): string[] {
  const paths = new Set<string>();
  (spec.nodes ?? []).forEach((node) => {
    if (String(node?.type ?? "").toLowerCase() !== "input") return;
    const path = node?.params?.path;
    if (typeof path === "string" && path.trim()) {
      paths.add(path.trim());
    }
  });
  return Array.from(paths);
}

function collectInputPathMap(spec: GraphLike): Record<string, string> {
  const map: Record<string, string> = {};
  (spec.nodes ?? []).forEach((node) => {
    if (String(node?.type ?? "").toLowerCase() !== "input") return;
    const path = node?.params?.path;
    if (typeof path !== "string" || !path.trim()) return;
    const id = String(node?.id ?? "");
    if (id.startsWith("input_")) {
      map[id.slice("input_".length)] = path.trim();
    } else {
      map[id] = path.trim();
    }
  });
  return map;
}

export function useRigBootstrap(faceId: string) {
  const {
    ready,
    createOrchestrator,
    registerMergedGraph,
    removeGraph,
    setInput,
    normalizeGraphSpec,
  } = useOrchestrator();
  const [error, setError] = useState<string | null>(null);
  const mergedRef = useRef<string | null>(null);
  const stagedNeutralRef = useRef(false);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    createOrchestrator({ schedule: "SinglePass" }).catch((err) => {
      if (!cancelled) {
        const message =
          err instanceof Error ? err.message : "Failed to create orchestrator.";
        setError(message);
        console.error("[vizij-face] orchestrator: create failed", err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [createOrchestrator, ready]);

  const rigOutputs = useMemo(() => collectOutputPaths(rigGraphSpec as GraphLike), []);
  const poseOutputs = useMemo(
    () => collectOutputPaths(poseRigGraphSpec as GraphLike),
    [],
  );
  const poseInputs = useMemo(
    () => collectInputPaths(poseRigGraphSpec as GraphLike),
    [],
  );
  const rigInputMap = useMemo(
    () => collectInputPathMap(rigGraphSpec as GraphLike),
    [],
  );

  const stageNeutralInputs = useCallback(
    (force = false) => {
      if (stagedNeutralRef.current && !force) {
        return;
      }
      const staged = new Set<string>();

      Object.entries(poseRigConfiguration.neutralInputs ?? {}).forEach(
        ([id, rawValue]) => {
          const path = rigInputMap[id];
          if (!path) {
            console.warn("[vizij-face] neutral input missing path", id);
            return;
          }
          const numeric =
            typeof rawValue === "number" && Number.isFinite(rawValue)
              ? rawValue
              : 0;
          setInput(path, { float: numeric });
          staged.add(path);
        },
      );

      Object.values(rigInputMap).forEach((path) => {
        if (!staged.has(path)) {
          setInput(path, { float: 0 });
        }
      });

      stagedNeutralRef.current = true;
    },
    [rigInputMap, setInput],
  );

  useEffect(() => {
    if (!ready || mergedRef.current) {
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const rigSpec =
          typeof normalizeGraphSpec === "function"
            ? await normalizeGraphSpec(rigGraphSpec as Record<string, unknown>)
            : rigGraphSpec;
        const poseSpec =
          typeof normalizeGraphSpec === "function"
            ? await normalizeGraphSpec(
                poseRigGraphSpec as Record<string, unknown>,
              )
            : poseRigGraphSpec;

        const mergedId = await registerMergedGraph({
          id: `merged:${faceId}`,
          graphs: [
            {
              id: `rig:${faceId}`,
              spec: rigSpec as GraphRegistrationConfig["spec"],
              subs: { outputs: rigOutputs },
            },
            {
              id: `pose:${faceId}`,
              spec: poseSpec as GraphRegistrationConfig["spec"],
              subs: {
                inputs: poseInputs,
                outputs: poseOutputs,
              },
            },
          ],
          strategy: {
            outputs: "add",
            intermediate: "add",
          },
        });

        if (cancelled) {
          removeGraph(mergedId);
          return;
        }

        mergedRef.current = mergedId;
        stagedNeutralRef.current = false;
        stageNeutralInputs();
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to register rig graphs.";
        setError(message);
        console.error("[vizij-face] orchestrator: registration failed", err);
      }
    })();

    return () => {
      cancelled = true;
      if (mergedRef.current) {
        removeGraph(mergedRef.current);
        mergedRef.current = null;
      }
      stagedNeutralRef.current = false;
    };
  }, [
    faceId,
    normalizeGraphSpec,
    poseInputs,
    poseOutputs,
    ready,
    registerMergedGraph,
    removeGraph,
    rigOutputs,
    stageNeutralInputs,
  ]);

  useEffect(() => {
    if (!ready || !mergedRef.current) return;
    stageNeutralInputs();
  }, [ready, stageNeutralInputs]);

  return {
    ready,
    error,
    outputPaths: rigOutputs,
    poseInputs,
    poseOutputs,
    poseConfig: poseRigConfiguration as PoseRigConfig,
    stageNeutralInputs,
  };
}
```

## 4. Input helpers

### Keyboard pose triggers

```tsx
// src/hooks/usePoseHotkeys.ts
import { useEffect } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";
import type { PoseRigConfig, PoseDefinition } from "../assets";

const HOTKEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"] as const;

function toSegment(pose: PoseDefinition): string {
  const source = (pose.name ?? pose.id ?? "").trim();
  const cleaned = source
    ? source.toLowerCase()
    : pose.id.replace(/[^a-z0-9]+/gi, "_");
  return cleaned.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function usePoseHotkeys(
  faceId: string,
  config: PoseRigConfig,
  enabled: boolean,
) {
  const { setInput } = useOrchestrator();

  useEffect(() => {
    if (!enabled) return;

    const bindings = HOTKEYS.reduce<Map<string, PoseDefinition>>(
      (acc, code, index) => {
        const pose = config.poses[index];
        if (pose) acc.set(code, pose);
        return acc;
      },
      new Map(),
    );
    if (bindings.size === 0) return;

    const active = new Set<string>();

    const applyWeight = (pose: PoseDefinition, weight: number) => {
      const path = `rig/${faceId}/poses/${toSegment(pose)}.weight`;
      setInput(path, { float: weight });
    };

    const handleDown = (event: KeyboardEvent) => {
      const pose = bindings.get(event.code);
      if (!pose || active.has(event.code)) return;
      active.add(event.code);
      applyWeight(pose, 1);
    };

    const handleUp = (event: KeyboardEvent) => {
      const pose = bindings.get(event.code);
      if (!pose) return;
      active.delete(event.code);
      applyWeight(pose, 0);
    };

    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
      bindings.forEach((pose) => applyWeight(pose, 0));
    };
  }, [config.poses, enabled, faceId, setInput]);
}
```

### Mouse gaze tracking

```tsx
// src/hooks/useMouseGaze.ts
import { useEffect, useRef } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";

const STANDARD = {
  leftX: "standard/left_eye/pos/x",
  leftY: "standard/left_eye/pos/y",
  rightX: "standard/right_eye/pos/x",
  rightY: "standard/right_eye/pos/y",
} as const;

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}

export function useMouseGaze(faceId: string, enabled: boolean) {
  const { setInput } = useOrchestrator();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const target = ref.current;
    if (!target) return;

    const setEye = (path: string, value: number) => {
      setInput(`rig/${faceId}/${path}`, { float: clamp(value) });
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      const normalizedX = clamp(x * 2 - 1);
      const normalizedY = clamp((1 - y) * 2 - 1);

      setEye(STANDARD.leftX, normalizedX);
      setEye(STANDARD.rightX, normalizedX);
      setEye(STANDARD.leftY, normalizedY);
      setEye(STANDARD.rightY, normalizedY);
    };

    const reset = () => {
      Object.values(STANDARD).forEach((path) => setEye(path, 0));
    };

    target.addEventListener("pointermove", handlePointer);
    target.addEventListener("pointerdown", handlePointer);
    target.addEventListener("pointerleave", reset);
    target.addEventListener("pointerup", reset);

    return () => {
      target.removeEventListener("pointermove", handlePointer);
      target.removeEventListener("pointerdown", handlePointer);
      target.removeEventListener("pointerleave", reset);
      target.removeEventListener("pointerup", reset);
    };
  }, [enabled, faceId, setInput]);

  return ref;
}
```

## 5. Load and display the face

```tsx
// src/components/FaceCanvas.tsx
import { useEffect, useState } from "react";
import { Vizij, loadGLTF, useVizijStore, type World } from "@vizij/render";
import type { Group as VizijGroup } from "@vizij/render";
import { faceAssetUrl } from "../assets";

export const FACE_NAMESPACE = "fullscreen-face";

function findRoot(world: World): string | null {
  return (
    Object.values(world).find(
      (entry): entry is VizijGroup =>
        entry?.type === "group" && Boolean(entry.rootBounds),
    )?.id ?? null
  );
}

export function FaceCanvas() {
  const addWorldElements = useVizijStore((state) => state.addWorldElements);
  const [rootId, setRootId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [world, animatables] = await loadGLTF(
          faceAssetUrl,
          [FACE_NAMESPACE],
          true,
        );
        if (cancelled) return;

        const root = findRoot(world);
        if (!root) {
          throw new Error("Unable to locate the Vizij root node in the GLB.");
        }

        addWorldElements(world, animatables, true);
        setRootId(root);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load GLB.");
        console.error("[vizij-face] FaceCanvas: load failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [addWorldElements]);

  if (error) {
    return <div className="status error">Failed to load face: {error}</div>;
  }
  if (!rootId) {
    return <div className="status">Loading face…</div>;
  }

  return (
    <Vizij
      rootId={rootId}
      namespace={FACE_NAMESPACE}
      className="face-canvas"
    />
  );
}
```

## 6. Compose the app runtime

```tsx
// src/FaceApp.tsx
import { useMemo, useCallback, useEffect, useRef, useState } from "react";
import { VizijContext, useDefaultVizijStore } from "@vizij/render";
import { OrchestratorProvider, useOrchestrator } from "@vizij/orchestrator-react";

import { FaceCanvas, FACE_NAMESPACE } from "./components/FaceCanvas";
import { RenderBridge } from "./orchestrator/RenderBridge";
import { useRigBootstrap } from "./orchestrator/useRigBootstrap";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { usePoseHotkeys } from "./hooks/usePoseHotkeys";
import { poseRigConfiguration } from "./assets";

const FACE_ID = (poseRigConfiguration.faceId ?? "face").toLowerCase();

function RuntimeControls({
  ready,
  stageDefaults,
}: {
  ready: boolean;
  stageDefaults: (force?: boolean) => void;
}) {
  const { step } = useOrchestrator();
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const intervalMs = 1000 / 2; // Matches the fullscreen demo cadence

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!ready || runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    stageDefaults(true);
    let last = performance.now();
    timerRef.current = window.setInterval(() => {
      if (!runningRef.current) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      try {
        step(dt);
      } catch (err) {
        console.error("[vizij-face] orchestrator: step failed", err);
      }
    }, intervalMs);
  }, [intervalMs, ready, stageDefaults, step]);

  useEffect(() => {
    if (!ready && runningRef.current) {
      stop();
    }
    return stop;
  }, [ready, stop]);

  return (
    <div className="runtime-controls">
      <button onClick={start} disabled={!ready || running}>
        Start
      </button>
      <button onClick={stop} disabled={!ready || !running}>
        Pause
      </button>
    </div>
  );
}

function FaceRuntime() {
  const { ready, error, outputPaths, poseConfig, stageNeutralInputs } =
    useRigBootstrap(FACE_ID);
  const gazeRef = useMouseGaze(FACE_ID, ready);
  usePoseHotkeys(FACE_ID, poseConfig, ready);

  const hotkeys = useMemo(
    () =>
      poseConfig.poses.slice(0, 5).map((pose, index) => ({
        key: index + 1,
        label: pose.name ?? `Pose ${index + 1}`,
      })),
    [poseConfig.poses],
  );

  return (
    <div className="fullscreen">
      {error ? <div className="status error">{error}</div> : null}
      <div ref={gazeRef} className="canvas-wrapper">
        <FaceCanvas />
      </div>
      <RenderBridge
        namespace={FACE_NAMESPACE}
        outputPaths={outputPaths}
        enabled={ready}
      />
      <RuntimeControls ready={ready} stageDefaults={stageNeutralInputs} />
      <div className="hint">
        <div>Move the mouse to steer gaze.</div>
        <div>Press number keys to trigger poses:</div>
        <ul>
          {hotkeys.map((entry) => (
            <li key={entry.key}>
              <kbd>{entry.key}</kbd> → {entry.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FaceApp() {
  return (
    <VizijContext.Provider value={useDefaultVizijStore}>
      <OrchestratorProvider autostart={false}>
        <FaceRuntime />
      </OrchestratorProvider>
    </VizijContext.Provider>
  );
}
```

Wire the entry point (`src/main.tsx` in Vite projects) to render `<FaceApp />`, and add any CSS you need for layout.

## 7. Run the app

- `npm run dev`
- Open the dev server (default `http://localhost:5173/`).
- Click **Start** to begin stepping, move the mouse to test gaze, and trigger poses with the `1–5` keys.

If nothing animates:

1. Watch the console for missing neutral paths. Update `pose-rig.config.json` or `collectInputPathMap` if asset IDs change.
2. Confirm the merged graph registration succeeded (errors are logged as soon as registration fails).
3. Verify the orchestrator is stepping—add a log inside the interval or switch to a `requestAnimationFrame` loop for smoother updates.

## Key differences from earlier demos

- **Merged controller:** The pose and rig graphs are registered together. In older guides they were separate, which prevented pose outputs from reaching the rig.
- **Neutral staging:** Inputs are staged when the orchestrator starts and when you explicitly request it, not every frame. This was the root cause of the “no motion” bug fixed in `fullscreen-face`.
- **Standalone packages:** Everything runs on published npm packages (`@vizij/render`, `@vizij/orchestrator-react`, `@vizij/value-json`, `@vizij/utils`)—no monorepo build steps required.
- **Manual stepping:** The UI exposes an explicit start/pause loop (5 Hz by default). Swap to `requestAnimationFrame` if you need higher fidelity.

With these pieces in place, you have a portable Vizij face viewer you can embed into any React experience. Feel free to expand it with your own UI, persistence, or animation tooling.
