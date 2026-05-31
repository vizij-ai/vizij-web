# Runtime React And Studio Support Thinning Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining responsibility cleanup after the browser-first Arora V1 migration by moving the last semantic planning pieces out of `@vizij/runtime-react` and `apps/vizij-authoring` into `@vizij/studio-support`, while keeping React packages responsible for host/UI effects.

**Architecture:** `@vizij/studio-support` owns pure semantic planning, migration, validation, bundle preparation, path mapping, and compatibility rules. `@vizij/runtime-react` owns backend/session/renderer host effects. `apps/vizij-authoring` owns UI workflow, selection, panel state, local dialogs, and applying support-produced plans.

**Tech Stack:** TypeScript, React, Vitest, Playwright, `@vizij/studio-support`, `@vizij/runtime-react`, `apps/vizij-authoring`.

---

## Scope

This plan finishes cleanup that was intentionally left after the browser-first V1 gate passed. It does not add native/desktop execution, behavior-tree orchestration, Studio fixture-pack validation, or broad Rust/Wasm performance promotion.

The browser-first V1 acceptance proof already exists in `apps/vizij-authoring/e2e/arora-web-runtime.workflow.pw.ts`. This plan should preserve that proof and reduce remaining responsibility leaks.

## Current State

Already moved into `@vizij/studio-support`:

1. Runtime asset view and loaded asset payload shaping.
2. Runtime graph bundle update planning and acknowledgement policy.
3. Runtime registration plan construction.
4. Runtime program controller synchronization planning.
5. Runtime input staging policy.
6. Legacy pose-weight fallback write planning.
7. Live-preview bundle assembly for runtime graphs, animations, and motiongraph programs.
8. Export bundle assembly through `prepareAuthoringVizijBundleForExport`.
9. Graph import/diff/audit helpers.
10. Motion graph spec/import/default/reset-value semantics.
11. Pose-rig compiler/service semantics.
12. Pipeline, binding, contribution, and face-inspector semantic helpers.

Still worth cleaning up:

1. Runtime frame-write pose-control bridge planning still lives in `@vizij/runtime-react`.
2. Host animation fallback playback is still embedded in `VizijRuntimeProvider.tsx`.
3. Runtime compatibility re-exports and docs still make `@vizij/runtime-react` look like a semantic helper source.
4. Shape rename semantic remapping still lives in `apps/vizij-authoring`.
5. Inspector legacy binding migration orchestration still lives inline in `InspectorContent.tsx`.
6. Imported bundle animation/program target derivation and override application still lives in `App.tsx`.
7. Debug/audit panel graph mutation planning still lives in UI code.

## Definition Of Done

The closeout is done when:

1. `@vizij/runtime-react` contains no pose-control path parsing, pose-control epsilon policy, or semantic fallback write planning.
2. `@vizij/runtime-react` host animation fallback is isolated behind a small host helper or explicitly documented as compatibility-only host behavior.
3. `@vizij/runtime-react` docs direct new semantic-helper imports to `@vizij/studio-support`.
4. Shape rename logic in `apps/vizij-authoring` applies a support-owned rename plan instead of calculating semantic input/binding rewrites inline.
5. Inspector legacy binding migration applies a support-owned migration plan instead of building migration patches inline.
6. Imported bundle target derivation and override application are support-owned pure helpers, with `App.tsx` keeping UI state and selection.
7. Debug/audit graph repair actions apply support-owned graph-repair plans.
8. The browser-first acceptance proof still passes.

Final verification:

```bash
pnpm --filter @vizij/studio-support typecheck
pnpm --filter @vizij/studio-support test
pnpm --filter @vizij/runtime-react typecheck
pnpm --filter @vizij/runtime-react test
pnpm --filter vizij-authoring typecheck
pnpm --filter vizij-authoring test
pnpm --filter vizij-authoring test:e2e:arora
pnpm --filter vizij-authoring test:e2e:smoke
git diff --check
```

Expected: all commands exit `0`. Existing non-failing warnings about Three.js duplication, wasm-pack version, chunk size, and `NO_COLOR` may remain.

---

## Task 1: Move Pose-Control Frame-Write Bridge Planning To Studio Support

**Purpose:** Remove the last pose-control semantic planning from `@vizij/runtime-react/src/host/frameWrites.ts`.

**Files:**

- Modify: `packages/@vizij/studio-support/src/utils/poseRuntime.ts`
- Modify: `packages/@vizij/studio-support/src/index.ts`
- Modify: `packages/@vizij/studio-support/src/__tests__/poseRuntime.test.ts`
- Modify: `packages/@vizij/runtime-react/src/host/frameWrites.ts`
- Modify: `packages/@vizij/runtime-react/src/__tests__/frameWrites.test.ts`

