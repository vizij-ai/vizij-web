import { describe, expect, it } from "vitest";
import {
  resolveRuntimeUpdatePlan,
  resolveRuntimeUpdatePlanFromMutationClass,
} from "../updatePolicy";
import type { VizijAssetBundle } from "../types";

const baseWorld = { id: "root", children: [] };
const baseAnimatables = {};

function makeBundle(overrides?: Partial<VizijAssetBundle>): VizijAssetBundle {
  return {
    namespace: "vizij",
    glb: {
      kind: "world",
      world: baseWorld,
      animatables: baseAnimatables,
      bundle: null,
    },
    rig: {
      id: "rig",
      spec: { nodes: [], edges: [] },
    },
    pose: {
      graph: { id: "pose", spec: { nodes: [], edges: [] } },
    },
    ...overrides,
  };
}

describe("resolveRuntimeUpdatePlan", () => {
  it("reloads assets on first load in auto mode", () => {
    const next = makeBundle();
    const plan = resolveRuntimeUpdatePlan(null, next, "auto");
    expect(plan.reloadAssets).toBe(true);
    expect(plan.reregisterGraphs).toBe(false);
  });

  it("reregisters graphs when only rig spec changes", () => {
    const prev = makeBundle();
    const next = makeBundle({
      rig: {
        id: "rig",
        spec: { nodes: [{ id: "n1", kind: "input" }], edges: [] },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "auto");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });

  it("reloads assets when glb changes", () => {
    const prev = makeBundle();
    const next = makeBundle({
      glb: {
        kind: "url",
        src: "/next.glb",
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "auto");
    expect(plan.reloadAssets).toBe(true);
  });

  it("always reloads assets in assets mode", () => {
    const prev = makeBundle();
    const next = makeBundle({
      rig: {
        id: "rig",
        spec: { nodes: [{ id: "n1", kind: "input" }], edges: [] },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "assets");
    expect(plan.reloadAssets).toBe(true);
  });

  it("treats graph changes as graph updates in graphs mode", () => {
    const prev = makeBundle();
    const next = makeBundle({
      pose: {
        graph: {
          id: "pose",
          spec: { nodes: [{ id: "pose", kind: "input" }], edges: [] },
        },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });

  it("does not re-register when only pose config changes in graphs mode", () => {
    const rigSpec = { nodes: [], edges: [] };
    const poseSpec = { nodes: [], edges: [] };
    const prev = makeBundle({
      rig: { id: "rig", spec: rigSpec },
      pose: {
        graph: { id: "pose", spec: poseSpec },
        config: { version: 1, neutralInputs: {}, poses: [] },
      },
    });
    const next = makeBundle({
      rig: { id: "rig", spec: rigSpec },
      pose: {
        graph: { id: "pose", spec: poseSpec },
        config: {
          version: 1,
          neutralInputs: { "/standard/mouth/x": 0.25 },
          poses: [],
        },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(false);
  });

  it("does not re-register when only pose config changes in auto mode", () => {
    const rigSpec = { nodes: [], edges: [] };
    const poseSpec = { nodes: [], edges: [] };
    const prev = makeBundle({
      rig: { id: "rig", spec: rigSpec },
      pose: {
        graph: { id: "pose", spec: poseSpec },
        config: { version: 1, neutralInputs: {}, poses: [] },
      },
    });
    const next = makeBundle({
      rig: { id: "rig", spec: rigSpec },
      pose: {
        graph: { id: "pose", spec: poseSpec },
        config: {
          version: 1,
          neutralInputs: {},
          poses: [{ id: "smile", values: { "/standard/mouth/x": 0.5 } }],
        },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "auto");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(false);
  });

  it("does not re-register when rig spec reference changes but structure matches", () => {
    const spec = { nodes: [{ id: "n1", kind: "input" }], edges: [] };
    const prev = makeBundle({
      rig: { id: "rig", spec },
    });
    const next = makeBundle({
      rig: {
        id: "rig",
        spec: { nodes: [{ id: "n1", kind: "input" }], edges: [] },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(false);
  });

  it("does not re-register when pose graph spec reference changes but structure matches", () => {
    const poseSpec = { nodes: [{ id: "pose-1", kind: "input" }], edges: [] };
    const prev = makeBundle({
      pose: {
        graph: { id: "pose", spec: poseSpec },
      },
    });
    const next = makeBundle({
      pose: {
        graph: {
          id: "pose",
          spec: { nodes: [{ id: "pose-1", kind: "input" }], edges: [] },
        },
      },
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(false);
  });

  it("treats rig removal as graph re-registration in graphs mode", () => {
    const prev = makeBundle();
    const next = makeBundle({
      rig: undefined,
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });

  it("treats pose removal as graph re-registration in graphs mode", () => {
    const prev = makeBundle();
    const next = makeBundle({
      pose: undefined,
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });
});

describe("resolveRuntimeUpdatePlanFromMutationClass", () => {
  it("trusts topology mutation intent for graph-tier updates", () => {
    const plan = resolveRuntimeUpdatePlanFromMutationClass(
      "topology",
      "graphs",
    );
    expect(plan).toEqual({ reloadAssets: false, reregisterGraphs: true });
  });

  it("forces asset reload for assets-tier intent", () => {
    const plan = resolveRuntimeUpdatePlanFromMutationClass("pose", "assets");
    expect(plan).toEqual({ reloadAssets: true, reregisterGraphs: false });
  });
});
