import { describe, expect, it } from "vitest";
import { createRuntimeGraphMutation } from "./runtimeGraphMutation";

describe("createRuntimeGraphMutation", () => {
  it("classifies rig spec changes as topology mutations", () => {
    const previous = {
      graphSpec: { nodes: [] } as any,
      poseGraphSpec: null,
      poseConfig: null,
    };
    const next = {
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: null,
      poseConfig: null,
    };

    const mutation = createRuntimeGraphMutation(previous, next);

    expect(mutation?.mutationClass).toBe("topology");
    expect(mutation?.options).toEqual({ tier: "graphs" });
    expect(mutation?.bundle).toEqual({
      rig: { id: "rig", spec: next.graphSpec },
      pose: {
        graph: undefined,
        config: undefined,
      },
    });
  });

  it("classifies pose-only changes as pose mutations", () => {
    const previous = {
      graphSpec: { nodes: [] } as any,
      poseGraphSpec: { nodes: [] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    };
    const next = {
      graphSpec: previous.graphSpec,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: previous.poseConfig,
    };

    const mutation = createRuntimeGraphMutation(previous, next);

    expect(mutation?.mutationClass).toBe("pose");
    expect(mutation?.bundle).toEqual({
      rig: { id: "rig", spec: previous.graphSpec },
      pose: {
        graph: { id: "pose", spec: next.poseGraphSpec },
        config: previous.poseConfig,
      },
    });
  });

  it("returns null when nothing changed", () => {
    const graphSpec = { nodes: [] } as any;
    const poseGraphSpec = { nodes: [] } as any;
    const poseConfig = { version: 1, neutralInputs: {}, poses: [] } as any;
    const previous = { graphSpec, poseGraphSpec, poseConfig };
    const next = { graphSpec, poseGraphSpec, poseConfig };

    const mutation = createRuntimeGraphMutation(previous, next);

    expect(mutation).toBeNull();
  });

  it("includes pose payload when only pose graph is present", () => {
    const mutation = createRuntimeGraphMutation(null, {
      graphSpec: undefined,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    expect(mutation?.bundle).toEqual({
      rig: undefined,
      pose: {
        graph: { id: "pose", spec: { nodes: [{ id: "pose-1" }] } },
        config: { version: 1, neutralInputs: {}, poses: [] },
      },
    });
  });
});
