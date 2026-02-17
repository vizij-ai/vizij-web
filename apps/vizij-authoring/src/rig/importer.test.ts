import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { AnimatableComponent } from "@vizij/utils";
import { rehydrateRigDataFromGraph } from "./importer";

describe("rehydrateRigDataFromGraph", () => {
  it("collects legacy /rig/element inputs for migration warnings", () => {
    const spec = {
      metadata: {
        vizij: {
          faceId: "legacy_face",
          inputs: [
            {
              id: "legacy_eye",
              path: "/rig/element/eye/open",
              label: "legacy_eye",
              group: "eyes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
            {
              id: "autorig_eye",
              path: "/autorig/eye/open",
              label: "autorig_eye",
              group: "eyes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
          ],
          bindings: [],
        },
      },
      nodes: [],
      edges: [],
    } as unknown as GraphSpec;

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "legacy_face",
      animatables: {},
      components: [] as AnimatableComponent[],
    });

    expect(result.legacyAutorigInputPaths).toEqual(["/rig/element/eye/open"]);
  });

  it("does not report /autorig inputs as legacy", () => {
    const spec = {
      metadata: {
        vizij: {
          faceId: "legacy_face",
          inputs: [
            {
              id: "autorig_eye",
              path: "/autorig/eye/open",
              label: "autorig_eye",
              group: "eyes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
          ],
          bindings: [],
        },
      },
      nodes: [],
      edges: [],
    } as unknown as GraphSpec;

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "legacy_face",
      animatables: {},
      components: [] as AnimatableComponent[],
    });

    expect(result.legacyAutorigInputPaths).toEqual([]);
  });
});
