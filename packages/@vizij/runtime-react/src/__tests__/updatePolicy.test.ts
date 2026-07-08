import { describe, expect, it } from "vitest";
import { resolveRuntimeUpdatePlan } from "../updatePolicy";
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

  it("treats animation payload changes as graph re-registration in graphs mode", () => {
    const prev = makeBundle({
      animations: [
        {
          id: "authoring.timeline.main",
          clip: {
            id: "authoring.timeline.main",
            duration: 1,
            tracks: [
              {
                channel: "controls/jaw/open",
                keyframes: [
                  { time: 0, value: 0 },
                  { time: 1, value: 1 },
                ],
              },
            ],
          },
        },
      ],
    });
    const next = makeBundle({
      animations: [
        {
          id: "authoring.timeline.main",
          clip: {
            id: "authoring.timeline.main",
            duration: 2,
            tracks: [
              {
                channel: "controls/jaw/open",
                keyframes: [
                  { time: 0, value: 0 },
                  { time: 2, value: 1 },
                ],
              },
            ],
          },
        },
      ],
    });
    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });

  it("treats program payload changes as graph re-registration in graphs mode", () => {
    const prev = makeBundle({
      programs: [
        {
          id: "wave",
          label: "Wave",
          graph: {
            id: "wave",
            spec: { nodes: [{ id: "out-a", kind: "output" }], edges: [] },
          },
        },
      ],
    });
    const next = makeBundle({
      programs: [
        {
          id: "wave",
          label: "Wave",
          graph: {
            id: "wave",
            spec: {
              nodes: [
                { id: "out-a", kind: "output" },
                { id: "out-b", kind: "output" },
              ],
              edges: [],
            },
          },
        },
      ],
    });

    const plan = resolveRuntimeUpdatePlan(prev, next, "graphs");
    expect(plan.reloadAssets).toBe(false);
    expect(plan.reregisterGraphs).toBe(true);
  });
});