- [ ] **Step 1: Add the support-owned pose-control bridge test**

Add these assertions to `packages/@vizij/studio-support/src/__tests__/poseRuntime.test.ts`:

```ts
import {
  planPoseControlBridgeWrite,
  type PoseControlBridgeState,
} from "../index";

it("plans pose-control frame output bridge writes through rig aliases", () => {
  const state: PoseControlBridgeState = { previousValues: new Map() };

  expect(
    planPoseControlBridgeWrite({
      basePath: "rig/quori_latest/pose/control/happy",
      rawValue: 0.75,
      namespace: "demo-face",
      rigInputPathMap: {
        happy: "rig/quori_latest/mouth/smile",
      },
      rigPoseControlInputIds: new Set(["happy"]),
      state,
    }),
  ).toEqual({
    path: "rig/quori_latest/mouth/smile",
    value: { float: 0.75 },
  });

  expect(
    planPoseControlBridgeWrite({
      basePath: "rig/quori_latest/pose/control/happy",
      rawValue: 0.75,
      namespace: "demo-face",
      rigInputPathMap: {
        happy: "rig/quori_latest/mouth/smile",
      },
      rigPoseControlInputIds: new Set(["happy"]),
      state,
    }),
  ).toBeNull();
});
```

- [ ] **Step 2: Run the support test and confirm it fails**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/poseRuntime.test.ts
```

Expected: fail because `planPoseControlBridgeWrite` and `PoseControlBridgeState` do not exist.

- [ ] **Step 3: Implement the support helper**

Add to `packages/@vizij/studio-support/src/utils/poseRuntime.ts`:

```ts
import type { ValueJSON } from "../types";

const POSE_CONTROL_BRIDGE_EPSILON = 1e-6;

export type PoseControlBridgeState = {
  previousValues: Map<string, number>;
};

export type PoseControlBridgeWrite = {
  path: string;
  value: ValueJSON;
};

export function planPoseControlBridgeWrite({
  basePath,
  rawValue,
  namespace,
  rigInputPathMap,
  rigPoseControlInputIds,
  state,
}: {
  basePath: string;
  rawValue: unknown;
  namespace: string;
  rigInputPathMap: Record<string, string>;
  rigPoseControlInputIds: Set<string>;
  state: PoseControlBridgeState;
}): PoseControlBridgeWrite | null {
  const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(basePath);
  if (
    !poseControlMatch ||
    typeof rawValue !== "number" ||
    !Number.isFinite(rawValue)
  ) {
    return null;
  }

  const inputId = (poseControlMatch[1] ?? "").trim();
  if (inputId.length === 0) {
    return null;
  }

  const hasNativePoseControlInput = rigPoseControlInputIds.has(inputId);
  const mappedInputPath = resolvePoseControlInputPath({
    inputId,
    basePath,
    rigInputPathMap,
    hasNativePoseControlInput,
  });
  if (!mappedInputPath) {
    return null;
  }

  const bridgeKey = `${namespace}:${mappedInputPath}`;
  const previousValue = state.previousValues.get(bridgeKey);
  if (
    previousValue !== undefined &&
    Math.abs(previousValue - rawValue) <= POSE_CONTROL_BRIDGE_EPSILON
  ) {
    return null;
  }

  state.previousValues.set(bridgeKey, rawValue);
  return {
    path: mappedInputPath,
    value: { float: rawValue },
  };
}
```

Export the helper and types from `packages/@vizij/studio-support/src/index.ts`.

- [ ] **Step 4: Replace runtime-local pose-control bridge planning**

In `packages/@vizij/runtime-react/src/host/frameWrites.ts`, remove `maybeBridgePoseControlInput`, remove the runtime-local epsilon constant, and call the support helper:

```ts
const bridgeWrite = planPoseControlBridgeWrite({
  basePath,
  rawValue: raw,
  namespace: args.namespace,
  rigInputPathMap: args.rigInputPathMap,
  rigPoseControlInputIds: args.rigPoseControlInputIds,
  state: { previousValues: args.poseControlBridgeValues },
});
if (bridgeWrite) {
  poseControlInputs.push(bridgeWrite);
}
```

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/poseRuntime.test.ts
pnpm --filter @vizij/runtime-react exec vitest --run src/__tests__/frameWrites.test.ts
pnpm --filter @vizij/studio-support typecheck
pnpm --filter @vizij/runtime-react typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/@vizij/studio-support/src/utils/poseRuntime.ts packages/@vizij/studio-support/src/index.ts packages/@vizij/studio-support/src/__tests__/poseRuntime.test.ts packages/@vizij/runtime-react/src/host/frameWrites.ts packages/@vizij/runtime-react/src/__tests__/frameWrites.test.ts
git commit -m "Move pose control frame bridge planning to studio support"
```

