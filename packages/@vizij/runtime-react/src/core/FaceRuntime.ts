/**
 * FaceRuntime — the headless face runtime controller.
 *
 * Second strangler step of the `@vizij/face-core` extraction
 * (docs/redesign/06-track-2-implementation.md §3.1): all runtime truth that
 * lived in `VizijRuntimeProvider`'s refs becomes fields here, and the
 * provider's callbacks become methods, moved verbatim. Nothing in this file
 * may import React or the render store.
 *
 * The seams to the host (a React provider today, the embed later) are the
 * settable `callbacks` fields: status patches, loop-mode change requests,
 * render-store application of drained engine changes, and the renderer value
 * writer handed to input drivers. `step(dt)` stays pure — the host owns the
 * clock.
 */
import { valueAsNumber, type ValueJSON } from "@vizij/value-json";
import type { RawValue } from "@vizij/utils";
import { loadAnimationModule } from "@vizij/animation-module";
import {
  DeviceSlot,
  ensureWasmInit,
  type DeviceModule,
} from "../engine/aroraEngine";
import { AnimationModuleHost } from "../engine/animationModuleHost";
import {
  ANIMATION_PLAYERS_PATH,
  animationsGraphSource,
  decodePlayerStates,
  type StoredAnimationClipLike,
} from "../engine/animationModule";
import { composeGraphSpecs, type GraphSource } from "../utils/composeGraph";
import {
  collectInputPathMap,
  collectInputPaths,
  collectOutputPaths,
} from "../utils/graph";
import { buildPoseWeightPathMap, buildRigInputPath } from "../utils/posePaths";
import {
  resolvePoseControlInputPath,
  shouldUseLegacyPoseWeightFallback,
} from "../utils/poseRuntime";
import { resolveClipDurationSeconds } from "../utils/clipPlayback";
import {
  collectAnimationClipOutputPaths,
  resolveAnimationBridgeOutputPaths,
} from "../utils/animationBridge";
import {
  applyRuntimeGraphBundle,
  resolveRuntimeUpdatePlan,
  type RuntimeGraphBundle,
  type RuntimeUpdatePlan,
  type RuntimeUpdateTier,
} from "../updatePolicy";
import type {
  AnimateValueOptions,
  AnimationPlaybackState,
  AnimationRegistrationConfig,
  AnimationClipLike,
  ControllerId,
  GraphRegistrationConfig,
  InputDriverFactory,
  InputDriverLifecycle,
  MergeStrategyOptions,
  PlayAnimationOptions,
  ProgramPlaybackState,
  RuntimeError,
  ShapeJSON,
  StopAnimationOptions,
  StopProgramOptions,
  VizijAnimationAsset,
  VizijAssetBundle,
  VizijProgramAsset,
  VizijRuntimeStatus,
} from "../types";
import {
  convertBundlePrograms,
  deriveProgramInputSeedValues,
  extractInputConstraints,
  isRuntimeDebugEnabled,
  namespaceControllerId,
  namespaceGraphSpec,
  namespaceSubscriptions,
  namespaceTypedPath,
  normalisePath,
  now,
  resolveEasing,
  resolveGraphSpec,
  stripNamespace,
  stripNulls,
  toStoredAnimationClip,
} from "./helpers";

export type LoopMode = "active" | "idle-visible" | "idle-hidden" | "stopped";

export const ACTIVE_GRACE_MS = 250;
export const VISIBLE_IDLE_FPS = 30;
export const HIDDEN_IDLE_FPS = 1;

const DEFAULT_MERGE: MergeStrategyOptions = {
  outputs: "add",
  intermediate: "add",
};

const DEFAULT_DURATION = 0.35;
export const POSE_CONTROL_BRIDGE_EPSILON = 1e-6;

type AnimationState = {
  path: string;
  from: number;
  to: number;
  duration: number;
  elapsed: number;
  easing: (t: number) => number;
  resolve: () => void;
};

type ClipPlaybackState = {
  id: string;
  /** Clip-derived length in seconds; the device feedback refines it. */
  duration: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
  resolve: (() => void) | null;
  completion: Promise<void> | null;
};

type ProgramTransportState = {
  id: string;
  state: ProgramPlaybackState["state"];
};

export type InputConstraintsMap = Record<
  string,
  { min?: number; max?: number; defaultValue?: number }
>;

/**
 * The host seams. A React provider (or, later, the embed element) assigns
 * these; every field has a safe default so a bare FaceRuntime works headless.
 */
export interface FaceRuntimeCallbacks {
  /** Mirror a status patch into host state (and fire user onStatusChange). */
  onStatusPatch: (
    updater: (prev: VizijRuntimeStatus) => VizijRuntimeStatus,
  ) => void;
  /** The loop-mode machine wants the host's step driver in this mode. */
  onLoopModeChange: (mode: LoopMode) => void;
  /** Wasm finished loading (initEngine resolved). */
  onEngineReady: () => void;
  /** setGraphBundle produced a new effective bundle; host adopts it. */
  onGraphBundleApplied: (
    bundle: VizijAssetBundle,
    plan: RuntimeUpdatePlan,
  ) => void;
  /** Rig input constraints were recomputed. */
  onInputConstraintsChange: (constraints: InputConstraintsMap) => void;
  /** registerControllers finished (mirrors the provider prop). */
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  /**
   * Apply a step's drained store changes to the render surface. The provider
   * binds the render-store write path here; headless hosts observe via
   * subscribeToStoreChanges instead.
   */
  applyEngineChanges: (changes: Record<string, ValueJSON | null>) => void;
  /** Renderer value writer handed to input drivers (render-store concern). */
  setRendererValue: (
    id: string,
    ns: string,
    value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined),
  ) => void;
}

const noopCallbacks: FaceRuntimeCallbacks = {
  onStatusPatch: () => {},
  onLoopModeChange: () => {},
  onEngineReady: () => {},
  onGraphBundleApplied: () => {},
  onInputConstraintsChange: () => {},
  applyEngineChanges: () => {},
  setRendererValue: () => {},
};

/** Host-synced configuration (the provider mirrors its props/memos here). */
export interface FaceRuntimeConfig {
  namespace: string;
  faceId?: string;
  autostart: boolean;
  driveRuntime: boolean;
  mergeStrategy?: MergeStrategyOptions;
  assetBundle: VizijAssetBundle;
}

export class FaceRuntime {
  readonly callbacks: FaceRuntimeCallbacks = { ...noopCallbacks };

  // ---- host-synced config -------------------------------------------------
  private namespace = "default";
  private faceId: string | undefined;
  private autostart = false;
  private driveRuntime = true;
  private mergeStrategy: MergeStrategyOptions | undefined;
  private assetBundle: VizijAssetBundle = {
    glb: { kind: "world", world: {}, animatables: {} },
  };

