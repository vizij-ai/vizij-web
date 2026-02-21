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
}

export type RuntimeGraphMutationContract = {
  mutationClass: "topology" | "pose";
  bundle: {
    rig?: { id: string; spec: GraphSpec };
    pose?: {
      graph?: { id: string; spec: GraphSpec };
      config?: PoseRigConfig;
    };
  };
  options: { tier: "graphs" };
};

export function resolveRuntimeGraphMutationClass(
  previous: RuntimeGraphBridgeRevisions | null,
  next: RuntimeGraphBridgeRevisions,
): RuntimeGraphMutationContract["mutationClass"] | null {
  if (
    previous &&
    previous.graphSpecRevision === next.graphSpecRevision &&
    previous.poseRuntimeRevision === next.poseRuntimeRevision &&
    previous.poseGraphSpecRevision === next.poseGraphSpecRevision
  ) {
    return null;
  }

  if (!previous) {
    return "topology";
  }

  return previous.graphSpecRevision !== next.graphSpecRevision ||
    previous.poseGraphSpecRevision !== next.poseGraphSpecRevision
    ? "topology"
    : "pose";
}

export function createRuntimeGraphMutation(
  state: RuntimeGraphBridgeState,
  mutationClass: RuntimeGraphMutationContract["mutationClass"],
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