---

## Task 2: Isolate Runtime Host Animation Fallback As Compatibility Glue

**Purpose:** Keep `VizijRuntimeProvider.tsx` from looking like the canonical animation executor while preserving fallback behavior for non-Arora/failed-controller paths.

**Files:**

- Create: `packages/@vizij/runtime-react/src/host/hostAnimationFallback.ts`
- Create: `packages/@vizij/runtime-react/src/__tests__/hostAnimationFallback.test.ts`
- Modify: `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`
- Modify: `packages/@vizij/runtime-react/src/__tests__/runtimeProviderExecutionLoop.test.tsx`

- [ ] **Step 1: Add a host fallback helper test**

Create `packages/@vizij/runtime-react/src/__tests__/hostAnimationFallback.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createHostAnimationFallbackPlayback,
  type HostAnimationFallbackClipState,
} from "../host/hostAnimationFallback";

describe("host animation fallback playback", () => {
  it("advances host-owned clip playback and writes sampled clip outputs", () => {
    const clip = {
      id: "blink",
      duration: 1,
      tracks: [
        {
          path: "rig/face/lids/blink",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
          interpolation: "linear",
        },
      ],
    };
    const state: HostAnimationFallbackClipState = {
      id: "blink",
      time: 0,
      duration: 1,
      speed: 1,
      weight: 1,
      loop: false,
      playing: true,
      resolve: null,
      completion: null,
    };
    const writeClipOutputs = vi.fn();
    const clearClipOutputs = vi.fn();

    const result = createHostAnimationFallbackPlayback({
      resolveClipById: () => clip,
      writeClipOutputs,
      clearClipOutputs,
    }).advance({
      states: new Map([["blink", state]]),
      dt: 0.5,
      hostOwnsClipOutputs: true,
      animationSystemActive: true,
    });

    expect(result.activeCount).toBe(1);
    expect(writeClipOutputs).toHaveBeenCalledWith(
      clip,
      expect.objectContaining({ time: 0.5 }),
    );
    expect(clearClipOutputs).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the helper test and confirm it fails**

Run:

```bash
pnpm --filter @vizij/runtime-react exec vitest --run src/__tests__/hostAnimationFallback.test.ts
```

Expected: fail because `hostAnimationFallback.ts` does not exist.

- [ ] **Step 3: Extract host fallback types and advance helper**

Create `packages/@vizij/runtime-react/src/host/hostAnimationFallback.ts`. Move the `ClipPlaybackState` shape and the host fallback advance loop out of `VizijRuntimeProvider.tsx` into this file. Keep the helper explicitly host-scoped:

```ts
export type HostAnimationFallbackClipState = {
  id: string;
  time: number;
  duration: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
  resolve: (() => void) | null;
  completion: Promise<void> | null;
};

export function createHostAnimationFallbackPlayback(args: {
  resolveClipById: (id: string) => unknown;
  writeClipOutputs: (
    clip: unknown,
    state: HostAnimationFallbackClipState,
  ) => void;
  clearClipOutputs: (id: string) => void;
}) {
  return {
    advance({
      states,
      dt,
      hostOwnsClipOutputs,
      animationSystemActive,
    }: {
      states: Map<string, HostAnimationFallbackClipState>;
      dt: number;
      hostOwnsClipOutputs: boolean;
      animationSystemActive: boolean;
    }) {
      // Move the current provider loop here without changing behavior. Return
      // counts and completed ids so the provider can update debug state.
      return { activeCount: states.size };
    },
  };
}
```

Move the current provider loop into the helper body. The provider should keep only playback command handlers, refs, debug counters, and host effect calls.

- [ ] **Step 4: Wire `VizijRuntimeProvider` to the helper**

In `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`:

1. Import `createHostAnimationFallbackPlayback` and `HostAnimationFallbackClipState`.
2. Replace the local `ClipPlaybackState` type.
3. Replace the inline host fallback advance loop with `hostFallback.advance(...)`.
4. Keep `recordOrchestratorAnimationFallback` in the provider because it is debug/status reporting.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @vizij/runtime-react exec vitest --run src/__tests__/hostAnimationFallback.test.ts src/__tests__/runtimeProviderExecutionLoop.test.tsx
pnpm --filter @vizij/runtime-react typecheck
```

Expected: all pass. Existing intentional error logs in `runtimeProviderExecutionLoop.test.tsx` may remain.

- [ ] **Step 6: Commit**

```bash
git add packages/@vizij/runtime-react/src/host/hostAnimationFallback.ts packages/@vizij/runtime-react/src/__tests__/hostAnimationFallback.test.ts packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx packages/@vizij/runtime-react/src/__tests__/runtimeProviderExecutionLoop.test.tsx
git commit -m "Isolate runtime host animation fallback"
```