  // ---- config-derived (recomputed in configure()) ---------------------------
  private poseWeightFallbackMap = new Map<string, Record<string, number>>();
  private useLegacyPoseWeightFallback = false;
  private resolvedProgramAssets: VizijProgramAsset[] = [];

  // ---- engine ----------------------------------------------------------------
  readonly deviceSlot = new DeviceSlot();
  private engineReady = false;
  private graphSources: GraphSource[] = [];
  private pendingWrites = new Map<string, ValueJSON>();

  // ---- bundle update-plan state ----------------------------------------------
  private latestEffectiveAssetBundle: VizijAssetBundle | null = null;
  private previousBundle: VizijAssetBundle | null = null;
  private suppressNextBundlePlan = false;
  private updateTier: RuntimeUpdateTier = "auto";
  pendingPlan: RuntimeUpdatePlan | null = null;

  // ---- registration / output maps ---------------------------------------------
  private errors: RuntimeError[] = [];
  private outputPaths = new Set<string>();
  private baseOutputPaths = new Set<string>();
  private namespacedOutputPaths = new Set<string>();
  private rigInputMap: Record<string, string> = {};
  private rigPoseControlInputIds = new Set<string>();
  private registeredGraphs: string[] = [];
  private registeredAnimations: string[] = [];
  private mergedGraph: string | null = null;
  private poseControlBridgeValues = new Map<string, number>();
  private inputConstraints: InputConstraintsMap = {};

  // ---- transport --------------------------------------------------------------
  private animationTweens = new Map<string, AnimationState>();
  private clipPlayback = new Map<string, ClipPlaybackState>();
  private programPlayback = new Map<string, ProgramTransportState>();
  private programControllerIds = new Map<string, string>();
  private animationModule: DeviceModule | null = null;
  private animationHost: AnimationModuleHost | null = null;
  private animationModuleLoading = false;
  private animationsSourceRegistered = false;
  private animationGapWarned = new Set<string>();
  private animationSystemActive = true;
  private stagedInputs = new Map<
    string,
    { value: ValueJSON; shape?: ShapeJSON }
  >();
  private inputDriverIds = new Set<string>();

  // ---- loop bookkeeping ---------------------------------------------------------
  private lastActivityTime = now();
  private avgStepDt: number | null = null;

  // ---- observation ----------------------------------------------------------------
  private stepListeners = new Set<() => void>();
  private storeChangeListeners = new Set<
    (changes: Record<string, unknown>) => void
  >();

  // ==========================================================================
  // Host config sync
  // ==========================================================================

  /** Mirror the host's props/memos. Derived maps recompute when inputs change. */
  configure(config: FaceRuntimeConfig): void {
    const bundleChanged = this.assetBundle !== config.assetBundle;
    const faceIdChanged = this.faceId !== config.faceId;
    this.namespace = config.namespace;
    this.faceId = config.faceId;
    this.autostart = config.autostart;
    this.driveRuntime = config.driveRuntime;
    this.mergeStrategy = config.mergeStrategy;
    this.assetBundle = config.assetBundle;
    if (bundleChanged || faceIdChanged) {
      this.recomputeDerivedBundleState();
    }
  }

  setUpdateTier(tier: RuntimeUpdateTier): void {
    this.updateTier = tier;
  }

  noteEffectiveAssetBundle(bundle: VizijAssetBundle): void {
    this.latestEffectiveAssetBundle = bundle;
  }

  /**
   * The bundle-plan step that ran in the provider's effect: consume the
   * suppress flag set by setGraphBundle, otherwise compute the update plan
   * for a prop-driven bundle change. Returns the plan (null when suppressed)
   * so the host can trigger re-registration.
   */
  resolveBundlePlan(bundle: VizijAssetBundle): RuntimeUpdatePlan | null {
    if (this.suppressNextBundlePlan) {
      this.suppressNextBundlePlan = false;
      this.previousBundle = bundle;
      return null;
    }
    const plan = resolveRuntimeUpdatePlan(
      this.previousBundle,
      bundle,
      this.updateTier,
    );
    this.pendingPlan = plan;
    this.previousBundle = bundle;
    return plan;
  }

  private recomputeDerivedBundleState(): void {
    const map = new Map<string, Record<string, number>>();
    const poseConfig = this.assetBundle.pose?.config;
    if (poseConfig) {
      const posePaths = buildPoseWeightPathMap(
        poseConfig.poses ?? [],
        poseConfig.faceId ?? this.faceId ?? "face",
      );
      (poseConfig.poses ?? []).forEach((pose) => {
        const posePath = posePaths.get(pose.id);
        if (!posePath) {
          return;
        }
        const values = Object.fromEntries(
          Object.entries(pose.values ?? {}).filter(([, value]) =>
            Number.isFinite(value),
          ),
        ) as Record<string, number>;
        map.set(posePath, values);
      });
    }
    this.poseWeightFallbackMap = map;
    this.useLegacyPoseWeightFallback = shouldUseLegacyPoseWeightFallback(
      Boolean(this.assetBundle.pose?.graph),
    );
    this.resolvedProgramAssets =
      this.assetBundle.programs && this.assetBundle.programs.length > 0
        ? this.assetBundle.programs
        : convertBundlePrograms(this.assetBundle.bundle?.graphs);
  }

  // ==========================================================================
  // Status / errors
  // ==========================================================================

  private reportStatus(
    updater: (prev: VizijRuntimeStatus) => VizijRuntimeStatus,
  ): void {
    this.callbacks.onStatusPatch(updater);
  }

  pushError(error: RuntimeError): void {
    this.errors = [...this.errors, error];
    this.reportStatus((prev) => ({
      ...prev,
      error,
      errors: this.errors,
    }));
    console.warn("[vizij-runtime]", error.message, error.cause);
  }

  resetErrors(): void {
    this.errors = [];
    this.reportStatus((prev) => ({
      ...prev,
      error: null,
      errors: [],
    }));
  }

  // ==========================================================================
  // Loop-mode machine (the step DRIVER lives in the host; policy lives here)
  // ==========================================================================

  hasActiveAnimations(): boolean {
    if (this.animationTweens.size > 0) {
      return true;
    }
    if (!this.animationSystemActive) {
      for (const state of this.programPlayback.values()) {
        if (state.state === "playing") {
          return true;
        }
      }
      return false;
    }
    for (const state of this.clipPlayback.values()) {
      if (state.playing) {
        return true;
      }
    }
    for (const state of this.programPlayback.values()) {
      if (state.state === "playing") {
        return true;
      }
    }
    return false;
  }

