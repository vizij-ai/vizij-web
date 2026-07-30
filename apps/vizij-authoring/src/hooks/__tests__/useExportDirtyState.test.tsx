import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnimatableValue, StandardRigInput } from "@vizij/utils";
import {
  buildGlbExportDirtySnapshot,
  useExportDirtyState,
  type GlbExportDirtySnapshotOptions,
} from "../useExportDirtyState";

const ANIMATABLE: AnimatableValue = {
  id: "rig/face/mouth/pos/y",
  type: "number",
  name: "Mouth Pos Y",
  default: 0,
  constraints: {
    min: -1,
    max: 1,
  },
  pub: {
    public: true,
    output: "Mouth Pos Y",
  },
};

const INPUT: StandardRigInput = {
  id: "input_a",
  path: "/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

function createSnapshotOptions(
  overrides: Partial<GlbExportDirtySnapshotOptions> = {},
): GlbExportDirtySnapshotOptions {
  return {
    faceId: "face",
    includeVizijBundle: true,
    includeImportedAnimations: false,
    animatables: {
      [ANIMATABLE.id]: ANIMATABLE,
    },
    animatableComponents: [
      {
        id: "component_1",
        safeId: "component_1",
        animatableId: ANIMATABLE.id,
        animatableType: "number",
        label: "Mouth Pos Y",
        defaultValue: 0,
        range: {
          min: -1,
          max: 1,
        },
      },
    ],
    featureLabelOverrides: {},
    standardInputs: [INPUT],
    bindings: {
      [ANIMATABLE.id]: {
        inputId: INPUT.id,
        expression: "a",
        slots: [{ id: "slot_a", inputId: INPUT.id, alias: "a" }],
      },
    } as never,
    inputBindings: {} as never,
    pipelineMetadataV1: null,
    poseGraphSpec: null,
    poseGraphFileName: "pose_graph.json",
    poseConfigDraft: null,
    poseIrDraft: null,
    blendMode: "average",
    crossGroupBlendMode: "additive",
    authoredAnimationClips: [],
    authoredMotionGraphs: [],
    carriedGraphs: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildGlbExportDirtySnapshot", () => {
  it("ignores bundle-only authoring fields when bundle export is disabled", () => {
    const base = createSnapshotOptions({ includeVizijBundle: false });
    const first = buildGlbExportDirtySnapshot(base);
    const second = buildGlbExportDirtySnapshot({
      ...base,
      bindings: {} as never,
      inputBindings: {
        [INPUT.id]: {
          inputId: INPUT.id,
          expression: "source",
          slots: [{ id: "slot_b", inputId: INPUT.id, alias: "source" }],
        },
      } as never,
      pipelineMetadataV1: {
        byInputId: {
          [INPUT.id]: {
            directInput: {
              enabled: false,
            },
          },
        },
      } as never,
      poseGraphSpec: { nodes: [{ id: "pose_record_1" }], edges: [] } as never,
      authoredAnimationClips: [
        {
          id: "clip",
          name: "Clip",
          duration: 1,
          tracks: [],
          schemaVersion: 1,
        },
      ],
      authoredMotionGraphs: [
        {
          id: "graph",
          label: "Graph",
          spec: { nodes: [{ id: "n1" }], edges: [] },
        },
      ],
    });

    expect(first).toEqual(second);
  });

  it("tracks non-bundle animatable changes even when bundle export is disabled", () => {
    const base = createSnapshotOptions({ includeVizijBundle: false });
    const first = buildGlbExportDirtySnapshot(base);
    const second = buildGlbExportDirtySnapshot({
      ...base,
      animatables: {
        [ANIMATABLE.id]: {
          ...ANIMATABLE,
          default: 0.4,
        },
      },
    });

    expect(first).not.toEqual(second);
  });
});

describe("useExportDirtyState", () => {
  it("marks dirty after the snapshot changes and clears after save", () => {
    const hook = renderHook(
      ({
        sessionKey,
        ready,
        snapshot,
      }: {
        sessionKey: string;
        ready: boolean;
        snapshot: unknown;
      }) => useExportDirtyState({ sessionKey, ready, snapshot }),
      {
        initialProps: {
          sessionKey: "session-1",
          ready: true,
          snapshot: { revision: 1 },
        },
      },
    );

    expect(hook.result.current.isDirty).toBe(false);

    hook.rerender({
      sessionKey: "session-1",
      ready: true,
      snapshot: { revision: 2 },
    });

    expect(hook.result.current.isDirty).toBe(true);

    act(() => {
      hook.result.current.markSaved();
    });

    expect(hook.result.current.isDirty).toBe(false);
  });

  it("resets the dirty baseline when a new session becomes ready", () => {
    const hook = renderHook(
      ({
        sessionKey,
        ready,
        snapshot,
      }: {
        sessionKey: string;
        ready: boolean;
        snapshot: unknown;
      }) => useExportDirtyState({ sessionKey, ready, snapshot }),
      {
        initialProps: {
          sessionKey: "session-1",
          ready: true,
          snapshot: { revision: 1 },
        },
      },
    );

    hook.rerender({
      sessionKey: "session-1",
      ready: true,
      snapshot: { revision: 2 },
    });
    expect(hook.result.current.isDirty).toBe(true);

    hook.rerender({
      sessionKey: "session-2",
      ready: false,
      snapshot: { revision: 10 },
    });
    expect(hook.result.current.isDirty).toBe(false);

    hook.rerender({
      sessionKey: "session-2",
      ready: true,
      snapshot: { revision: 10 },
    });
    expect(hook.result.current.isDirty).toBe(false);
  });

  it("waits for readiness before capturing the baseline snapshot", () => {
    const hook = renderHook(
      ({
        sessionKey,
        ready,
        snapshot,
      }: {
        sessionKey: string;
        ready: boolean;
        snapshot: unknown;
      }) => useExportDirtyState({ sessionKey, ready, snapshot }),
      {
        initialProps: {
          sessionKey: "session-1",
          ready: false,
          snapshot: { revision: 1 },
        },
      },
    );

    hook.rerender({
      sessionKey: "session-1",
      ready: false,
      snapshot: { revision: 2 },
    });
    expect(hook.result.current.isDirty).toBe(false);

    hook.rerender({
      sessionKey: "session-1",
      ready: true,
      snapshot: { revision: 2 },
    });
    expect(hook.result.current.isDirty).toBe(false);

    hook.rerender({
      sessionKey: "session-1",
      ready: true,
      snapshot: { revision: 3 },
    });
    expect(hook.result.current.isDirty).toBe(true);
  });

  it("registers a native beforeunload warning only while dirty", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const hook = renderHook(
      ({
        sessionKey,
        ready,
        snapshot,
      }: {
        sessionKey: string;
        ready: boolean;
        snapshot: unknown;
      }) => useExportDirtyState({ sessionKey, ready, snapshot }),
      {
        initialProps: {
          sessionKey: "session-1",
          ready: true,
          snapshot: { revision: 1 },
        },
      },
    );

    hook.rerender({
      sessionKey: "session-1",
      ready: true,
      snapshot: { revision: 2 },
    });

    const beforeUnloadCall = addSpy.mock.calls.find(
      ([eventName]) => eventName === "beforeunload",
    );
    expect(beforeUnloadCall).toBeDefined();

    const handler = beforeUnloadCall?.[1] as (event: BeforeUnloadEvent) => void;
    const event = new Event("beforeunload", {
      cancelable: true,
    }) as BeforeUnloadEvent;
    Object.defineProperty(event, "returnValue", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    handler(event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.returnValue).toBe("");

    hook.unmount();

    expect(removeSpy).toHaveBeenCalledWith("beforeunload", handler);
  });
});