---

## Task 3: Mark Runtime React Semantic Re-Exports As Compatibility-Only

**Purpose:** Prevent new consumers from treating `@vizij/runtime-react` as the source of semantic helpers.

**Files:**

- Modify: `packages/@vizij/runtime-react/src/index.ts`
- Modify: `packages/@vizij/runtime-react/README.md`
- Modify: `packages/@vizij/runtime-react/src/__tests__/publicApi.test.ts`

- [ ] **Step 1: Update README ownership guidance**

In `packages/@vizij/runtime-react/README.md`, add a short section near the public helper exports:

```md
### Compatibility Re-Exports

`@vizij/runtime-react` may continue to re-export a small set of support helpers for existing callers, but new semantic imports should come from `@vizij/studio-support`.

Use `@vizij/runtime-react` for React runtime hosting: asset loading, playback sessions, backend wiring, and renderer writes. Use `@vizij/studio-support` for migration, canonical asset preparation, graph/animation/pose planning, import/export assembly, and diagnostics.
```

- [ ] **Step 2: Add a compatibility comment to the barrel**

In `packages/@vizij/runtime-react/src/index.ts`, add:

```ts
// Compatibility-only semantic helper re-exports. New callers should import
// these helpers directly from @vizij/studio-support.
```

Place it directly above any exports from `@vizij/studio-support`.

- [ ] **Step 3: Preserve public API tests**

Update `packages/@vizij/runtime-react/src/__tests__/publicApi.test.ts` only if export names change. Do not remove compatibility re-exports in this task.

- [ ] **Step 4: Run focused checks**

Run:

```bash
pnpm --filter @vizij/runtime-react exec vitest --run src/__tests__/publicApi.test.ts
pnpm --filter @vizij/runtime-react typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/@vizij/runtime-react/src/index.ts packages/@vizij/runtime-react/README.md packages/@vizij/runtime-react/src/__tests__/publicApi.test.ts
git commit -m "Document runtime semantic re-exports as compatibility"
```

---

## Task 4: Move Shape Rename Semantic Remapping To Studio Support

**Purpose:** Keep app shape-renaming code focused on applying UI/store updates while support owns the semantic rename plan for standard inputs, bindings, disabled input caches, and persisted auto inputs.

**Files:**

- Create: `packages/@vizij/studio-support/src/utils/shapeInputRename.ts`
- Create: `packages/@vizij/studio-support/src/__tests__/shapeInputRename.test.ts`
- Modify: `packages/@vizij/studio-support/src/index.ts`
- Modify: `apps/vizij-authoring/src/hooks/shapeRenaming.ts`
- Modify: `apps/vizij-authoring/src/hooks/__tests__/shapeRenaming.test.ts`

- [ ] **Step 1: Add a support-owned rename plan test**

Create `packages/@vizij/studio-support/src/__tests__/shapeInputRename.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planShapeInputRename } from "../index";

describe("shape input rename planning", () => {
  it("renames auto and custom standard input paths and remaps binding ids", () => {
    const result = planShapeInputRename({
      shapeId: "shape-mouth",
      oldSlug: "mouth_old",
      newSlug: "mouth_new",
      shapeName: "Mouth New",
      previousName: "Mouth Old",
      autoInputs: [
        [
          "auto-mouth",
          {
            sourceId: "shape-mouth",
            sourcePath: "/mouth_old/smile",
            generatedLabel: "Mouth Old Smile",
            metadata: {
              elementId: "shape-mouth",
              elementName: "Mouth Old",
              root: "mouth_old",
            },
            input: {
              id: "old_input",
              path: "/mouth_old/smile",
              label: "Mouth Old Smile",
              group: "Mouth Old",
              defaultValue: 0,
              range: { min: 0, max: 1 },
            },
          },
        ],
      ],
      customInputs: [
        {
          id: "custom_old",
          path: "/mouth_old/custom",
          label: "Mouth Old Custom",
          group: "Mouth Old",
          defaultValue: 0,
          range: { min: 0, max: 1 },
        },
      ],
      disabledInputIds: ["old_input"],
      disabledInputBindingCache: {
        old_input: {
          inputId: "old_input",
          target: { kind: "input", inputId: "old_input" },
          expression: "old_input",
        },
      },
      inputValues: { old_input: 0.5 },
      bindings: {
        old_input: {
          inputId: "old_input",
          target: { kind: "input", inputId: "old_input" },
          expression: "old_input",
        },
      },
      inputBindings: {},
      pendingInputBindingDefinitions: null,
      persistedAutoInputs: [],
      selectedStandardInputRoots: ["mouth_old"],
      selectedStandardInputSubgroups: ["/mouth_old"],
      featureLabelOverrides: { old_input: "Mouth Old Smile" },
    });

    expect(result.inputIdMap.get("old_input")).toBeDefined();
    expect(result.autoInputUpdates[0]?.state.metadata.root).toBe("mouth_new");
    expect(result.customInputs[0]?.path).toContain("mouth_new");
    expect(result.selectedStandardInputRoots).toContain("mouth_new");
  });
});
```