  computeDesiredLoopMode(): LoopMode {
    const hasAnimations = this.hasActiveAnimations();
    const recentlyActive = now() - this.lastActivityTime <= ACTIVE_GRACE_MS;
    if (this.autostart && (hasAnimations || recentlyActive)) {
      return "active";
    }
    if (this.autostart) {
      return "idle-visible";
    }
    return "idle-hidden";
  }

  updateLoopMode(): void {
    this.callbacks.onLoopModeChange(this.computeDesiredLoopMode());
  }

  markActivity(): void {
    this.lastActivityTime = now();
    this.updateLoopMode();
  }

  // ==========================================================================
  // Inputs at canonical paths
  // ==========================================================================

  setInput(path: string, value: ValueJSON, shape?: ShapeJSON): void {
    const numericValue = valueAsNumber(value);
    const basePath = stripNamespace(normalisePath(path), this.namespace);
    const poseValues =
      this.useLegacyPoseWeightFallback && numericValue != null
        ? this.poseWeightFallbackMap.get(basePath)
        : undefined;
    if (poseValues && numericValue != null) {
      const poseFaceId =
        this.assetBundle.pose?.config?.faceId ?? this.faceId ?? "face";
      const rigMap = this.rigInputMap;
      Object.entries(poseValues).forEach(([inputId, poseValue]) => {
        if (!Number.isFinite(poseValue)) {
          return;
        }
        const controlPath =
          resolvePoseControlInputPath({
            inputId,
            basePath: buildRigInputPath(poseFaceId, `/pose/control/${inputId}`),
            rigInputPathMap: rigMap,
            hasNativePoseControlInput: true,
          }) ?? buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
        this.setInput(controlPath, { float: Number(poseValue) * numericValue });
      });
      return;
    }
    this.markActivity();
    const namespacedPath = namespaceTypedPath(path, this.namespace);
    if (
      isRuntimeDebugEnabled() &&
      (namespacedPath.includes("animation/authoring.timeline.main") ||
        namespacedPath.endsWith("/blink"))
    ) {
      console.log("[vizij-runtime] stage input", {
        path,
        namespacedPath,
        value,
      });
    }
    this.stagedInputs.set(namespacedPath, { value, shape });
  }

  /** The live device, or null before it boots. */
  private getDevice() {
    return this.deviceSlot.current?.device ?? null;
  }

  deviceSetInput(path: string, value: ValueJSON, _shape?: ShapeJSON): void {
    const handle = this.deviceSlot.current;
    if (handle) {
      handle.device.setValue(path, value);
    } else {
      this.pendingWrites.set(path, value);
    }
  }

  getPathSnapshot(path: string): ValueJSON | undefined {
    const handle = this.deviceSlot.current;
    if (!handle) {
      return this.pendingWrites.get(path);
    }
    return handle.device.readValues([path])[path] ?? undefined;
  }

  getStoreSnapshot(): Record<string, unknown> | undefined {
    const handle = this.deviceSlot.current;
    if (!handle) {
      return undefined;
    }
    return handle.device.snapshot() as Record<string, unknown>;
  }

  getInputConstraints(): InputConstraintsMap {
    return this.inputConstraints;
  }

  /** Recompute rig input constraints from the current bundle (host effect). */
  updateInputConstraints(): void {
    const rigAsset = this.assetBundle.rig;
    if (!rigAsset) {
      this.inputConstraints = {};
      this.callbacks.onInputConstraintsChange({});
      return;
    }
    const rigSpec = resolveGraphSpec(
      rigAsset,
      `${rigAsset.id ?? "rig"} graph (constraints)`,
    );
    const constraints = extractInputConstraints(
      rigSpec as GraphRegistrationConfig["spec"],
      rigAsset.inputMetadata,
      this.namespace,
    );
    this.inputConstraints = constraints;
    this.callbacks.onInputConstraintsChange(constraints);
  }

  // ==========================================================================
  // Engine / registration
  // ==========================================================================

  /** `ready` = wasm loaded; the device itself boots on first registration. */
  async initEngine(): Promise<void> {
    await ensureWasmInit();
    this.engineReady = true;
    this.callbacks.onEngineReady();
  }

  isEngineReady(): boolean {
    return this.engineReady;
  }

