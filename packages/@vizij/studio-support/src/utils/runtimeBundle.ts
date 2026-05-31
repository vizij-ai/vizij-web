import type { VizijBundleExtension } from "@vizij/render";
import type { AnimatableValue } from "@vizij/utils";
import type { World } from "@vizij/render";
import type {
  PoseRigConfig,
  VizijAssetBundle,
  VizijGraphAsset,
} from "../types";

type BuildRuntimeBundleOptions = {
  namespace: string;
  world: World | Record<string, unknown> | null;
  animatables: Record<string, AnimatableValue> | Record<string, unknown> | null;
  rigSpec: VizijGraphAsset["spec"] | null;
  poseGraphSpec: VizijGraphAsset["spec"] | null;
  poseConfig: PoseRigConfig | null;
  loadedBundle: VizijBundleExtension | null;
};

type BuildRuntimeBaseBundleOptions = Omit<
  BuildRuntimeBundleOptions,
  "rigSpec" | "poseGraphSpec" | "poseConfig"
>;

type BuildRuntimeGraphBundleOptions = Pick<
  BuildRuntimeBundleOptions,
  "rigSpec" | "poseGraphSpec" | "poseConfig"
>;

export function buildRuntimeBaseBundle(
  options: BuildRuntimeBaseBundleOptions,
): VizijAssetBundle | null {
  const { namespace, world, animatables, loadedBundle } = options;

  if (!world || !animatables) {
    return null;
  }

  return {
    namespace,
    glb: {
      kind: "world",
      world: world as any,
      animatables: animatables as any,
      bundle: loadedBundle ?? null,
    },
    bundle: loadedBundle ?? null,
  };
}

export function buildRuntimeGraphBundle(
  options: BuildRuntimeGraphBundleOptions,
): Pick<VizijAssetBundle, "rig" | "pose"> {
  const { rigSpec, poseGraphSpec, poseConfig } = options;
  const runtimePoseConfig = poseConfig as PoseRigConfig | null;

  return {
    rig: rigSpec
      ? {
          id: "rig",
          spec: rigSpec,
        }
      : undefined,
    pose: poseGraphSpec
      ? {
          graph: {
            id: "pose",
            spec: poseGraphSpec,
          },
          config: runtimePoseConfig ?? undefined,
        }
      : runtimePoseConfig
        ? { config: runtimePoseConfig }
        : undefined,
  };
}