- [ ] **Step 2: Run the support test and confirm it fails**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/shapeInputRename.test.ts
```

Expected: fail because `planShapeInputRename` does not exist.

- [ ] **Step 3: Implement `planShapeInputRename`**

Move the pure calculation currently inside `apps/vizij-authoring/src/hooks/shapeRenaming.ts` into `packages/@vizij/studio-support/src/utils/shapeInputRename.ts`.

The new helper should accept serializable arrays/records instead of React refs and setters, and return:

```ts
export type ShapeInputRenamePlan = {
  inputIdMap: Map<string, string>;
  autoInputUpdates: Array<{ key: string; state: AutoInputStateLike }>;
  customInputs: StandardRigInput[];
  disabledInputIds: string[];
  disabledInputBindingCache: Record<string, RigBindingDefinition>;
  inputValues: StandardInputValues;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  pendingInputBindingDefinitions: Record<string, RigBindingDefinition> | null;
  persistedAutoInputs: Array<[string, PersistedAutoStandardInputLike]>;
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  featureLabelOverrides: Record<string, string>;
};
```

Use structural local types if importing app-only `AutoInputState` or `PersistedAutoStandardInput` would create the wrong dependency direction.

- [ ] **Step 4: Make app hook apply the plan**

In `apps/vizij-authoring/src/hooks/shapeRenaming.ts`, keep:

1. Reading current refs.
2. Calling `planShapeInputRename`.
3. Applying returned values to React setters.
4. Calling `refreshAutoMetadataForShape`.

Remove local path/label/binding remap calculations from the hook.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/shapeInputRename.test.ts
pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/shapeRenaming.test.ts
pnpm --filter @vizij/studio-support typecheck
pnpm --filter vizij-authoring typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/@vizij/studio-support/src/utils/shapeInputRename.ts packages/@vizij/studio-support/src/__tests__/shapeInputRename.test.ts packages/@vizij/studio-support/src/index.ts apps/vizij-authoring/src/hooks/shapeRenaming.ts apps/vizij-authoring/src/hooks/__tests__/shapeRenaming.test.ts
git commit -m "Move shape rename planning to studio support"
```

---

## Task 5: Move Inspector Legacy Binding Migration Planning To Studio Support

**Purpose:** Make `InspectorContent.tsx` render and apply a support-produced migration plan instead of building migration metadata patches inline.

**Files:**

- Modify: `packages/@vizij/studio-support/src/utils/pipelineStages.ts`
- Modify: `packages/@vizij/studio-support/src/__tests__/pipelineStages.test.ts`
- Modify: `packages/@vizij/studio-support/src/index.ts`
- Modify: `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- Modify: `apps/vizij-authoring/src/components/inspector/VariablePipelineStages.test.tsx`

- [ ] **Step 1: Add support test for the full migration patch**

Add to `packages/@vizij/studio-support/src/__tests__/pipelineStages.test.ts`:

```ts
import { planLegacyBindingPipelineMigration } from "../index";

it("plans legacy self-parent binding migration metadata", () => {
  const binding = createBinding({
    expression: "self + parent * 0.5",
    inputId: "child",
  });

  expect(
    planLegacyBindingPipelineMigration({
      binding,
      childInputId: "child",
      defaultOffset: 0.25,
      resolveInputId: (rawInputId) => rawInputId,
    }),
  ).toEqual({
    canMigrate: true,
    patch: expect.objectContaining({
      directInputEnabled: true,
      overrideEnabled: false,
      overrideValue: 0.25,
      clampEnabled: true,
      migrationStatus: "migrated",
      migrationSource: "canonical-self-parent",
      migrationExpression: "self + parent * 0.5",
    }),
  });
});
```

- [ ] **Step 2: Run support test and confirm it fails**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/pipelineStages.test.ts
```

Expected: fail because `planLegacyBindingPipelineMigration` does not exist.

- [ ] **Step 3: Implement `planLegacyBindingPipelineMigration`**

Add to `packages/@vizij/studio-support/src/utils/pipelineStages.ts`:

