import type {
  AnimationRegistrationConfig as EngineAnimationRegistrationConfig,
  AnimationSetup as EngineAnimationSetup,
  GraphRegistrationConfig as EngineGraphRegistrationConfig,
  GraphSubscriptions as EngineGraphSubscriptions,
  Shape as EngineShapeJSON,
  Value as EngineValueJSON,
} from "@vizij/orchestrator-wasm";
import type { IrGraph } from "@vizij/node-graph-authoring";
import type { AnimatableValue, RawValue } from "@vizij/utils";

export type ValueJSON = EngineValueJSON;
export type ShapeJSON = EngineShapeJSON;
export type GraphRegistrationConfig = EngineGraphRegistrationConfig;
export type GraphSubscriptions = EngineGraphSubscriptions;
export type AnimationSetup = Omit<
  EngineAnimationSetup,
  "player" | "instance"
> & {
  player?: NonNullable<EngineAnimationSetup["player"]> & {
    loopMode?: "once" | "loop" | "pingpong";
  };
  instance?: NonNullable<EngineAnimationSetup["instance"]> & {
    timeScale?: number;
    timescale?: number;
    startOffset?: number;
    offset?: number;
    active?: boolean;
  };
};
export type AnimationRegistrationConfig = Omit<
  EngineAnimationRegistrationConfig,
  "setup"
> & {
  setup?: AnimationSetup;
};

export type VizijBundleVersion = 1;
export type VizijBundleGraphKind =
  | "rig"
  | "pose"
  | "pose-driver"
  | "animation-bridge"
  | "low-level"
  | string;
export type VizijPoseId = string;
export type VizijAnimationId = string;
export type VizijGraphId = string;

export interface VizijBundleGraphMetadata {
  hash?: string;
  source?: string;
  kind?: VizijBundleGraphKind;
  exportedAt?: string;
  [key: string]: unknown;
}

export interface VizijBundleGraphEntry {
  id: VizijGraphId;
  kind: VizijBundleGraphKind;
  spec: Record<string, unknown>;
  label?: string;
  metadata?: VizijBundleGraphMetadata;
  ir?: Record<string, unknown> | null;
}

export interface VizijPoseDefinition {
  id: VizijPoseId;
  name?: string;
  description?: string;
  group?: string | null;
  values: Record<string, number | undefined>;
}

export interface VizijPoseRigConfig {
  version: number;
  faceId?: string | null;
  title?: string;
  description?: string;
  neutralInputs: Record<string, number>;
  poses: VizijPoseDefinition[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VizijBundlePoseSection {
  config: VizijPoseRigConfig;
  metadata?: {
    hash?: string;
    exportedAt?: string;
    [key: string]: unknown;
  };
}

export interface VizijBundleAnimationKeyframe {
  time: number;
  value: number;
  easing?: "linear" | "easeIn" | "easeOut" | "easeInOut" | string;
  inTangent?: number | null;
  outTangent?: number | null;
  [key: string]: unknown;
}

export interface VizijBundleAnimationTrack {
  channel: string;
  keyframes: VizijBundleAnimationKeyframe[];
  interpolation?: "step" | "linear" | "cubic" | string;
  [key: string]: unknown;
}

export interface VizijBundleAnimationClip {
  id: VizijAnimationId;
  name?: string;
  duration?: number;
  tracks: VizijBundleAnimationTrack[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface VizijBundleAnimationEntry {
  id: VizijAnimationId;
  clip: VizijBundleAnimationClip;
  metadata?: {
    hash?: string;
    sampleRateHz?: number;
    rigGraphHash?: string;
    poseGraphHash?: string | null;
    bakedClipIndex?: number | null;
    tolerance?: number;
    exportedAt?: string;
    [key: string]: unknown;
  };
}

export interface VizijSpeechConfig {
  voice?: string;
  mode?: "echo" | "conversation";
  agentName?: string;
  systemPrompt?: string;
  speakingInputPath?: string;
  userSpeakingInputPath?: string;
  thinkingInputPath?: string;
  visemeGroupId?: string;
  emotionGroupId?: string;
  apiBaseUrl?: string;
  autoActivateMic?: boolean;
}

export interface VizijBundleExtension {
  version: VizijBundleVersion;
  exportedAt?: string;
  graphs?: VizijBundleGraphEntry[];
  poses?: VizijBundlePoseSection | null;
  animations?: VizijBundleAnimationEntry[];
  metadata?: Record<string, unknown>;
}

export type World = Record<string, unknown>;

export interface AnimatedFeature {
  animated: true;
  value: string;
  label?: string;
}

export interface StaticFeature {
  animated: false;
  value: RawValue;
  label?: string;
}

export type Feature = AnimatedFeature | StaticFeature;

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

export type OrchestratorBackend = "direct" | "moduleFacade" | "aroraWeb";

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

export type RuntimeGraphBundleUpdateSource = {
  key?: string;
  signature?: string | null;
  programId?: string | null;
};

export type RuntimeGraphBundlePendingUpdate = {
  revision: number;
  source: RuntimeGraphBundleUpdateSource;
  reregistered: boolean;
  reloadedAssets: boolean;
};

export type RuntimeGraphBundleApplicationPlan = {
  baseAssetBundle: VizijAssetBundle;
  nextAssetBundle: VizijAssetBundle;
  updatePlan: RuntimeUpdatePlan;
  pendingUpdate: RuntimeGraphBundlePendingUpdate | null;
};

export type InputConstraint = {
  min?: number;
  max?: number;
  defaultValue?: number;
};

export type GraphRegistrationSupportResult = {
  config: GraphRegistrationConfig;
  spec: GraphRegistrationConfig["spec"];
  inputs: string[];
  outputs: string[];
};

export type RuntimeRegistrationDiagnostic = {
  level: "error" | "warn";
  target: "rig" | "pose" | "program" | "animation";
  id?: string;
  message: string;
};

export type RuntimeAnimationRegistrationSupportResult = {
  assetId: string;
  config: AnimationRegistrationConfig;
  outputPaths: string[];
};

export type RuntimeProgramRegistrationSupportResult = {
  assetId: string;
  config: GraphRegistrationConfig;
  spec: GraphRegistrationConfig["spec"];
  inputs: string[];
  outputs: string[];
};

export type RuntimeRegistrationPlan = {
  graphRegistrations: GraphRegistrationSupportResult[];
  graphConfigs: GraphRegistrationConfig[];
  animationRegistrations: RuntimeAnimationRegistrationSupportResult[];
  programRegistrations: RuntimeProgramRegistrationSupportResult[];
  baseOutputPaths: string[];
  namespacedOutputPaths: string[];
  outputPaths: string[];
  inputConstraints: Record<string, InputConstraint>;
  rigInputMap: Record<string, string>;
  rigPoseControlInputIds: string[];
  diagnostics: RuntimeRegistrationDiagnostic[];
};
