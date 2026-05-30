import type { ReactNode } from "react";
import type {
  InitInput,
  CreateOrchOptions,
  MergeStrategyOptions,
  OrchestratorBackend,
  ValueJSON,
  ShapeJSON,
} from "@vizij/orchestrator-react";
import type { RawValue } from "@vizij/utils";
import type { VizijProps } from "@vizij/render";
import type {
  VizijAssetBundle,
  RuntimeGraphBundle,
  RuntimeUpdateTier,
} from "@vizij/studio-support";

export type { OrchestratorBackend } from "@vizij/orchestrator-react";
export type {
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
  PoseDefinition,
  PoseBlendMode,
  PoseGroupDefinition,
  PoseRigConfig,
  RuntimeGraphBundle,
  RuntimeUpdatePlan,
  RuntimeUpdateTier,
  RootBounds,
  VizijAnimationAsset,
  VizijAssetBundle,
  VizijGlbAsset,
  VizijGraphAsset,
  VizijInputMetadata,
  VizijProgramAsset,
} from "@vizij/studio-support";

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
  orchestratorBackend?: OrchestratorBackend;
  orchestratorInitInput?: InitInput;
  autostart?: boolean;
  driveOrchestrator?: boolean;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  transformOutputWrite?: (
    write: RuntimeOutputWrite,
  ) => RuntimeOutputWrite | null;
  orchestratorScope?: "auto" | "shared" | "isolated";
};