```ts
export function planLegacyBindingPipelineMigration(args: {
  binding: RigBindingDefinition | null | undefined;
  childInputId: string;
  defaultOffset: number;
  resolveInputId: (rawInputId: string) => string | null;
}): {
  canMigrate: boolean;
  patch: Parameters<typeof mergePipelineMetadata>[1] | null;
} {
  const assessment = assessLegacyBindingMigration(args.binding ?? null);
  if (assessment.kind !== "convertible") {
    return { canMigrate: false, patch: null };
  }
  const linkUpserts = buildLegacyMigrationLinkUpserts({
    binding: args.binding,
    childInputId: args.childInputId,
    factorsByInputId: assessment.parentFactorsByInputId ?? {},
    defaultOffset: args.defaultOffset,
    resolveInputId: args.resolveInputId,
  });
  return {
    canMigrate: true,
    patch: {
      directInputEnabled: true,
      overrideEnabled: false,
      overrideValue: args.defaultOffset,
      clampEnabled: true,
      ...(Object.keys(linkUpserts).length > 0 ? { linkUpserts } : {}),
      migrationStatus: "migrated",
      migrationSource: "canonical-self-parent",
      migrationExpression: assessment.expression,
    },
  };
}
```

Export the helper from `packages/@vizij/studio-support/src/index.ts`.

- [ ] **Step 4: Replace inline inspector migration patch construction**

In `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`, change `handleMigrateLegacyBinding` to:

```ts
const migrationPlan = planLegacyBindingPipelineMigration({
  binding: parentBinding,
  childInputId: input.id,
  defaultOffset: input.defaultValue,
  resolveInputId: (rawInputId) =>
    resolveRigMetadataInputId(rawInputId, standardInputsById),
});
if (!migrationPlan.canMigrate || !migrationPlan.patch) {
  return;
}
applyPipelineMetadataPatch(migrationPlan.patch);
stageRuntimeGraphPathValue(overrideEnabledPath, 0);
stageRuntimeGraphPathValue(overrideValuePath, input.defaultValue);
setRigLifecycleMessage({
  tone: "info",
  text: "Legacy canonical self+parent binding migrated to staged pipeline metadata.",
});
```

Remove direct `buildLegacyMigrationLinkUpserts` usage from `InspectorContent.tsx` if no other code path needs it.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/pipelineStages.test.ts
pnpm --filter vizij-authoring exec vitest --run src/components/inspector/VariablePipelineStages.test.tsx src/components/inspector/InspectorPanel.test.tsx
pnpm --filter @vizij/studio-support typecheck
pnpm --filter vizij-authoring typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/@vizij/studio-support/src/utils/pipelineStages.ts packages/@vizij/studio-support/src/__tests__/pipelineStages.test.ts packages/@vizij/studio-support/src/index.ts apps/vizij-authoring/src/components/inspector/InspectorContent.tsx apps/vizij-authoring/src/components/inspector/VariablePipelineStages.test.tsx
git commit -m "Move legacy binding migration planning to studio support"
```

---

## Task 6: Move Imported Bundle Target Derivation To Studio Support

**Purpose:** Reduce `App.tsx` imported bundle animation/program target logic to UI state, selection, and override application.

**Files:**

- Create: `packages/@vizij/studio-support/src/utils/importedBundleTargets.ts`
- Create: `packages/@vizij/studio-support/src/__tests__/importedBundleTargets.test.ts`
- Modify: `packages/@vizij/studio-support/src/index.ts`
- Modify: `apps/vizij-authoring/src/App.tsx`
- Modify: `apps/vizij-authoring/src/state/__tests__/animationStore.test.ts`
- Modify: `apps/vizij-authoring/src/components/app/Viewer.test.tsx`

- [ ] **Step 1: Add support test for imported target derivation**

Create `packages/@vizij/studio-support/src/__tests__/importedBundleTargets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildImportedBundleAnimationTargets,
  buildImportedBundleProgramTargets,
} from "../index";

describe("imported bundle target derivation", () => {
  it("derives stable imported animation target ids and labels", () => {
    expect(
      buildImportedBundleAnimationTargets({
        bundleSessionKey: "face-1",
        animations: [
          {
            id: "bundle.anim.1",
            clip: { id: "clip-1", name: "Blink", duration: 1, tracks: [] },
          },
        ],
        nameOverrides: {},
      }),
    ).toEqual([
      expect.objectContaining({
        value: "bundle-animation:face-1:0",
        label: "Blink",
      }),
    ]);
  });

  it("derives stable imported motiongraph program target ids and labels", () => {
    expect(
      buildImportedBundleProgramTargets({
        bundleSessionKey: "face-1",
        graphs: [
          {
            id: "graph-1",
            kind: "motiongraph",
            label: "Live",
            spec: { nodes: [], edges: [] },
          },
        ],
        nameOverrides: {},
      }),
    ).toEqual([
      expect.objectContaining({
        value: "bundle-procedural:face-1:0",
        label: "Live",
      }),
    ]);
  });
});
```

- [ ] **Step 2: Run support test and confirm it fails**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/importedBundleTargets.test.ts
```

