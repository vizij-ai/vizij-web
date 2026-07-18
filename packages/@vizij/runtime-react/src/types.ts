import type { ReactNode } from "react";
import type { ValueJSON } from "@vizij/value-json";
import type { IrGraph } from "@vizij/node-graph-authoring";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { World, VizijProps, VizijBundleExtension } from "@vizij/render";

// ---------------------------------------------------------------------------
// Engine-facing types. The engine is an Arora device running ONE composed
// graph; these types are the vocabulary of the asset bundle and the
// provider's public surface. Registration configs are metadata feeding the
// composed spec and the tracked-output sets — the device has no
// per-controller registration.
// ---------------------------------------------------------------------------

/** Value shape hint. Accepted through the public surface, unused by the device. */
export type ShapeJSON = Record<string, unknown>;

/** Paths a graph reads/writes — metadata for output tracking and seeding. */
export type GraphSubscriptions = {
  inputs?: string[];
  outputs?: string[];
};

/** A Vizij graph spec handled structurally (nodes/edges arrays of records). */
export type GraphSpecLike = {
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  metadata?: unknown;
  [key: string]: unknown;
};

/** One graph source composed into the device's behavior. */
export type GraphRegistrationConfig = {
  id?: string;
  spec: GraphSpecLike;
  subs?: GraphSubscriptions;
};

/** Per-source merge options. Composition is last-writer-wins today (VIZ-53). */
export type MergeStrategyOptions = Record<string, unknown>;

/** Player/instance setup carried by animation assets; consumed by the JS clip pipeline. */
export type AnimationSetup = {
  animation?: unknown;
  player?: Record<string, unknown>;
  instance?: Record<string, unknown>;
};

/** Id of a registered controller (graph source or animation clip). */
export type ControllerId = string;

/** Legacy animation registration shape; animations play through the JS clip pipeline. */
export type AnimationRegistrationConfig = {
  id?: string;
  data?: unknown;
  setup?: Partial<AnimationSetup>;
};

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

export type RuntimeError = {
  message: string;
  cause?: unknown;
  phase?:
    | "assets"
    | "engine"
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

export type StopAnimationOptions = {
  clearOutputs?: boolean;
};

export type AnimationPlaybackState = {
  time: number;
  duration: number;
  playing: boolean;
  loop: boolean;
  speed: number;
};

export type StopProgramOptions = {
  resetOutputs?: boolean;
};

export type ProgramPlaybackState = {
  state: "playing" | "paused" | "stopped";
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

export type RuntimeOutputWrite = {
  id: string;
  namespace: string;
  value: RawValue;
  currentValue?: RawValue;
};

export type VizijRuntimeFaceProps = Omit<VizijProps, "rootId" | "namespace"> & {
  namespaceOverride?: string;
};

export type VizijRuntimeContextValue = VizijRuntimeStatus & {
  assetBundle: VizijAssetBundle;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
  /** Current engine-store value of a path (read-your-own-write included). */
  getValueSnapshot: (path: string) => ValueJSON | undefined;
  /**
   * A snapshot of EVERY key currently in the device store, as path → Value in
   * arora's serde JSON shape (pass-through from the device; not `ValueJSON`).
   * `undefined` until the device exists. For mirrors/bridges that forward the
   * whole store (e.g. the standalone's native-store mirror), not for per-path
   * sampling — use `getValueSnapshot` for that.
   */
  getStoreSnapshot: () => Record<string, unknown> | undefined;
  /**
   * Notifies after each engine step, once the step's store changes have been
   * applied. Pair with `getValueSnapshot` to sample values step-aligned.
   * Returns an unsubscribe function.
   */
  subscribeToStep: (listener: () => void) => () => void;
  setGraphBundle: (
    bundle: RuntimeGraphBundle,
    options?: { tier?: "auto" | "assets" | "graphs" },
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
  pauseAnimation: (id: string) => void;
  seekAnimation: (id: string, timeSeconds: number) => void;
  setAnimationLoop: (id: string, enabled: boolean) => void;
  getAnimationState: (id: string) => AnimationPlaybackState | null;
  stopAnimation: (id: string, options?: StopAnimationOptions) => void;
  playProgram: (id: string) => void;
  pauseProgram: (id: string) => void;
  stopProgram: (id: string, options?: StopProgramOptions) => void;
  getProgramState: (id: string) => ProgramPlaybackState | null;
  setAnimationActive: (active: boolean) => void;
  isAnimationActive: () => boolean;
  step: (dt: number, opts?: { forceRuntime?: boolean }) => void;
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
  autostart?: boolean;
  driveRuntime?: boolean;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  transformOutputWrite?: (
    write: RuntimeOutputWrite,
  ) => RuntimeOutputWrite | null;
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