  /**
   * Load the animation module (idempotent) and arm the device slot with it:
   * every device the slot starts loads the module, and each fresh device
   * replays the host's setup calls (module guest state does not survive a
   * restart).
   */
  ensureAnimationModuleLoaded(): void {
    if (this.animationModule || this.animationModuleLoading) {
      return;
    }
    this.animationModuleLoading = true;
    const loading = loadAnimationModule()
      .then((module) => {
        this.animationModuleLoading = false;
        this.animationModule = module;
        this.deviceSlot.setModules([module]);
        this.deviceSlot.onDeviceStarted = (handle) => {
          this.animationHost?.replayInto(handle.device);
        };
        this.ensureAnimationHost();
      })
      .catch((err: unknown) => {
        this.animationModuleLoading = false;
        this.pushError({
          message: "Failed to load the animation module",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
    // Boots wait for the announced load, so the device is always built WITH
    // the module (a live device cannot load one).
    this.deviceSlot.waitForModules(loading);
  }

  private ensureAnimationHost(): AnimationModuleHost | null {
    if (!this.animationModule) {
      return null;
    }
    if (!this.animationHost) {
      // Clip conversion resolves each track's final store keys at LOAD time
      // (the same routing the JS pipeline used per tick), so the module's
      // outputs name the rig paths directly and the graph applies them.
      this.animationHost = new AnimationModuleHost(
        () => this.getDevice(),
        (key) =>
          resolveAnimationBridgeOutputPaths(
            key,
            this.faceId ?? undefined,
            this.rigInputMap,
          ),
      );
    }
    return this.animationHost;
  }

  private recomposeDevice(): void {
    const spec = composeGraphSpecs(this.graphSources);
    this.deviceSlot
      .recompose(spec)
      .then((handle) => {
        if (this.pendingWrites.size > 0) {
          handle.device.writeValues(Object.fromEntries(this.pendingWrites));
          this.pendingWrites.clear();
        }
      })
      .catch((err: unknown) => {
        this.pushError({
          message: "Failed to (re)compose the arora device",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
  }

  removeGraph(id: ControllerId): void {
    this.graphSources = this.graphSources.filter(
      (s) => s.sourceId !== id && !s.sourceId.startsWith(`${id}#`),
    );
    this.recomposeDevice();
  }

  registerGraph(cfg: GraphRegistrationConfig): string {
    const id = cfg.id ?? `graph-${this.graphSources.length}`;
    this.graphSources = [
      ...this.graphSources.filter((s) => s.sourceId !== id),
      { sourceId: id, spec: cfg.spec ?? {} },
    ];
    this.recomposeDevice();
    return id;
  }

  /**
   * A merged registration becomes one source per member graph under the
   * merged id (`id#member`); composition is last-writer-wins, so `strategy`
   * is accepted but unused (see utils/composeGraph.ts).
   */
  registerMergedGraph(cfg: {
    id?: string;
    graphs: GraphRegistrationConfig[];
    strategy?: MergeStrategyOptions;
  }): string {
    const id = cfg.id ?? `merged-${this.graphSources.length}`;
    const members = cfg.graphs.map((graph, index) => ({
      sourceId: `${id}#${graph.id ?? index}`,
      spec: graph.spec ?? {},
    }));
    this.graphSources = [
      ...this.graphSources.filter(
        (s) => s.sourceId !== id && !s.sourceId.startsWith(`${id}#`),
      ),
      ...members,
    ];
    this.recomposeDevice();
    return id;
  }

  registerAnimation(cfg: AnimationRegistrationConfig): string {
    return cfg.id ?? `animation-${this.registeredAnimations.length}`;
  }

  removeAnimation(_id: ControllerId): void {}

  /**
   * Compose (or drop) the single "animations" graph source, which makes the
   * animation module tick inside the device.
   */
  private setAnimationsSourceRegistered(registered: boolean): void {
    if (registered === this.animationsSourceRegistered) {
      return;
    }
    this.animationsSourceRegistered = registered;
    if (registered) {
      this.graphSources = [
        ...this.graphSources.filter(
          (s) => s.sourceId !== animationsGraphSource().sourceId,
        ),
        animationsGraphSource(),
      ];
    } else {
      this.graphSources = this.graphSources.filter(
        (s) => s.sourceId !== animationsGraphSource().sourceId,
      );
    }
    this.recomposeDevice();
  }

  listControllers(): { graphs: ControllerId[]; anims: ControllerId[] } {
    return {
      graphs: [...this.registeredGraphs],
      anims: [...this.registeredAnimations],
    };
  }

  clearControllers(): void {
    const existing = this.listControllers();
    existing.graphs.forEach((id: ControllerId) => {
      try {
        this.removeGraph(id);
      } catch (err: unknown) {
        this.pushError({
          message: `Failed to remove graph ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });
    existing.anims.forEach((id: ControllerId) => {
      try {
        this.removeAnimation(id);
      } catch (err: unknown) {
        this.pushError({
          message: `Failed to remove animation ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });
    this.registeredGraphs = [];
    this.registeredAnimations = [];
    this.programControllerIds.clear();
    this.mergedGraph = null;
    this.outputPaths = new Set();
    this.baseOutputPaths = new Set();
    this.namespacedOutputPaths = new Set();
    this.rigPoseControlInputIds = new Set();
  }

  /**
   * Register the bundle's rig/pose graphs (merged when both are present),
   * hand each clip's stored payload to the module host, stage initial inputs,
   * and report the controller/output-path status. Moved verbatim from the
   * provider's registerControllers.
   */
  async registerControllers(): Promise<void> {
    this.clearControllers();

    const assetBundle = this.assetBundle;
    const namespace = this.namespace;
    const faceId = this.faceId;

    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registerControllers", {
        hasRig: Boolean(assetBundle.rig),
        hasPose: Boolean(assetBundle.pose?.graph),
        animationCount: assetBundle.animations?.length ?? 0,
        animationIds: (assetBundle.animations ?? []).map((anim) => anim.id),
        namespace,
      });
    }

    const baseOutputPaths = new Set<string>();
    const namespacedOutputPaths = new Set<string>();
    const recordOutputs = (paths: string[]) => {
      paths.forEach((path) => {
        const trimmed = path.trim();
        if (!trimmed) return;
        const basePath = stripNamespace(trimmed, namespace);
        baseOutputPaths.add(basePath);
        namespacedOutputPaths.add(namespaceTypedPath(trimmed, namespace));
      });
    };

    const graphConfigs: GraphRegistrationConfig[] = [];
    this.rigInputMap = {};
    this.rigPoseControlInputIds = new Set();
    this.poseControlBridgeValues.clear();

    const rigAsset = assetBundle.rig;
    if (rigAsset) {
      const rigSpec = resolveGraphSpec(
        rigAsset,
        `${rigAsset.id ?? "rig"} graph`,
      );
      if (!rigSpec) {
        this.pushError({
          message: "Rig graph is missing a usable spec or IR payload.",
          phase: "registration",
          timestamp: performance.now(),
        });
      } else {
        const rigOutputs = collectOutputPaths(rigSpec);
        const rigInputs = collectInputPaths(rigSpec);
        const rigPoseControlInputIds = new Set<string>();
        rigInputs.forEach((path) => {
          const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
            path.trim(),
          );
          const inputId = (poseControlMatch?.[1] ?? "").trim();
          if (inputId.length > 0) {
            rigPoseControlInputIds.add(inputId);
          }
        });
        this.rigInputMap = collectInputPathMap(rigSpec);
        this.rigPoseControlInputIds = rigPoseControlInputIds;
        if (isRuntimeDebugEnabled()) {
          const blinkKeys = Object.keys(this.rigInputMap).filter((key) =>
            key.toLowerCase().includes("blink"),
          );
          const blinkMappings = blinkKeys
            .slice(0, 20)
            .map((key) => `${key} => ${this.rigInputMap[key] ?? "?"}`);
          console.log("[vizij-runtime] rig input map sample", {
            blink: this.rigInputMap["blink"] ?? null,
            blinkKeys: blinkKeys.slice(0, 12),
            blinkMappings: blinkMappings.join(" | "),
          });
        }
        recordOutputs(rigOutputs);

        const rigSubs = rigAsset.subscriptions ?? {
          inputs: rigInputs,
          outputs: rigOutputs,
        };

        graphConfigs.push({
          id: namespaceControllerId(rigAsset.id, namespace, "graph"),
          spec: stripNulls(namespaceGraphSpec(rigSpec, namespace)),
          subs: namespaceSubscriptions(rigSubs, namespace),
        });
      }
    }

    const poseGraphAsset = assetBundle.pose?.graph;
    if (poseGraphAsset) {
      const poseSpec = resolveGraphSpec(
        poseGraphAsset,
        `${poseGraphAsset.id ?? "pose"} graph`,
      );
      if (poseSpec) {
        const poseOutputs = collectOutputPaths(poseSpec);
        const poseInputs = collectInputPaths(poseSpec);
        recordOutputs(poseOutputs);

        const poseSubs = poseGraphAsset.subscriptions ?? {
          inputs: poseInputs,
          outputs: poseOutputs,
        };

        graphConfigs.push({
          id: namespaceControllerId(poseGraphAsset.id, namespace, "graph"),
          spec: stripNulls(namespaceGraphSpec(poseSpec, namespace)),
          subs: namespaceSubscriptions(poseSubs, namespace),
        });
      } else {
        console.warn(
          "[vizij-runtime] Pose graph is missing a usable spec or IR payload; skipping registration.",
        );
      }
    }

    for (const animation of assetBundle.animations ?? []) {
      const bridgeOutputs = collectAnimationClipOutputPaths(
        animation.clip as AnimationClipLike,
        faceId ?? undefined,
        this.rigInputMap,
      );
      if (isRuntimeDebugEnabled()) {
        console.log("[vizij-runtime] animation output routing", {
          animationId: animation.id,
          bridgeOutputs,
          bridgeOutputsText: bridgeOutputs.join(" | "),
        });
      }
      recordOutputs(bridgeOutputs);
    }

    for (const program of this.resolvedProgramAssets) {
      const programSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph (outputs)`,
      );
      if (!programSpec) {
        continue;
      }
      recordOutputs(collectOutputPaths(programSpec));
    }

    this.outputPaths = namespacedOutputPaths;
    this.baseOutputPaths = baseOutputPaths;
    this.namespacedOutputPaths = namespacedOutputPaths;

    const graphIds: string[] = [];

    try {
      if (graphConfigs.length > 1) {
        const mergedId = this.registerMergedGraph({
          id:
            namespaceControllerId(
              this.mergedGraph ?? `merged-${namespace}`,
              namespace,
              "merged",
            ) ?? undefined,
          graphs: graphConfigs,
          strategy: this.mergeStrategy ?? DEFAULT_MERGE,
        });
        this.mergedGraph = mergedId;
        graphIds.push(mergedId);
      } else {
        graphConfigs.forEach((cfg) => {
          const id = this.registerGraph(cfg);
          graphIds.push(id);
        });
      }
    } catch (err: unknown) {
      this.pushError({
        message: "Failed to register rig graphs",
        cause: err,
        phase: "registration",
        timestamp: performance.now(),
      });
    }

    this.registeredGraphs = graphIds;
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registered graph ids", graphIds);
    }

    const animationIds: string[] = [];
    const hostClips: Array<{ id: string; stored: StoredAnimationClipLike }> =
      [];
    for (const anim of assetBundle.animations ?? []) {
      try {
        const stored =
          (anim.setup?.animation as StoredAnimationClipLike | undefined) ??
          toStoredAnimationClip(anim.id, anim.clip as AnimationClipLike);
        hostClips.push({ id: anim.id, stored });
        this.registerAnimation({ id: anim.id });
        animationIds.push(anim.id);
      } catch (err: unknown) {
        if (isRuntimeDebugEnabled()) {
          console.warn("[vizij-runtime] failed animation registration", {
            animationId: anim.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        this.pushError({
          message: `Failed to register animation ${anim.id}`,
          cause: err,
          phase: "animation",
          timestamp: performance.now(),
        });
      }
    }
    this.ensureAnimationHost()?.setClips(hostClips);

    this.registeredAnimations = animationIds;

    if (assetBundle.initialInputs) {
      Object.entries(assetBundle.initialInputs).forEach(([path, value]) => {
        try {
          this.setInput(path, value);
        } catch (err: unknown) {
          this.pushError({
            message: `Failed to stage initial input ${path}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
      });
    }

    const controllers = this.listControllers();
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] controllers after register", {
        controllers,
        graphIds,
        animationIds,
      });
    }
    this.reportStatus((prev) => ({
      ...prev,
      ready: true,
      controllers,
      outputPaths: Array.from(this.outputPaths),
    }));
    this.callbacks.onRegisterControllers?.(controllers);
  }

  hasRegisteredControllers(): boolean {
    return (
      this.registeredGraphs.length > 0 ||
      this.registeredAnimations.length > 0 ||
      this.programControllerIds.size > 0
    );
  }

  // ==========================================================================
  // Step pipeline
  // ==========================================================================

  subscribeToStep(listener: () => void): () => void {
    const listeners = this.stepListeners;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  subscribeToStoreChanges(
    listener: (changes: Record<string, unknown>) => void,
  ): () => void {
    const listeners = this.storeChangeListeners;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * One tick: pull the changed keys off the device, hand them to the host's
   * applyEngineChanges, then fan them to store-change and step subscribers.
   * A device under its own `run()` loop is already stepping — only the drain
   * happens here; a manually driven one is stepped first (dt seconds → ms at
   * exactly this boundary).
   */
  private stepRuntime(dt: number): void {
    const handle = this.deviceSlot.current;
    if (!handle) {
      return;
    }
    if (!handle.device.running) {
      handle.device.step(dt * 1000);
    }
    const changes = handle.device.drainChanges() as Record<
      string,
      ValueJSON | null
    >;
    this.callbacks.applyEngineChanges(changes);
    if (this.storeChangeListeners.size > 0) {
      const paths = Object.keys(changes);
      if (paths.length > 0) {
        this.storeChangeListeners.forEach((listener) => {
          try {
            listener(changes);
          } catch (err) {
            console.error("[vizij-runtime] store-change listener error", err);
          }
        });
      }
    }
    this.stepListeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("[vizij-runtime] step listener error", err);
      }
    });
  }

