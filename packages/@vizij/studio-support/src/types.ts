import type {
  AnimationSetup,
  GraphRegistrationConfig,
  GraphSubscriptions,
  ValueJSON,
} from "@vizij/orchestrator-react";
import type { IrGraph } from "@vizij/node-graph-authoring";
import type { AnimatableValue } from "@vizij/utils";
import type { VizijBundleExtension, World } from "@vizij/render";

export type PoseDefinition = {
  id: string;
  name?: string;
  description?: string;
  group?: string | null;
  groupId?: string | null;
  groupIds?: string[];
  values: Record<string, number | undefined>;
};

export type PoseBlendMode = "average" | "additive";

export type PoseGroupDefinition = {
  id: string;
  name: string;
  path: string;
  blendMode?: PoseBlendMode;
};

export type PoseRigConfig = {
  version: number;
  faceId?: string | null;
  title?: string;
  description?: string;
  poseGroups?: PoseGroupDefinition[];
  crossGroupBlendMode?: PoseBlendMode;
  neutralInputs: Record<string, number>;
  poses: PoseDefinition[];
  metadata?:
    | Record<string, unknown>
    | {
        createdAt: string;
        updatedAt: string;
        author?: string;
      };
};

export type RootBounds = {
  center: { x: number; y: number };
  size: { x: number; y: number };
};

export type VizijGlbAsset =
  | {
      kind: "url";
      src: string;
      aggressiveImport?: boolean;
      rootBounds?: RootBounds;
    }
  | {
      kind: "blob";
      blob: Blob;
      aggressiveImport?: boolean;
      rootBounds?: RootBounds;
    }
  | {
      kind: "world";
      world: World | Record<string, unknown>;
      animatables: Record<string, AnimatableValue> | Record<string, unknown>;
      bundle?: VizijBundleExtension | null;
    };

export type VizijGraphAsset = {
  id: string;
  spec?: GraphRegistrationConfig["spec"];
  ir?: IrGraph | null;
  subscriptions?: Partial<GraphSubscriptions>;
  inputMetadata?: VizijInputMetadata[];
};

export type VizijInputMetadata = {
  id?: string;
  path: string;
  label?: string;
  source?: string;
  root?: string;
  defaultValue?: number;
  range?: { min?: number; max?: number };
  [key: string]: unknown;
};

export type AnimationKeyframeLike = {
  time?: number;
  value?: number;
  inTangent?: number | null;
  outTangent?: number | null;
  [key: string]: unknown;
};

export type AnimationTrackLike = {
  channel: string;
  keyframes?: AnimationKeyframeLike[];
  interpolation?: "linear" | "step" | "cubic" | string;
  [key: string]: unknown;
};

export type AnimationClipLike = {
  id?: string;
  name?: string;
  duration?: number;
  tracks?: AnimationTrackLike[];
  [key: string]: unknown;
};

export type VizijAnimationAsset = {
  id: string;
  clip: AnimationClipLike;
  setup?: Partial<AnimationSetup>;
  weight?: number;
};

export type VizijProgramAsset = {
  id: string;
  label?: string;
  graph: VizijGraphAsset;
  resetValues?: Record<string, number>;
  metadata?: Record<string, unknown>;
};

export type VizijAssetBundle = {
  namespace?: string;
  faceId?: string;
  glb: VizijGlbAsset;
  rig?: VizijGraphAsset;
  pose?: {
    graph?: VizijGraphAsset;
    config?: PoseRigConfig;
    stageNeutralFilter?: (id: string, path: string) => boolean;
  };
  animations?: VizijAnimationAsset[];
  programs?: VizijProgramAsset[];
  initialInputs?: Record<string, ValueJSON>;
  metadata?: Record<string, unknown>;
  bundle?: VizijBundleExtension | null;
};

export type RuntimeUpdateTier = "auto" | "assets" | "graphs";

export type RuntimeUpdatePlan = {
  reloadAssets: boolean;
  reregisterGraphs: boolean;
};

export type RuntimeGraphBundle = {
  rig?: VizijGraphAsset;
  pose?: VizijAssetBundle["pose"];
  animations?: VizijAnimationAsset[];
  programs?: VizijProgramAsset[];
};
