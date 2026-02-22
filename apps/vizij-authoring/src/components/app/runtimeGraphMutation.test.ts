import { describe, expect, it } from "vitest";
import {
  createRuntimeGraphMutation,
  resolveRuntimeGraphMutationClass,
  resolveRuntimeGraphMutationDecision,
} from "./runtimeGraphMutation";

describe("resolveRuntimeGraphMutationClass", () => {
  it("returns topology on first publish", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(null, {
      graphSpecRevision: 0,
      poseRuntimeRevision: 0,
      poseGraphSpecRevision: 0,
      graphBridgeForceTopologyRevision: 0,
    });

    expect(mutationClass).toBe("topology");
  });

  it("returns topology when graph revision changes", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpecRevision: 3,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
        graphBridgeForceTopologyRevision: 0,
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
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpecRevision: 3,
        poseRuntimeRevision: 6,
        poseGraphSpecRevision: 4,
        graphBridgeForceTopologyRevision: 0,
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
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 6,
        poseGraphSpecRevision: 3,
        graphBridgeForceTopologyRevision: 0,
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
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 6,
        poseGraphSpecRevision: 4,
        graphBridgeForceTopologyRevision: 0,
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
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
        graphBridgeForceTopologyRevision: 0,
      },
    );

    expect(mutationClass).toBeNull();
  });

  it("returns topology when explicit refresh revision changes", () => {
    const mutationClass = resolveRuntimeGraphMutationClass(
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpecRevision: 2,
        poseRuntimeRevision: 5,
        poseGraphSpecRevision: 3,
        graphBridgeForceTopologyRevision: 1,
      },
    );

    expect(mutationClass).toBe("topology");
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

describe("resolveRuntimeGraphMutationDecision", () => {
  it("skips when revisions are unchanged", () => {
    const revisions = {
      graphSpecRevision: 2,
      poseRuntimeRevision: 5,
      poseGraphSpecRevision: 3,
      graphBridgeForceTopologyRevision: 1,
    };
    const decision = resolveRuntimeGraphMutationDecision(revisions, revisions, {
      graphSpec: { nodes: [{ id: "rig-1" }] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-1" }] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    expect(decision).toEqual({
      kind: "skip",
      reason: "unchanged-revisions",
      revisions,
    });
  });

  it("skips first publish when payload is empty", () => {
    const revisions = {
      graphSpecRevision: 0,
      poseRuntimeRevision: 0,
      poseGraphSpecRevision: 0,
      graphBridgeForceTopologyRevision: 0,
    };
    const decision = resolveRuntimeGraphMutationDecision(null, revisions, {
      graphSpec: null,
      poseGraphSpec: null,
      poseConfig: null,
    });

    expect(decision).toEqual({
      kind: "skip",
      reason: "empty-payload",
      revisions,
    });
  });

  it("publishes topology when payload is emptied after prior publish", () => {
    const previous = {
      graphSpecRevision: 2,
      poseRuntimeRevision: 5,
      poseGraphSpecRevision: 3,
      graphBridgeForceTopologyRevision: 0,
    };
    const next = {
      graphSpecRevision: 3,
      poseRuntimeRevision: 5,
      poseGraphSpecRevision: 3,
      graphBridgeForceTopologyRevision: 0,
    };
    const decision = resolveRuntimeGraphMutationDecision(previous, next, {
      graphSpec: null,
      poseGraphSpec: null,
      poseConfig: null,
    });

    expect(decision).toEqual({
      kind: "publish",
      mutationClass: "topology",
      mutation: {
        mutationClass: "topology",
        bundle: {
          rig: undefined,
          pose: undefined,
        },
        options: { tier: "graphs" },
      },
      revisions: next,
    });
  });

  it("publishes topology when first payload contains rig graph", () => {
    const revisions = {
      graphSpecRevision: 0,
      poseRuntimeRevision: 0,
      poseGraphSpecRevision: 0,
      graphBridgeForceTopologyRevision: 0,
    };
    const graphSpec = { nodes: [{ id: "rig-1" }] } as any;
    const decision = resolveRuntimeGraphMutationDecision(null, revisions, {
      graphSpec,
      poseGraphSpec: null,
      poseConfig: null,
    });

    expect(decision).toEqual({
      kind: "publish",
      mutationClass: "topology",
      mutation: {
        mutationClass: "topology",
        bundle: {
          rig: { id: "rig", spec: graphSpec },
          pose: {
            graph: undefined,
            config: undefined,
          },
        },
        options: { tier: "graphs" },
      },
      revisions,
    });
  });

  it("preserves topology -> topology -> pose ordering", () => {
    const rigSpec = { nodes: [{ id: "rig-1" }] } as any;
    const poseSpec = { nodes: [{ id: "pose-1" }] } as any;
    const poseConfigV1 = { version: 1, neutralInputs: {}, poses: [] } as any;
    const poseConfigV2 = {
      version: 1,
      neutralInputs: {},
      poses: [{ id: "smile", values: { "/standard/mouth/x": 0.3 } }],
    } as any;

    const first = resolveRuntimeGraphMutationDecision(
      null,
      {
        graphSpecRevision: 1,
        poseRuntimeRevision: 0,
        poseGraphSpecRevision: 0,
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpec: rigSpec,
        poseGraphSpec: null,
        poseConfig: null,
      },
    );
    expect(first.kind).toBe("publish");
    if (first.kind !== "publish") {
      return;
    }
    expect(first.mutationClass).toBe("topology");

    const second = resolveRuntimeGraphMutationDecision(
      first.revisions,
      {
        graphSpecRevision: 1,
        poseRuntimeRevision: 1,
        poseGraphSpecRevision: 1,
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpec: rigSpec,
        poseGraphSpec: poseSpec,
        poseConfig: poseConfigV1,
      },
    );
    expect(second.kind).toBe("publish");
    if (second.kind !== "publish") {
      return;
    }
    expect(second.mutationClass).toBe("topology");

    const third = resolveRuntimeGraphMutationDecision(
      second.revisions,
      {
        graphSpecRevision: 1,
        poseRuntimeRevision: 2,
        poseGraphSpecRevision: 1,
        graphBridgeForceTopologyRevision: 0,
      },
      {
        graphSpec: rigSpec,
        poseGraphSpec: poseSpec,
        poseConfig: poseConfigV2,
      },
    );
    expect(third.kind).toBe("publish");
    if (third.kind !== "publish") {
      return;
    }
    expect(third.mutationClass).toBe("pose");
  });
});