  flushStagedInputs(): void {
    if (this.stagedInputs.size === 0) {
      return;
    }
    this.stagedInputs.forEach(({ value, shape }, path) => {
      this.deviceSetInput(path, value, shape);
    });
    this.stagedInputs.clear();
  }

  step(dt: number, opts?: { forceRuntime?: boolean }): void {
    if (dt > 0 && Number.isFinite(dt)) {
      const prev = this.avgStepDt ?? dt;
      const alpha = 0.1;
      this.avgStepDt = prev * (1 - alpha) + dt * alpha;
    }
    // Imperative value tweens (animateValue) stay JS-side — they are UI
    // value easings, not clips. Clip playback ticks INSIDE the device and
    // the graph applies the module's outputs onto the rig keys itself; the
    // pump advances tweens, flushes staged inputs, and settles play()
    // completions off the device feedback.
    this.advanceAnimationTweens(dt);
    this.flushStagedInputs();
    if (this.driveRuntime || opts?.forceRuntime) {
      this.stepRuntime(dt);
    }
    this.settleFinishedClips();
  }

  getAverageStepHz(): number | undefined {
    const avg = this.avgStepDt;
    return avg && Number.isFinite(avg) && avg > 0 ? 1 / avg : undefined;
  }

  // ==========================================================================
  // Pose / value tweens
  // ==========================================================================

