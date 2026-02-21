import { describe, expect, it } from "vitest";
import {
  createRuntimeGraphMutation,
  resolveRuntimeGraphMutationClass,
} from "./runtimeGraphMutation";

describe("resolveRuntimeGraphMutationClass", () => {
  it("returns topology on first publish", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(null, {
      graphSpecRevision: 0,
      poseRuntimeRevision: 0,
      poseGraphSpecRevision: 0,
    });

    expect(mutationClass).toBe("topology");
  });

  it("returns topology when graph revision changes", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
      {
        graphSpecRevision: 3,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
    );

    expect(mutationClass).toBe("topology");
  });

  it("returns topology when graph and pose revisions both change", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
      {
        graphSpecRevision: 3,
        poseRuntimeRevision: 6,
        poseGraphSpecRevision: 4,
      },
    );

    expect(mutationClass).toBe("topology");
  });

  it("returns pose when only pose revision changes", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 6,
        poseGraphSpecRevision: 3,
      },
    );

    expect(mutationClass).toBe("pose");
  });

  it("returns topology when pose graph revision changes", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 6,
        poseGraphSpecRevision: 4,
      },
    );

    expect(mutationClass).toBe("topology");
  });

  it("returns null when revisions are unchanged", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
      },
    );

    expect(mutationClass).toBeNull();
  });
});

describe("createRuntimeGraphMutation", () => {
  it("builds a topology payload with rig graph", () => {
    const graphSpec = { nodes: [{ id: "rig-1" }] } as any;

    const mutation = createRuntimeGraphMutation(
      {
        graphSpec,
        poseGraphSpec: null,
        poseConfig: null,
      },
      "topology",
    );

    expect(mutation).toEqual({
      mutationClass: "topology",
      bundle: {
        rig: { id: "rig", spec: graphSpec },
        pose: {
          graph: undefined,
          config: undefined,
        },
      },
      options: { tier: "graphs" },
    });
  });

  it("builds a pose payload when rig graph is absent", () => {
    const poseGraphSpec = { nodes: [{ id: "pose-1" }] } as any;
    const poseConfig = { version: 1, neutralInputs: {}, poses: [] } as any;

    const mutation = createRuntimeGraphMutation(
      {
        graphSpec: undefined,
        poseGraphSpec,
        poseConfig,
      },
      "pose",
    );

    expect(mutation).toEqual({
      mutationClass: "pose",
      bundle: {
        rig: undefined,
        pose: {
          graph: { id: "pose", spec: poseGraphSpec },
          config: poseConfig,
        },
      },
      options: { tier: "graphs" },
    });
  });
});
