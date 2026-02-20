import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { PoseRigConfig } from "@vizij/runtime-react";

export interface RuntimeGraphBridgeState {
  graphSpec?: GraphSpec | null;
  poseGraphSpec?: GraphSpec | null;
  poseConfig?: PoseRigConfig | null;
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

export function createRuntimeGraphMutation(
  previous: RuntimeGraphBridgeState | null,
  next: RuntimeGraphBridgeState,
): RuntimeGraphMutationContract | null {
  const graphChanged = previous?.graphSpec !== next.graphSpec;
  const poseGraphChanged = previous?.poseGraphSpec !== next.poseGraphSpec;
  const poseConfigChanged = previous?.poseConfig !== next.poseConfig;

  if (!graphChanged && !poseGraphChanged && !poseConfigChanged) {
    return null;
  }

  const shouldIncludePosePayload =
    Boolean(next.graphSpec) ||
    Boolean(next.poseGraphSpec) ||
    Boolean(next.poseConfig);

  return {
    mutationClass: graphChanged ? "topology" : "pose",
    bundle: {
      rig: next.graphSpec ? { id: "rig", spec: next.graphSpec } : undefined,
      pose: shouldIncludePosePayload
        ? {
            graph: next.poseGraphSpec
              ? { id: "pose", spec: next.poseGraphSpec }
              : undefined,
            config: next.poseConfig ?? undefined,
          }
        : undefined,
    },
    options: { tier: "graphs" },
  };
}
