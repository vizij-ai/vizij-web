import * as react_jsx_runtime from 'react/jsx-runtime';
import * as react from 'react';
import { ReactNode, PropsWithChildren } from 'react';
import { ValueJSON } from '@vizij/value-json';
import { IrGraph } from '@vizij/node-graph-authoring';
import { AnimatableValue, RawValue } from '@vizij/utils';
import { VizijBundleExtension } from '@vizij/face-core';
import { World, VizijProps } from '@vizij/render';

/** Value shape hint. Accepted through the public surface, unused by the device. */
type ShapeJSON = Record<string, unknown>;
/** Paths a graph reads/writes — metadata for output tracking and seeding. */
type GraphSubscriptions = {
    inputs?: string[];
    outputs?: string[];
};
/** A Vizij graph spec handled structurally (nodes/edges arrays of records). */
type GraphSpecLike = {
    nodes?: Array<Record<string, unknown>>;
    edges?: Array<Record<string, unknown>>;
    metadata?: unknown;
    [key: string]: unknown;
};
/** One graph source composed into the device's behavior. */
type GraphRegistrationConfig = {
    id?: string;
    spec: GraphSpecLike;
    subs?: GraphSubscriptions;
};
/** Per-source merge options. Composition is last-writer-wins today (VIZ-53). */
type MergeStrategyOptions = Record<string, unknown>;
/** Player/instance setup carried by animation assets; consumed by the JS clip pipeline. */
type AnimationSetup = {
    animation?: unknown;
    player?: Record<string, unknown>;
    instance?: Record<string, unknown>;
};
type PoseDefinition = {
    id: string;
    name?: string;
    description?: string;
    group?: string | null;
    groupId?: string | null;
    groupIds?: string[];
    values: Record<string, number | undefined>;
};
type PoseBlendMode = "average" | "additive";
type PoseGroupDefinition = {
    id: string;
    name: string;
    path: string;
    blendMode?: PoseBlendMode;
};
type PoseRigConfig = {
    version: number;
    faceId?: string | null;
    title?: string;
    description?: string;
    poseGroups?: PoseGroupDefinition[];
    crossGroupBlendMode?: PoseBlendMode;
    neutralInputs: Record<string, number>;
    poses: PoseDefinition[];
    metadata?: Record<string, unknown> | {
        createdAt: string;
        updatedAt: string;
        author?: string;
    };
};
type RootBounds = {
    center: {
        x: number;
        y: number;
    };
    size: {
        x: number;
        y: number;
    };
};
type VizijGlbAsset = {
    kind: "url";
    src: string;
    aggressiveImport?: boolean;
    rootBounds?: RootBounds;
} | {
    kind: "blob";
    blob: Blob;
    aggressiveImport?: boolean;
    rootBounds?: RootBounds;
} | {
    kind: "world";
    world: World | Record<string, unknown>;
    animatables: Record<string, AnimatableValue> | Record<string, unknown>;
    bundle?: VizijBundleExtension | null;
};
type VizijGraphAsset = {
    id: string;
    spec?: GraphRegistrationConfig["spec"];
    ir?: IrGraph | null;
    subscriptions?: Partial<GraphSubscriptions>;
    inputMetadata?: VizijInputMetadata[];
};
type VizijInputMetadata = {
    id?: string;
    path: string;
    label?: string;
    source?: string;
    root?: string;
    defaultValue?: number;
    range?: {
        min?: number;
        max?: number;
    };
    [key: string]: unknown;
};
type AnimationKeyframeLike = {
    time?: number;
    value?: number;
    inTangent?: number | null;
    outTangent?: number | null;
    [key: string]: unknown;
};
type AnimationTrackLike = {
    channel: string;
    keyframes?: AnimationKeyframeLike[];
    interpolation?: "linear" | "step" | "cubic" | string;
    [key: string]: unknown;
};
type AnimationClipLike = {
    id?: string;
    name?: string;
    duration?: number;
    tracks?: AnimationTrackLike[];
    [key: string]: unknown;
};
type VizijAnimationAsset = {
    id: string;
    clip: AnimationClipLike;
    setup?: Partial<AnimationSetup>;
    weight?: number;
};
type VizijProgramAsset = {
    id: string;
    label?: string;
    graph: VizijGraphAsset;
    resetValues?: Record<string, number>;
    metadata?: Record<string, unknown>;
};
type VizijAssetBundle = {
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
type RuntimeError = {
    message: string;
    cause?: unknown;
    phase?: "assets" | "engine" | "registration" | "animation" | "bridge" | "driver" | "unknown";
    timestamp: number;
};
type VizijRuntimeStatus = {
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
type AnimateValueOptions = {
    duration?: number;
    easing?: ((t: number) => number) | "linear" | "easeInOut" | "easeOut" | "easeIn";
    namespace?: string;
    coordinate?: "input" | "renderer";
};
type PlayAnimationOptions = {
    weight?: number;
    speed?: number;
    reset?: boolean;
};
type StopAnimationOptions = {
    clearOutputs?: boolean;
};
type AnimationPlaybackState = {
    time: number;
    duration: number;
    playing: boolean;
    loop: boolean;
    speed: number;
};
type StopProgramOptions = {
    resetOutputs?: boolean;
};
type ProgramPlaybackState = {
    state: "playing" | "paused" | "stopped";
};
type InputDriverLifecycle = {
    start: () => void;
    stop: () => void;
    dispose: () => void;
};
type InputDriverContext = {
    setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
    setRendererValue: (id: string, namespace: string, value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined)) => void;
    namespace: string;
    faceId?: string;
};
type InputDriverFactory = (ctx: InputDriverContext) => InputDriverLifecycle;
type RuntimeOutputWrite = {
    id: string;
    namespace: string;
    value: RawValue;
    currentValue?: RawValue;
};
type VizijRuntimeFaceProps = Omit<VizijProps, "rootId" | "namespace"> & {
    namespaceOverride?: string;
};
type VizijRuntimeContextValue = VizijRuntimeStatus & {
    assetBundle: VizijAssetBundle;
    setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
    /** Current engine-store value of a path (read-your-own-write included). */
    getValueSnapshot: (path: string) => ValueJSON | undefined;
    /**
     * A snapshot of EVERY key currently in the device store, as path → Value in
     * arora's serde JSON shape (pass-through from the device; not `ValueJSON`).
     * `undefined` until the device exists. For mirrors/bridges that forward the
     * whole store (e.g. the standalone's native-store bridge), not for per-path
     * sampling — use `getValueSnapshot` for that.
     */
    getStoreSnapshot: () => Record<string, unknown> | undefined;
    /**
     * Notifies with each step's drained store changes (path → Value in arora's
     * serde JSON shape; `null` for a cleared key). The change-driven counterpart
     * to `getStoreSnapshot` for store bridges: seed from the snapshot, then stay
     * current from these. Returns an unsubscribe function.
     */
    subscribeToStoreChanges: (listener: (changes: Record<string, unknown>) => void) => () => void;
    /**
     * Notifies after each engine step, once the step's store changes have been
     * applied. Pair with `getValueSnapshot` to sample values step-aligned.
     * Returns an unsubscribe function.
     */
    subscribeToStep: (listener: () => void) => () => void;
    setGraphBundle: (bundle: RuntimeGraphBundle, options?: {
        tier?: "auto" | "assets" | "graphs";
    }) => void;
    setValue: (id: string, namespace: string, value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined)) => void;
    stagePoseNeutral: (force?: boolean) => void;
    animateValue: (path: string, target: ValueJSON, options?: AnimateValueOptions) => Promise<void>;
    cancelAnimation: (path: string) => void;
    registerInputDriver: (id: string, factory: InputDriverFactory) => InputDriverLifecycle;
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
    step: (dt: number, opts?: {
        forceRuntime?: boolean;
    }) => void;
    inputConstraints: Record<string, {
        min?: number;
        max?: number;
        defaultValue?: number;
    }>;
};
type VizijRuntimeProviderProps = {
    assetBundle: VizijAssetBundle;
    children: ReactNode;
    namespace?: string;
    faceId?: string;
    updateTier?: RuntimeUpdateTier;
    autoCreate?: boolean;
    autostart?: boolean;
    /**
     * Whether this provider's device paces itself: when true the device is
     * handed to its own `run()` loop at boot and the provider only pumps its
     * changes; when false the device advances solely on `step(dt,
     * { forceRuntime: true })` calls from the host. A device handed to `run()`
     * keeps its loop even if this later turns false.
     */
    driveRuntime?: boolean;
    mergeStrategy?: MergeStrategyOptions;
    onRegisterControllers?: (ids: {
        graphs: string[];
        anims: string[];
    }) => void;
    onStatusChange?: (status: VizijRuntimeStatus) => void;
    transformOutputWrite?: (write: RuntimeOutputWrite) => RuntimeOutputWrite | null;
};
type RuntimeUpdateTier = "auto" | "assets" | "graphs";
type RuntimeUpdatePlan = {
    reloadAssets: boolean;
    reregisterGraphs: boolean;
};
type RuntimeGraphBundle = {
    rig?: VizijGraphAsset;
    pose?: VizijAssetBundle["pose"];
    animations?: VizijAnimationAsset[];
    programs?: VizijProgramAsset[];
};

