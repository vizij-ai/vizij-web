import { describe, expect, it } from "vitest";
import { resolveRuntimeUpdatePlan } from "../updatePolicy";

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