  stagePoseNeutral(force = false): void {
    const neutral = this.assetBundle.pose?.config?.neutralInputs ?? {};
    const rigMap = this.rigInputMap;
    const staged = new Set<string>();
    Object.entries(neutral).forEach(([id, value]) => {
      const path = rigMap[id];
      if (!path) {
        return;
      }
      const include = this.assetBundle.pose?.stageNeutralFilter;
      if (include && !include(id, path)) {
        return;
      }
      this.setInput(path, { float: Number.isFinite(value) ? value : 0 });
      staged.add(path);
    });
    if (force) {
      Object.entries(rigMap).forEach(([id, path]) => {
        if (staged.has(path)) {
          return;
        }
        const include = this.assetBundle.pose?.stageNeutralFilter;
        if (include && !include(id, path)) {
          return;
        }
        this.setInput(path, { float: 0 });
      });
    }
  }

  cancelAnimation(path: string): void {
    if (this.animationTweens.has(path)) {
      const entry = this.animationTweens.get(path);
      this.animationTweens.delete(path);
      entry?.resolve();
    }
  }

  private advanceAnimationTweens(dt: number): void {
    if (this.animationTweens.size === 0) {
      return;
    }
    const map = this.animationTweens;
    const toDelete: string[] = [];
    map.forEach((state, key) => {
      state.elapsed += dt;
      const progress =
        state.duration === 0 ? 1 : Math.min(state.elapsed / state.duration, 1);
      const eased = state.easing(progress);
      const value = state.from + (state.to - state.from) * eased;
      this.setInput(state.path, { float: value });
      if (progress >= 1) {
        toDelete.push(key);
        state.resolve();
      }
    });
    toDelete.forEach((key) => map.delete(key));
  }