type ProviderProps = PropsWithChildren<VizijRuntimeProviderProps>;
declare function VizijRuntimeProvider({ assetBundle, children, namespace: namespaceProp, faceId: faceIdProp, updateTier, autoCreate, autostart, driveRuntime, mergeStrategy, onRegisterControllers, onStatusChange, transformOutputWrite, }: ProviderProps): react_jsx_runtime.JSX.Element;

declare function VizijRuntimeFaceInner({ namespaceOverride, ...props }: VizijRuntimeFaceProps): react_jsx_runtime.JSX.Element | null;
declare const VizijRuntimeFace: react.MemoExoticComponent<typeof VizijRuntimeFaceInner>;

declare function useVizijRuntime(): VizijRuntimeContextValue;

declare function useOptionalVizijRuntime(): VizijRuntimeContextValue | null;

declare function useVizijOutputs(paths: string[]): Record<string, RawValue | undefined>;

declare function useRigInput(path: string): [RawValue | undefined, (value: ValueJSON, shape?: ShapeJSON) => void];

declare function resolveRuntimeUpdatePlan(previous: VizijAssetBundle | null, next: VizijAssetBundle, tier: RuntimeUpdateTier): RuntimeUpdatePlan;

declare const POSE_WEIGHT_INPUT_PATH_PREFIX = "/poses/";
declare const VISEME_POSE_KEYS: readonly ["a", "at", "b", "e", "e_2", "f", "i", "k", "m", "o", "o_2", "p", "r", "s", "t", "t_2", "u"];
declare const EXPRESSIVE_EMOTION_POSE_KEYS: readonly ["concerned", "happy", "sad", "sleepy", "surprise"];
declare const EMOTION_POSE_KEYS: readonly ["concerned", "happy", "neutral", "sad", "sleepy", "surprise", "angry"];
type PoseSemanticKind = "emotion" | "viseme" | "other";
declare function buildRigInputPath(faceId: string, path: string): string;
declare function buildPoseWeightInputPathSegment(poseId: string | null | undefined): string;
declare function buildPoseWeightRelativePath(poseId: string | null | undefined): string;
declare function buildPoseWeightPathMap(poses: PoseDefinition[], faceId: string | null | undefined): Map<string, string>;
declare function normalizePoseSemanticKey(value: string | null | undefined): string | null;
declare function getPoseSemanticKey(pose: Pick<PoseDefinition, "id" | "name">): string | null;
declare function resolvePoseMembership(pose: Pick<PoseDefinition, "group" | "groupId" | "groupIds">, groups: PoseGroupDefinition[] | undefined): {
    groupIds: string[];
    primaryGroupId: string | null;
    primaryGroupPath: string | null;
    groupPathsById: Record<string, string>;
};
declare function resolvePoseSemantics(pose: Pick<PoseDefinition, "id" | "name" | "group" | "groupId" | "groupIds">, groups: PoseGroupDefinition[] | undefined): {
    key: string | null;
    kind: PoseSemanticKind;
    membership: ReturnType<typeof resolvePoseMembership>;
};
declare function filterPosesBySemanticKind(poses: PoseDefinition[], groups: PoseGroupDefinition[] | undefined, kind: PoseSemanticKind): PoseDefinition[];
declare function buildSemanticPoseWeightPathMap(poses: PoseDefinition[], groups: PoseGroupDefinition[] | undefined, faceId: string | null | undefined, kind: Exclude<PoseSemanticKind, "other">): Map<string, string>;

