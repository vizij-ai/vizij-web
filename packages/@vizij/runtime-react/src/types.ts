import type { ReactNode } from "react";
import type {
  AnimationSetup,
  CreateOrchOptions,
  GraphRegistrationConfig,
  GraphSubscriptions,
  MergeStrategyOptions,
  ValueJSON,
  ShapeJSON,
} from "@vizij/orchestrator-react";
import type { IrGraph } from "@vizij/node-graph-authoring";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { World, VizijProps, VizijBundleExtension } from "@vizij/render";

export type PoseDefinition = {
  id: string;
  name?: string;
  description?: string;
  group?: string | null;
  groupId?: string | null;
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
};

export type AnimationTrackLike = {
  channel: string;
  keyframes?: AnimationKeyframeLike[];
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
  initialInputs?: Record<string, ValueJSON>;
  metadata?: Record<string, unknown>;
  bundle?: VizijBundleExtension | null;
};

export type RuntimeError = {
  message: string;
  cause?: unknown;
  phase?:
    | "assets"
    | "orchestrator"
    | "registration"
    | "animation"
    | "bridge"
    | "driver"
    | "unknown";
  timestamp: number;
};

export type VizijRuntimeStatus = {
  loading: boolean;
  ready: boolean;
  error: RuntimeError | null;
  errors: RuntimeError[];
  namespace: string;
  faceId?: string;
  rootId?: string | null;
  /** Namespaced output signal paths emitted by registered graphs. */
  outputPaths: string[];
  /** Approximate current stepping rate in Hz (smoothed). */
  stepHz?: number;
  controllers: {
    graphs: string[];
    anims: string[];
  };
};

export type AnimateValueOptions = {
  duration?: number;
  easing?:
    | ((t: number) => number)
    | "linear"
    | "easeInOut"
    | "easeOut"
    | "easeIn";
  namespace?: string;
  coordinate?: "input" | "renderer";
};

export type PlayAnimationOptions = {
  weight?: number;
  speed?: number;
  reset?: boolean;
};

export type InputDriverLifecycle = {
  start: () => void;
  stop: () => void;
  dispose: () => void;
};

export type InputDriverContext = {
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
  setRendererValue: (
    id: string,
    namespace: string,
    value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined),
  ) => void;
  namespace: string;
  faceId?: string;
};

export type InputDriverFactory = (
  ctx: InputDriverContext,
) => InputDriverLifecycle;

export type VizijRuntimeFaceProps = Omit<VizijProps, "rootId" | "namespace"> & {
  namespaceOverride?: string;
};

export type VizijRuntimeContextValue = VizijRuntimeStatus & {
  assetBundle: VizijAssetBundle;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
  setGraphBundle: (
    bundle: RuntimeGraphBundle,
    options?: RuntimeGraphBundleUpdateOptions,
  ) => void;
  setValue: (
    id: string,
    namespace: string,
    value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined),
  ) => void;
  stagePoseNeutral: (force?: boolean) => void;
  animateValue: (
    path: string,
    target: ValueJSON,
    options?: AnimateValueOptions,
  ) => Promise<void>;
  cancelAnimation: (path: string) => void;
  registerInputDriver: (
    id: string,
    factory: InputDriverFactory,
  ) => InputDriverLifecycle;
  playAnimation: (id: string, options?: PlayAnimationOptions) => Promise<void>;
  stopAnimation: (id: string) => void;
  step: (dt: number, opts?: { forceRuntime?: boolean }) => void;
  advanceAnimations: (dt: number) => void;
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
};

export type VizijRuntimeProviderProps = {
  assetBundle: VizijAssetBundle;
  children: ReactNode;
  namespace?: string;
  faceId?: string;
  updateTier?: RuntimeUpdateTier;
  autoCreate?: boolean;
  createOptions?: CreateOrchOptions;
  autostart?: boolean;
  driveOrchestrator?: boolean;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  orchestratorScope?: "auto" | "shared" | "isolated";
};

export type RuntimeUpdateTier = "auto" | "assets" | "graphs";

export type RuntimeUpdatePlan = {
  reloadAssets: boolean;
  reregisterGraphs: boolean;
};

export type RuntimeGraphBundle = {
  rig?: VizijGraphAsset;
  pose?: VizijAssetBundle["pose"];
};

export type RuntimeMutationClass = "topology" | "pose" | "value";

export type RuntimeGraphMutation = {
  mutationClass: Exclude<RuntimeMutationClass, "value">;
  bundle: RuntimeGraphBundle;
  options: { tier: "graphs" };
};

export type RuntimeGraphBundleUpdateOptions = {
  tier?: RuntimeUpdateTier;
  mutationClass?: Exclude<RuntimeMutationClass, "value">;
};
