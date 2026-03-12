import { describe, expect, it } from "vitest";
import {
  applyRuntimeGraphBundle,
  resolveRuntimeUpdatePlan,
} from "../updatePolicy";

const base = {
  namespace: "test",
  glb: { kind: "world", world: {}, animatables: {}, bundle: null },
  rig: { id: "rig", spec: { nodes: [] } },
  pose: undefined,
  bundle: null,
};

describe("resolveRuntimeUpdatePlan", () => {
  it("flags graph changes without asset reload", () => {
    const next = {
      ...base,
      rig: { id: "rig", spec: { nodes: [{ id: "a", type: "input" }] } },
    };
    const plan = resolveRuntimeUpdatePlan(base as any, next as any, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });
});

describe("applyRuntimeGraphBundle", () => {
  it("preserves existing rig/pose while applying animation override", () => {
    const baseBundle = {
      ...base,
      pose: {
        graph: { id: "pose", spec: { nodes: [{ id: "pose", type: "input" }] } },
        config: { faceId: "hugo" },
      },
      animations: [{ id: "imported", clip: { tracks: [] } }],
    } as any;

    const next = applyRuntimeGraphBundle(baseBundle, {
      animations: [{ id: "authoring.timeline.main", clip: { tracks: [] } }],
    });

    expect(next.rig).toEqual(baseBundle.rig);
    expect(next.pose).toEqual(baseBundle.pose);
    expect(next.animations).toEqual([
      { id: "authoring.timeline.main", clip: { tracks: [] } },
    ]);
  });

  it("applies partial overrides against the latest bundle state", () => {
    const baseBundle = {
      ...base,
      rig: { id: "rig-v1", spec: { nodes: [{ id: "rig-1", type: "input" }] } },
      animations: [{ id: "a", clip: { tracks: [] } }],
    } as any;
    const withAnimations = applyRuntimeGraphBundle(baseBundle, {
      animations: [{ id: "b", clip: { tracks: [] } }],
    });
    const withRig = applyRuntimeGraphBundle(withAnimations, {
      rig: { id: "rig-v2", spec: { nodes: [{ id: "rig-2", type: "input" }] } },
    });

    expect(withRig.animations).toEqual([{ id: "b", clip: { tracks: [] } }]);
    expect(withRig.rig).toEqual({
      id: "rig-v2",
      spec: { nodes: [{ id: "rig-2", type: "input" }] },
    });
  });

  it("preserves programs while applying rig overrides", () => {
    const baseBundle = {
      ...base,
      programs: [
        {
          id: "wave",
          label: "Wave",
          graph: {
            id: "wave",
            spec: { nodes: [{ id: "out", type: "output" }], edges: [] },
          },
        },
      ],
    } as any;

    const next = applyRuntimeGraphBundle(baseBundle, {
      rig: { id: "rig-v2", spec: { nodes: [{ id: "rig-2", type: "input" }] } },
    });

    expect(next.programs).toEqual(baseBundle.programs);
  });

  it("applies program overrides independently from animations", () => {
    const baseBundle = {
      ...base,
      animations: [{ id: "a", clip: { tracks: [] } }],
      programs: [
        {
          id: "wave",
          graph: { id: "wave", spec: { nodes: [], edges: [] } },
        },
      ],
    } as any;

    const next = applyRuntimeGraphBundle(baseBundle, {
      programs: [
        {
          id: "blink",
          graph: { id: "blink", spec: { nodes: [{ id: "x" }], edges: [] } },
        },
      ],
    });

    expect(next.animations).toEqual(baseBundle.animations);
    expect(next.programs).toEqual([
      {
        id: "blink",
        graph: { id: "blink", spec: { nodes: [{ id: "x" }], edges: [] } },
      },
    ]);
  });
});