  animateValue(
    path: string,
    target: ValueJSON,
    options?: AnimateValueOptions,
  ): Promise<void> {
    const targetValue = valueAsNumber(target);
    const basePath = stripNamespace(normalisePath(path), this.namespace);
    const poseValues =
      this.useLegacyPoseWeightFallback && targetValue != null
        ? this.poseWeightFallbackMap.get(basePath)
        : undefined;
    if (poseValues && targetValue != null) {
      const poseFaceId =
        this.assetBundle.pose?.config?.faceId ?? this.faceId ?? "face";
      const rigMap = this.rigInputMap;
      return Promise.all(
        Object.entries(poseValues).flatMap(([inputId, poseValue]) => {
          if (!Number.isFinite(poseValue)) {
            return [];
          }
          const controlPath =
            resolvePoseControlInputPath({
              inputId,
              basePath: buildRigInputPath(
                poseFaceId,
                `/pose/control/${inputId}`,
              ),
              rigInputPathMap: rigMap,
              hasNativePoseControlInput: true,
            }) ?? buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
          return [
            this.animateValue(
              controlPath,
              { float: Number(poseValue) * targetValue },
              options,
            ),
          ];
        }),
      ).then(() => undefined);
    }
    const easing = resolveEasing(options?.easing);
    const duration = Math.max(0, options?.duration ?? DEFAULT_DURATION);
    this.cancelAnimation(path);

    const namespacedPath = namespaceTypedPath(path, this.namespace);
    const current = this.getPathSnapshot(namespacedPath);
    const fromValue = valueAsNumber(current);
    const toValue = valueAsNumber(target);

    if (fromValue == null || toValue == null || duration === 0) {
      this.setInput(path, target);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.animationTweens.set(path, {
        // Keep the raw path here so tween updates go through setInput() once
        // and pick up the active namespace exactly once.
        path,
        from: fromValue,
        to: toValue,
        duration,
        elapsed: 0,
        easing,
        resolve,
      });
      this.markActivity();
    });
  }

  // ==========================================================================
  // Clip transport (device-side playback via the animation module host)
  // ==========================================================================

  private resolveClipById(id: string): VizijAnimationAsset | undefined {
    return this.assetBundle.animations?.find((anim) => anim.id === id);
  }

  private resolveClipPromise(state: ClipPlaybackState): void {
    state.resolve?.();
    state.resolve = null;
    state.completion = null;
  }

  private ensureClipPromise(state: ClipPlaybackState): Promise<void> {
    if (state.completion) {
      return state.completion;
    }
    const completion = new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
    state.completion = completion;
    return completion;
  }

  private ensureClipState(
    id: string,
  ): { clip: VizijAnimationAsset; state: ClipPlaybackState } | null {
    const clip = this.resolveClipById(id);
    if (!clip) {
      return null;
    }
    const duration = resolveClipDurationSeconds(clip.clip as AnimationClipLike);
    const existing = this.clipPlayback.get(id);
    if (existing) {
      existing.duration = duration;
      return { clip, state: existing };
    }
    const state: ClipPlaybackState = {
      id,
      duration,
      speed: 1,
      weight: 1,
      loop: true,
      playing: false,
      resolve: null,
      completion: null,
    };
    this.clipPlayback.set(id, state);
    return { clip, state };
  }

  private warnAnimationGap(key: string, message: string): void {
    if (this.animationGapWarned.has(key)) {
      return;
    }
    this.animationGapWarned.add(key);
    console.warn(`[vizij-runtime] ${message}`);
  }

  private syncAnimationsSource(): void {
    const host = this.animationHost;
    this.setAnimationsSourceRegistered(host ? host.hasPlaying() : false);
    this.updateLoopMode();
  }

  /**
   * The module's live `[PlayerState]` feedback, read from the device store
   * (the animations source writes it each tick). Empty before the first
   * fed tick or without a device.
   */
  private readPlayerStates() {
    const device = this.deviceSlot.current?.device;
    if (!device) {
      return [] as ReturnType<typeof decodePlayerStates>;
    }
    const raw = device.readValues([ANIMATION_PLAYERS_PATH])[
      ANIMATION_PLAYERS_PATH
    ];
    return decodePlayerStates(raw);
  }

  /**
   * Resolve play() completions off the device feedback: a non-looping clip
   * completes when its player reports the playhead at the clip end (Once
   * clamps there) or stopped. Runs each pump step; reads the feedback only
   * while a non-looping completion is pending.
   */
  private settleFinishedClips(): void {
    let pending = false;
    this.clipPlayback.forEach((state) => {
      if (state.completion && !state.loop) {
        pending = true;
      }
    });
    const host = this.animationHost;
    if (!pending || !host) {
      return;
    }
    const states = this.readPlayerStates();
    if (states.length === 0) {
      return;
    }
    this.clipPlayback.forEach((state, id) => {
      if (!state.completion || state.loop) {
        return;
      }
      const playerId = host.playerIdOf(id);
      if (playerId === null) {
        return;
      }
      const feedback = states.find((entry) => entry.player === playerId);
      if (!feedback) {
        return;
      }
      const duration =
        feedback.duration > 0 ? feedback.duration : state.duration;
      const atEnd = duration > 0 && feedback.time >= duration - 1e-3;
      if (feedback.state === "stopped" || atEnd) {
        state.playing = false;
        this.resolveClipPromise(state);
        host.pause(id);
        this.syncAnimationsSource();
      }
    });
  }

  playAnimation(id: string, options?: PlayAnimationOptions): Promise<void> {
    const ensured = this.ensureClipState(id);
    if (!ensured) {
      return Promise.reject(
        new Error(`Animation ${id} is not part of the current asset bundle.`),
      );
    }
    const { state } = ensured;
    const host = this.ensureAnimationHost();

    state.speed = options?.speed ?? state.speed;
    state.weight = options?.weight ?? state.weight;
    state.playing = true;
    const completion = this.ensureClipPromise(state);
    this.clipPlayback.set(id, state);

    if (host) {
      // Transport rides the 0.2.0 module: reset is a real seek, and
      // speed/loop/weight apply to the live player (or at load, for a clip
      // entering the module now).
      if (options?.reset === true) {
        host.seek(id, 0);
      }
      host.setSpeed(id, state.speed);
      host.setWeight(id, state.weight);
      host.setLoop(id, state.loop ? "loop" : "once");
      void host.play(id).catch((err: unknown) => {
        this.pushError({
          message: `Failed to start animation ${id} on the device`,
          cause: err,
          phase: "animation",
          timestamp: performance.now(),
        });
      });
    } else {
      this.warnAnimationGap(
        "module-not-ready",
        "playAnimation called before the animation module finished loading; playback starts once it is ready.",
      );
    }
    this.syncAnimationsSource();
    this.markActivity();
    return completion;
  }

  pauseAnimation(id: string): void {
    const state = this.clipPlayback.get(id);
    if (!state || !state.playing) {
      return;
    }
    state.playing = false;
    // A real pause: the player holds its playhead. When no clip is left
    // playing the source unregisters too, freezing the last written pose.
    this.animationHost?.pause(id);
    this.syncAnimationsSource();
  }

  seekAnimation(id: string, timeSeconds: number): void {
    if (!this.clipPlayback.has(id)) {
      return;
    }
    this.animationHost?.seek(id, Math.max(0, timeSeconds));
  }

  setAnimationLoop(id: string, enabled: boolean): void {
    const ensured = this.ensureClipState(id);
    if (!ensured) {
      return;
    }
    ensured.state.loop = Boolean(enabled);
    this.animationHost?.setLoop(id, enabled ? "loop" : "once");
    this.updateLoopMode();
  }

  getAnimationState(id: string): AnimationPlaybackState | null {
    const state = this.clipPlayback.get(id);
    if (!state) {
      return null;
    }
    // The playhead, duration, and speed come from the module's
    // player_states feedback; the clip-derived duration and the commanded
    // state stand in until the first fed tick.
    const playerId = this.animationHost?.playerIdOf(id) ?? null;
    const feedback =
      playerId !== null
        ? this.readPlayerStates().find((entry) => entry.player === playerId)
        : undefined;
    return {
      time: feedback?.time ?? 0,
      duration:
        feedback && feedback.duration > 0 ? feedback.duration : state.duration,
      playing: feedback ? feedback.state === "playing" : state.playing,
      loop: state.loop,
      speed: feedback?.speed ?? state.speed,
    };
  }

  stopAnimation(id: string, options?: StopAnimationOptions): void {
    const state = this.clipPlayback.get(id);
    if (state) {
      this.clipPlayback.delete(id);
      state.playing = false;
      this.resolveClipPromise(state);
    }
    const host = this.animationHost;
    if (options?.clearOutputs === false) {
      // Hold the pose where it is; the playhead resets on the next play.
      host?.pause(id);
      this.syncAnimationsSource();
    } else {
      // Reset the player: the next module step emits the clip's t=0 pose
      // (its authored rest). The source stays composed for that one step —
      // it unregisters after the step that lands the reset.
      host?.stop(id);
      const unsubscribe = this.subscribeToStep(() => {
        unsubscribe();
        this.syncAnimationsSource();
      });
    }
  }

  // ==========================================================================
  // Program transport
  // ==========================================================================

  private refreshControllerStatus(): void {
    const controllers = this.listControllers();
    this.reportStatus((prev) => ({
      ...prev,
      controllers,
      outputPaths: Array.from(this.outputPaths),
    }));
    this.callbacks.onRegisterControllers?.(controllers);
  }

  private resolveProgramById(id: string): VizijProgramAsset | undefined {
    return this.resolvedProgramAssets.find((program) => program.id === id);
  }

  private buildProgramRegistrationConfig(
    program: VizijProgramAsset,
  ): GraphRegistrationConfig | null {
    const graphSpec = resolveGraphSpec(
      program.graph,
      `${program.id ?? "program"} graph`,
    );
    if (!graphSpec) {
      return null;
    }
    const outputs = collectOutputPaths(graphSpec);
    const inputs = collectInputPaths(graphSpec);
    const subs = program.graph.subscriptions ?? {
      inputs,
      outputs,
    };
    return {
      id: namespaceControllerId(program.id, this.namespace, "graph"),
      spec: stripNulls(namespaceGraphSpec(graphSpec, this.namespace)),
      subs: namespaceSubscriptions(subs, this.namespace),
    };
  }

  private deriveProgramResetValues(
    program: VizijProgramAsset,
  ): Array<{ path: string; value: number }> {
    if (program.resetValues) {
      return Object.entries(program.resetValues)
        .filter(([, value]) => Number.isFinite(value))
        .map(([path, value]) => ({ path, value }));
    }

    const graphSpec = resolveGraphSpec(
      program.graph,
      `${program.id ?? "program"} graph (reset)`,
    );
    if (!graphSpec) {
      return [];
    }

    return collectOutputPaths(graphSpec)
      .filter((path) => path.trim().length > 0)
      .map((path) => {
        const defaultValue = this.inputConstraints[path]?.defaultValue ?? 0;
        return {
          path,
          value:
            Number.isFinite(defaultValue) && defaultValue != null
              ? defaultValue
              : 0,
        };
      });
  }

  syncProgramPlaybackControllers(): void {
    if (!this.engineReady) {
      return;
    }

    const availableProgramIds = new Set(
      this.resolvedProgramAssets.map((program) => program.id),
    );

    Array.from(this.programPlayback.keys()).forEach((id) => {
      if (availableProgramIds.has(id)) {
        return;
      }
      this.programPlayback.delete(id);
      const controllerId = this.programControllerIds.get(id);
      if (controllerId) {
        try {
          this.removeGraph(controllerId);
        } catch (err: unknown) {
          this.pushError({
            message: `Failed to remove program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        this.programControllerIds.delete(id);
      }
    });

    this.programPlayback.forEach((state, id) => {
      const program = this.resolveProgramById(id);
      const controllerId = this.programControllerIds.get(id);

      if (!program) {
        return;
      }

      if (state.state !== "playing") {
        if (!controllerId) {
          return;
        }
        try {
          this.removeGraph(controllerId);
        } catch (err: unknown) {
          this.pushError({
            message: `Failed to pause program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        this.programControllerIds.delete(id);
        return;
      }

      if (controllerId) {
        return;
      }

      // Source per playing program: bundle `programs` (procedural graphs
      // started via the transport) and the authoring motiongraph, which
      // publishes the editor's graph as a program.
      const config = this.buildProgramRegistrationConfig(program);
      if (!config) {
        this.pushError({
          message: `Program ${id} is missing a usable graph payload.`,
          phase: "registration",
          timestamp: performance.now(),
        });
        return;
      }
      try {
        const nextControllerId = this.registerGraph(config);
        this.programControllerIds.set(id, nextControllerId);
      } catch (err: unknown) {
        this.pushError({
          message: `Failed to register program ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });

    this.refreshControllerStatus();
  }

  playProgram(id: string): void {
    const program = this.resolveProgramById(id);
    if (!program) {
      throw new Error(`Program ${id} is not part of the current asset bundle.`);
    }
    deriveProgramInputSeedValues({
      program,
      namespace: this.namespace,
      inputConstraints: this.inputConstraints,
      getPathSnapshot: (path: string) => this.getPathSnapshot(path),
      stagedInputs: this.stagedInputs,
    }).forEach(({ path, value }) => {
      this.setInput(path, value);
    });
    this.programPlayback.set(id, {
      id,
      state: "playing",
    });
    this.syncProgramPlaybackControllers();
    this.markActivity();
  }

  pauseProgram(id: string): void {
    if (!this.resolveProgramById(id)) {
      return;
    }
    this.programPlayback.set(id, {
      id,
      state: "paused",
    });
    this.syncProgramPlaybackControllers();
    this.updateLoopMode();
  }

  stopProgram(id: string, options?: StopProgramOptions): void {
    const program = this.resolveProgramById(id);
    const controllerId = this.programControllerIds.get(id);
    if (controllerId) {
      try {
        this.removeGraph(controllerId);
      } catch (err: unknown) {
        this.pushError({
          message: `Failed to stop program ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
      this.programControllerIds.delete(id);
    }
    this.programPlayback.set(id, {
      id,
      state: "stopped",
    });
    if (program && options?.resetOutputs !== false) {
      this.deriveProgramResetValues(program).forEach(({ path, value }) => {
        this.setInput(path, { float: value });
      });
    }
    this.refreshControllerStatus();
    this.updateLoopMode();
  }

  getProgramState(id: string): ProgramPlaybackState | null {
    const state = this.programPlayback.get(id);
    if (!state) {
      return null;
    }
    return { state: state.state };
  }

  // ==========================================================================
  // Misc surface
  // ==========================================================================

  setAnimationActive(active: boolean): void {
    const next = Boolean(active);
    if (this.animationSystemActive === next) {
      return;
    }
    this.animationSystemActive = next;
    if (!next) {
      this.clipPlayback.forEach((state) => {
        state.playing = false;
      });
    }
    this.updateLoopMode();
  }

  isAnimationActive(): boolean {
    return this.animationSystemActive;
  }

  registerInputDriver(
    id: string,
    factory: InputDriverFactory,
  ): InputDriverLifecycle {
    this.inputDriverIds.add(id);
    const driver = factory({
      setInput: (path, value, shape) => this.setInput(path, value, shape),
      setRendererValue: (rid, ns, value) =>
        this.callbacks.setRendererValue(rid, ns, value),
      namespace: this.namespace,
      faceId: this.faceId,
    });
    const wrapped: InputDriverLifecycle = {
      start: () => {
        try {
          driver.start();
        } catch (err: unknown) {
          this.pushError({
            message: `Input driver ${id} failed to start`,
            cause: err,
            phase: "driver",
            timestamp: performance.now(),
          });
        }
      },
      stop: () => {
        try {
          driver.stop();
        } catch (err: unknown) {
          this.pushError({
            message: `Input driver ${id} failed to stop`,
            cause: err,
            phase: "driver",
            timestamp: performance.now(),
          });
        }
      },
      dispose: () => {
        try {
          driver.dispose();
        } catch (err: unknown) {
          this.pushError({
            message: `Input driver ${id} failed to dispose`,
            cause: err,
            phase: "driver",
            timestamp: performance.now(),
          });
        } finally {
          this.inputDriverIds.delete(id);
        }
      },
    };
    return wrapped;
  }

  setGraphBundle(
    bundle: RuntimeGraphBundle,
    options?: { tier?: RuntimeUpdateTier },
  ): void {
    const baseAssetBundle = this.latestEffectiveAssetBundle ?? this.assetBundle;
    const nextAssetBundle = applyRuntimeGraphBundle(baseAssetBundle, bundle);

    const plan = resolveRuntimeUpdatePlan(
      baseAssetBundle,
      nextAssetBundle,
      options?.tier ?? this.updateTier,
    );
    this.pendingPlan = plan;
    this.previousBundle = nextAssetBundle;
    this.latestEffectiveAssetBundle = nextAssetBundle;
    this.suppressNextBundlePlan = true;
    this.callbacks.onGraphBundleApplied(nextAssetBundle, plan);
    if (plan.reloadAssets) {
      this.reportStatus((prev) => ({
        ...prev,
        loading: true,
        ready: false,
      }));
    } else {
      this.reportStatus((prev) => ({
        ...prev,
        loading: false,
      }));
    }
  }

  /** Debug counters for the host's memory-investigation telemetry. */
  getDebugCounts() {
    return {
      registeredGraphCount: this.registeredGraphs.length,
      registeredAnimationCount: this.registeredAnimations.length,
      programControllerCount: this.programControllerIds.size,
      animationTweenCount: this.animationTweens.size,
      clipPlaybackCount: this.clipPlayback.size,
      programPlaybackCount: this.programPlayback.size,
      stagedInputCount: this.stagedInputs.size,
      activeDriverCount: this.inputDriverIds.size,
    };
  }

  /**
   * Live references to the state the host's applyEngineChanges closure needs
   * (tracked-output filtering, the pose-control bridge, rig input routing).
   * Call per invocation — `rigInputMap` is reassigned on re-registration.
   */
  getEngineChangeContext() {
    return {
      rigInputMap: this.rigInputMap,
      rigPoseControlInputIds: this.rigPoseControlInputIds,
      namespacedOutputPaths: this.namespacedOutputPaths,
      baseOutputPaths: this.baseOutputPaths,
      poseControlBridgeValues: this.poseControlBridgeValues,
    };
  }

  /** Clear transient transport state (the provider's unmount cleanup). */
  disposeTransient(): void {
    this.animationTweens.clear();
    this.clipPlayback.clear();
    this.programPlayback.clear();
    this.programControllerIds.clear();
  }
}