type InputConstraint = {
    min?: number;
    max?: number;
    defaultValue?: number;
};
type FaceScalarControl = {
    path: string;
    min: number;
    max: number;
    defaultValue: number;
};
type ResolvedFaceControls = {
    faceId: string;
    gazeSource: "standard-vizij" | "standard" | "propsrig" | "coupled-gaze" | "none";
    blinkSource: "lids" | "blink" | "none";
    eyes: {
        leftX: FaceScalarControl | null;
        leftY: FaceScalarControl | null;
        rightX: FaceScalarControl | null;
        rightY: FaceScalarControl | null;
    };
    eyelids: {
        leftUpper: FaceScalarControl | null;
        rightUpper: FaceScalarControl | null;
    };
    blink: FaceScalarControl | null;
};
declare function resolveFaceControls(assetBundle: VizijAssetBundle, runtimeFaceId?: string | null, inputConstraints?: Record<string, InputConstraint>): ResolvedFaceControls;
declare function mapNormalizedControlValue(control: FaceScalarControl, normalizedValue: number): number;
declare function mapUnitControlValue(control: FaceScalarControl, unitValue: number): number;

export { type AnimateValueOptions, type AnimationClipLike, type AnimationKeyframeLike, type AnimationPlaybackState, type AnimationTrackLike, EMOTION_POSE_KEYS, EXPRESSIVE_EMOTION_POSE_KEYS, type FaceScalarControl, type InputDriverContext, type InputDriverFactory, type InputDriverLifecycle, POSE_WEIGHT_INPUT_PATH_PREFIX, type PlayAnimationOptions, type PoseDefinition, type PoseGroupDefinition, type PoseRigConfig, type ProgramPlaybackState, type RootBounds, type RuntimeGraphBundle, type RuntimeOutputWrite, type RuntimeUpdatePlan, type RuntimeUpdateTier, type StopProgramOptions, VISEME_POSE_KEYS, type VizijAnimationAsset, type VizijAssetBundle, type VizijGlbAsset, type VizijGraphAsset, type VizijProgramAsset, VizijRuntimeFace, type VizijRuntimeFaceProps, VizijRuntimeProvider, type VizijRuntimeProviderProps, type VizijRuntimeStatus, buildPoseWeightInputPathSegment, buildPoseWeightPathMap, buildPoseWeightRelativePath, buildRigInputPath, buildSemanticPoseWeightPathMap, filterPosesBySemanticKind, getPoseSemanticKey, mapNormalizedControlValue, mapUnitControlValue, normalizePoseSemanticKey, resolveFaceControls, resolvePoseMembership, resolvePoseSemantics, resolveRuntimeUpdatePlan, useOptionalVizijRuntime, useRigInput, useVizijOutputs, useVizijRuntime };
