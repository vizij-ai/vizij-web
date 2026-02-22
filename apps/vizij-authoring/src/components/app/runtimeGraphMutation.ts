import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { PoseRigConfig } from "@vizij/runtime-react";

export interface RuntimeGraphBridgeState {
  graphSpec?: GraphSpec | null;
  poseGraphSpec?: GraphSpec | null;
  poseConfig?: PoseRigConfig | null;
}

export interface RuntimeGraphBridgeRevisions {
  graphSpecRevision: number;
  poseRuntimeRevision: number;
  poseGraphSpecRevision: number;
  graphBridgeForceTopologyRevision: number;
}

export type RuntimeGraphMutationClass = "topology" | "pose";

export type RuntimeGraphMutationContract = {
  mutationClass: RuntimeGraphMutationClass;
  bundle: {
    rig?: { id: string; spec: GraphSpec };
    pose?: {
      graph?: { id: string; spec: GraphSpec };
      config?: PoseRigConfig;
    };
  };
  options: { tier: "graphs" };
};

export type RuntimeGraphMutationDecision =
  | {
      kind: "publish";
      mutationClass: RuntimeGraphMutationClass;
      mutation: RuntimeGraphMutationContract;
      revisions: RuntimeGraphBridgeRevisions;
    }
  | {
      kind: "skip";
      reason: "unchanged-revisions" | "empty-payload";
      revisions: RuntimeGraphBridgeRevisions;
    };

export function resolveRuntimeGraphMutationClass(
  previous: RuntimeGraphBridgeRevisions | null,
  next: RuntimeGraphBridgeRevisions,
): RuntimeGraphMutationClass | null {
  if (
    previous &&
    previous.graphSpecRevision === next.graphSpecRevision &&
    previous.poseRuntimeRevision === next.poseRuntimeRevision &&
    previous.poseGraphSpecRevision === next.poseGraphSpecRevision &&
    previous.graphBridgeForceTopologyRevision ===
      next.graphBridgeForceTopologyRevision
  ) {
    return null;
  }

  if (!previous) {
    return "topology";
  }

  return previous.graphSpecRevision !== next.graphSpecRevision ||
    previous.poseGraphSpecRevision !== next.poseGraphSpecRevision ||
    previous.graphBridgeForceTopologyRevision !==
      next.graphBridgeForceTopologyRevision
    ? "topology"
    : "pose";
}

export function createRuntimeGraphMutation(
  state: RuntimeGraphBridgeState,
  mutationClass: RuntimeGraphMutationClass,
): RuntimeGraphMutationContract {
  const shouldIncludePosePayload =
    Boolean(state.graphSpec) ||
    Boolean(state.poseGraphSpec) ||
    Boolean(state.poseConfig);

  return {
    mutationClass,
    bundle: {
      rig: state.graphSpec ? { id: "rig", spec: state.graphSpec } : undefined,
      pose: shouldIncludePosePayload
        ? {
            graph: state.poseGraphSpec
              ? { id: "pose", spec: state.poseGraphSpec }
              : undefined,
            config: state.poseConfig ?? undefined,
          }
        : undefined,
    },
    options: { tier: "graphs" },
  };
}

export function resolveRuntimeGraphMutationDecision(
  previous: RuntimeGraphBridgeRevisions | null,
  next: RuntimeGraphBridgeRevisions,
  state: RuntimeGraphBridgeState,
): RuntimeGraphMutationDecision {
  const mutationClass = resolveRuntimeGraphMutationClass(previous, next);
  if (!mutationClass) {
    return {
      kind: "skip",
      reason: "unchanged-revisions",
      revisions: next,
    };
  }

  const mutation = createRuntimeGraphMutation(state, mutationClass);
  const hasPayload =
    Boolean(mutation.bundle.rig) ||
    Boolean(mutation.bundle.pose?.graph) ||
    Boolean(mutation.bundle.pose?.config);

  const shouldSkipEmptyPayload =
    !hasPayload && (!previous || mutationClass === "pose");

  if (shouldSkipEmptyPayload) {
    return {
      kind: "skip",
      reason: "empty-payload",
      revisions: next,
    };
  }

  return {
    kind: "publish",
    mutationClass,
    mutation,
    revisions: next,
  };
}