Expected: fail because helpers do not exist.

- [ ] **Step 3: Implement support helpers**

Create `packages/@vizij/studio-support/src/utils/importedBundleTargets.ts` with:

```ts
export const BUNDLE_ANIMATION_TARGET_PREFIX = "bundle-animation:";
export const BUNDLE_PROCEDURAL_TARGET_PREFIX = "bundle-procedural:";

export function bundleTargetValue(
  prefix: string,
  bundleSessionKey: string,
  index: number,
): string {
  return `${prefix}${bundleSessionKey}:${index}`;
}
```

Move the pure target derivation from `apps/vizij-authoring/src/App.tsx` into exported helpers:

1. `buildImportedBundleAnimationTargets`.
2. `buildImportedBundleProgramTargets`.
3. `resolveImportedBundleAnimationClip`.
4. `resolveImportedBundleProgramSnapshot`.

Keep React state for overrides in `App.tsx`; pass override records into support helpers.

- [ ] **Step 4: Replace target derivation in `App.tsx`**

In `apps/vizij-authoring/src/App.tsx`:

1. Import target prefixes and helper functions from `@vizij/studio-support`.
2. Remove local `BUNDLE_ANIMATION_TARGET_PREFIX`, `BUNDLE_PROCEDURAL_TARGET_PREFIX`, and `bundleTargetValue`.
3. Replace local target `useMemo` calculations with calls to support helpers.
4. Keep selection, duplicate, delete, rename, panel visibility, and local override state in `App.tsx`.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/importedBundleTargets.test.ts src/__tests__/animationClipCompiler.test.ts
pnpm --filter vizij-authoring exec vitest --run src/state/__tests__/animationStore.test.ts src/components/app/Viewer.test.tsx src/hooks/__tests__/useAnimationTransport.test.tsx
pnpm --filter @vizij/studio-support typecheck
pnpm --filter vizij-authoring typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/@vizij/studio-support/src/utils/importedBundleTargets.ts packages/@vizij/studio-support/src/__tests__/importedBundleTargets.test.ts packages/@vizij/studio-support/src/index.ts apps/vizij-authoring/src/App.tsx apps/vizij-authoring/src/state/__tests__/animationStore.test.ts apps/vizij-authoring/src/components/app/Viewer.test.tsx
git commit -m "Move imported bundle target derivation to studio support"
```

---

## Task 7: Move Debug Bundle Graph Repair Planning To Studio Support

**Purpose:** Keep debug/audit panels as UI surfaces while support owns bundle graph repair planning.

**Files:**

- Modify: `packages/@vizij/studio-support/src/utils/graphImport.ts`
- Modify: `packages/@vizij/studio-support/src/__tests__/graphImport.test.ts`
- Modify: `packages/@vizij/studio-support/src/index.ts`
- Modify: `apps/vizij-authoring/src/components/panels/DebugPanel.tsx`

- [ ] **Step 1: Add support test for replacing a bundle graph spec**

Add to `packages/@vizij/studio-support/src/__tests__/graphImport.test.ts`:

```ts
import { planBundleGraphSpecReplacement } from "../index";

it("plans replacement of one bundled graph spec while preserving other graphs", () => {
  const bundle = {
    version: 1,
    graphs: [
      { id: "rig", kind: "rig", spec: { nodes: [], edges: [] } },
      { id: "program", kind: "motiongraph", spec: { nodes: [], edges: [] } },
    ],
  };
  const compiledSpec = { nodes: [{ id: "compiled" }], edges: [] };

  expect(
    planBundleGraphSpecReplacement({
      bundle,
      graphId: "rig",
      spec: compiledSpec,
      metadataPatch: { repairedFromAudit: true },
    }),
  ).toEqual({
    ok: true,
    bundle: {
      version: 1,
      graphs: [
        {
          id: "rig",
          kind: "rig",
          spec: compiledSpec,
          metadata: { repairedFromAudit: true },
        },
        { id: "program", kind: "motiongraph", spec: { nodes: [], edges: [] } },
      ],
    },
  });
});
```

- [ ] **Step 2: Run support test and confirm it fails**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/graphImport.test.ts
```

Expected: fail because `planBundleGraphSpecReplacement` does not exist.

- [ ] **Step 3: Implement `planBundleGraphSpecReplacement`**

Add the helper to `packages/@vizij/studio-support/src/utils/graphImport.ts`:

```ts
export function planBundleGraphSpecReplacement(args: {
  bundle: VizijBundleExtension | null | undefined;
  graphId: string;
  spec: Record<string, unknown>;
  metadataPatch?: Record<string, unknown>;
}):
  | { ok: true; bundle: VizijBundleExtension }
  | {
      ok: false;
      error: "missing-bundle" | "missing-graphs" | "missing-graph";
    } {
  if (!args.bundle) {
    return { ok: false, error: "missing-bundle" };
  }
  if (!args.bundle.graphs?.length) {
    return { ok: false, error: "missing-graphs" };
  }
  let replaced = false;
  const graphs = args.bundle.graphs.map((graph) => {
    if (graph.id !== args.graphId) {
      return graph;
    }
    replaced = true;
    return {
      ...graph,
      spec: args.spec,
      metadata: {
        ...(graph.metadata ?? {}),
        ...(args.metadataPatch ?? {}),
      },
    };
  });
  if (!replaced) {
    return { ok: false, error: "missing-graph" };
  }
  return {
    ok: true,
    bundle: {
      ...args.bundle,
      graphs,
    },
  };
}
```

Export the helper from `packages/@vizij/studio-support/src/index.ts`.

- [ ] **Step 4: Replace inline DebugPanel graph replacement**

In `apps/vizij-authoring/src/components/panels/DebugPanel.tsx`, replace manual `loadedBundle.graphs.map(...)` replacement with `planBundleGraphSpecReplacement(...)`. Keep UI alerts and `updateBundle(result.bundle)` in the panel.

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @vizij/studio-support exec vitest --run src/__tests__/graphImport.test.ts
pnpm --filter vizij-authoring exec vitest --run src/components/panels/VariablesPanel.test.tsx src/components/app/Viewer.test.tsx
pnpm --filter @vizij/studio-support typecheck
pnpm --filter vizij-authoring typecheck
```

Expected: support tests, panel-adjacent tests, viewer integration tests, and typechecks pass.

- [ ] **Step 6: Commit**

```bash
git add packages/@vizij/studio-support/src/utils/graphImport.ts packages/@vizij/studio-support/src/__tests__/graphImport.test.ts packages/@vizij/studio-support/src/index.ts apps/vizij-authoring/src/components/panels/DebugPanel.tsx
git commit -m "Move debug graph repair planning to studio support"
```

---

## Final Closeout Pass

- [ ] **Step 1: Run the full verification gate**

Run:

```bash
pnpm --filter @vizij/studio-support typecheck
pnpm --filter @vizij/studio-support test
pnpm --filter @vizij/runtime-react typecheck
pnpm --filter @vizij/runtime-react test
pnpm --filter vizij-authoring typecheck
pnpm --filter vizij-authoring test
pnpm --filter vizij-authoring test:e2e:arora
pnpm --filter vizij-authoring test:e2e:smoke
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Run ownership searches**

Run:

```bash
rg -n "pose/control|POSE_CONTROL_BRIDGE_EPSILON|maybeBridgePoseControlInput" packages/@vizij/runtime-react/src
rg -n "buildLegacyMigrationLinkUpserts|migrationStatus: \"migrated\"|canonical-self-parent" apps/vizij-authoring/src/components/inspector/InspectorContent.tsx
rg -n "BUNDLE_ANIMATION_TARGET_PREFIX|BUNDLE_PROCEDURAL_TARGET_PREFIX|bundleTargetValue" apps/vizij-authoring/src/App.tsx
```

Expected:

1. Runtime search should not find runtime-local pose-control bridge planning. Mentions in tests or support imports should be inspected and justified.
2. Inspector search should not find inline migration patch construction. UI text mentioning migrated state is acceptable.
3. App search should not find local target-prefix constants or local target-value construction.

- [ ] **Step 3: Update the main migration plan status**

Modify `apps/vizij-authoring/docs/plans/RUNTIME_AUTHORING_ARORA_MIGRATION_PLAN_2026-05-30.md` with a short dated closeout note:

```md
The runtime-react/studio-support thinning closeout is complete as of 2026-05-31. Remaining semantic bridge items were moved into `@vizij/studio-support`, leaving runtime React with host effects and authoring with UI workflow/application of support-owned plans.
```

- [ ] **Step 4: Commit final closeout docs**

```bash
git add apps/vizij-authoring/docs/plans/RUNTIME_AUTHORING_ARORA_MIGRATION_PLAN_2026-05-30.md apps/vizij-authoring/docs/plans/RUNTIME_REACT_STUDIO_SUPPORT_THINNING_CLOSEOUT_PLAN_2026-05-31.md
git commit -m "Document runtime thinning closeout completion"
```

## Follow-Up After This Plan

After this plan, the remaining work should move out of cleanup mode and into product/architecture progression:

1. Add lower-level Arora module fixture tests for `vizij-animation` and `vizij-node-graph`.
2. Profile compile/update paths before moving additional JavaScript helpers to Rust/Wasm.
3. Decide whether behavior-tree orchestration should replace or compose with the current orchestrator module.
4. Improve the authoring UX on top of the now-cleaner Studio-support contract.
