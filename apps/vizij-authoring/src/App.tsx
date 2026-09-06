import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { useDialogQueue } from "@vizij/authoring-shared";
import { loadGLTFFromBlobWithBundle, useVizijStore } from "@vizij/render";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import {
  useWorkspaceStore,
  type WorkspacePanelId,
} from "./state/workspaceStore";
import { AppMenuBar } from "./components/app/AppMenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import {
  VariablesPanel,
  type SurfaceTab,
} from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import {
  Viewer,
  type RuntimeExportBodiesSnapshot,
} from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { ReferenceFacePanel } from "./components/app/ReferenceFacePanel";
import { FaceLoadingProgressBar } from "./components/app/FaceLoadingProgressBar";
import { OrientationConfirmationDialog } from "./components/app/OrientationConfirmationDialog";
import {
  FACE_PRESET_GRID_OPTIONS,
  type FacePresetAssetOption,
} from "./components/app/facePresetAssets";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
import {
  buildCatalogFromInputPaths,
  computeInputRangeFit,
  dedupeImportedClips,
  describeRangeAdjustment,
  importGltfAnimations,
} from "./animationImport";
import { usePoseGraphImport } from "./hooks/usePoseGraphImport";
import { useBundleSynchronizer } from "./hooks/useBundleSynchronizer";
import { RegistryProvider } from "./motiongraph/contexts/RegistryProvider";
import {
  useEditorStore,
  type EditorEdge,
  type EditorNode,
} from "./motiongraph/store/useEditorStore";
import { buildGraphSpecForExport } from "./motiongraph/utils/buildGraphSpec";
import { specToEditorState } from "./motiongraph/utils/specToEditorState";
import {
  MotionGraphPanel,
  MotionGraphPalettePanel,
} from "./motiongraph/MotionGraphPanel";
import { AppWizards } from "./components/app/AppWizards";
import {
  RigControllerProvider,
  useBindingAuthoring,
  useGraphRuntime,
} from "./state/RigControllerProvider";
import {
  AuthoringUiProvider,
  useAuthoringUiActions,
  useAuthoringUiState,
  type EditFocus,
} from "./state/AuthoringUiProvider";
import { PoseRigProvider, usePoseRig } from "./state/PoseRigProvider";
import {
  InspectorPanel,
  type AnimationInspectorSelection,
  type ProgramInspectorSelection,
} from "./components/inspector/InspectorPanel";
import { SpeechPanel } from "./components/panels/SpeechPanel";
import type {
  BlendStageInspectorSelection,
  PoseGroupInspectorSelection,
} from "./types/poseGroupInspector";
import { ReferenceFaceProvider } from "./state/ReferenceFaceContext";
import { useReferenceFaceState } from "./hooks/useReferenceFaceState";
import { useUnifiedSelection } from "./hooks/useUnifiedSelection";
import { buildRuntimeBaseBundle } from "./utils/runtimeBundle";
import { useSharedVariableSync } from "./hooks/useSharedVariableSync";
import { useSessionResetEffect } from "./hooks/authoringSessionLifecycle";
import { SharedVariableSyncProvider } from "./state/SharedVariableSyncContext";
import { getVisibleVariablesSurfaces } from "./components/panels/variablesSurfaceOrder";
import {
  radiansToRoundedDegrees,
  resolveRootSceneRotationInputs,
  type RotationAxis,
} from "./components/app/importOrientation";
import { useAnimationStore } from "./state/animationStore";
import { bundleAnimationEntryToClipIr } from "./utils/animationClipCompiler";
import { useManagedTargetLifecycle } from "./hooks/useManagedTargetLifecycle";
import {
  buildGlbExportDirtySnapshot,
  useExportDirtyState,
} from "./hooks/useExportDirtyState";
import {
  embeddedProfileId,
  useStandardProfiles,
} from "./hooks/useStandardProfiles";
import { embeddedSkillId, useSkills } from "./hooks/useSkills";
import { carriedBundleGraphs } from "./hooks/useVizijExport";
import {
  getMemoryInvestigationFlags,
  updateMemoryDebugState,
} from "./debug/memoryInvestigation";
import { createEditFocusPanelVisibility } from "./state/editFocusPanels";
import {
  areActiveInspectorTargetsEqual,
  synchronizeActiveInspectorTarget,
  type ActiveInspectorTarget,
} from "./utils/inspectorSelection";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_CLIP_ID,
  type AnimationClipIR,
} from "./types/animationClipIr";
import { formatPlaybackClock } from "./utils/animationTimeDisplay";

const __DEV__ = process.env.NODE_ENV !== "production";
const AUTHORED_ANIMATION_TARGET_PREFIX = "authored-animation:";
const AUTHORED_PROCEDURAL_TARGET_PREFIX = "authored-procedural:";
const BUNDLE_ANIMATION_TARGET_PREFIX = "bundle-animation:";
const BUNDLE_PROCEDURAL_TARGET_PREFIX = "bundle-procedural:";
const EMPTY_INPUT_VALUES: Readonly<Record<string, number>> = Object.freeze({});

function bundleTargetValue(
  prefix: string,
  bundleSessionKey: string,
  index: number,
): string {
  return `${prefix}${bundleSessionKey}:${index}`;
}

function parseBundleTargetIndex(
  targetId: string,
  prefix: string,
): number | null {
  if (!targetId.startsWith(prefix)) {
    return null;
  }
  const raw = targetId.slice(prefix.length);
  const rawIndex = raw.split(":").pop() ?? raw;
  const index = Number.parseInt(rawIndex, 10);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

function createEmptyRuntimeExportBodiesSnapshot(): RuntimeExportBodiesSnapshot {
  return {
    rootFilteredBodies: [],
    anyBodies: [],
    runtimeRootId: null,
  };
}

function MemoryDebugBridge({ loader }: { loader: VizijAssetLoaderState }) {
  const memoryInvestigation = getMemoryInvestigationFlags();
  const authoringWorldEntryCount = useVizijStore(
    (state) => Object.keys(state.world).length,
  );
  const authoringAnimatableCount = useVizijStore(
    (state) => Object.keys(state.animatables).length,
  );
  const authoringValuesSize = useVizijStore((state) => state.values.size);
  const graphRuntimeDebug = useGraphRuntime(
    useShallow((state) => ({
      faceId: state.faceId,
      faceSegment: state.faceSegment,
      graphStatus: state.graphStatus,
      graphError: state.graphError,
      graphWarning: state.graphWarning ?? null,
      graphPlaybackState: state.graphPlaybackState,
      graphPlaybackAvailable: state.graphPlaybackAvailable,
      graphFrameRate: state.graphFrameRate,
      graphTimeSeconds: state.graphTimeSeconds,
      runtimeViewReady: state.runtimeViewReady,
      runtimeViewLoading: state.runtimeViewLoading,
      runtimeViewRootId: state.runtimeViewRootId,
      runtimeViewGraphCount: state.runtimeViewGraphCount,
      runtimeViewOutputCount: state.runtimeViewOutputCount,
      worldEntryCount: Object.keys(state.world).length,
      animatableCount: Object.keys(state.animatables).length,
      valuesSize: state.values.size,
    })),
  );

  useEffect(() => {
    if (!memoryInvestigation.enabled) {
      return;
    }
    updateMemoryDebugState((state) => {
      state.authoring = {
        rootId: loader.rootId,
        sourceName: loader.sourceName,
        isLoading: loader.isLoading,
        error: loader.error,
        bundlePresent: loader.bundle !== null,
        exportSceneRootPresent: loader.exportSceneRoot !== null,
        worldEntryCount: authoringWorldEntryCount,
        animatableCount: authoringAnimatableCount,
        valuesSize: authoringValuesSize,
        faceLoadProgress: loader.faceLoadProgress,
        isImportFlowActive: loader.isImportFlowActive,
        faceLoadSourceLabel: loader.faceLoadSourceLabel,
        faceLoadSessionToken: loader.faceLoadSessionToken,
        faceLoadSessionStartedAtMs: loader.faceLoadSessionStartedAtMs,
        faceLoadSessionCompletedAtMs: loader.faceLoadSessionCompletedAtMs,
        faceLoadInFlightOperationCount: loader.faceLoadInFlightOperationCount,
        faceLoadLastOperationUpdateAtMs: loader.faceLoadLastOperationUpdateAtMs,
        faceLoadMilestones: { ...loader.faceLoadMilestones },
      };
      state.graphRuntime = { ...graphRuntimeDebug };
    });
  }, [
    authoringAnimatableCount,
    authoringValuesSize,
    authoringWorldEntryCount,
    graphRuntimeDebug,
    loader.bundle,
    loader.error,
    loader.exportSceneRoot,
    loader.faceLoadInFlightOperationCount,
    loader.faceLoadLastOperationUpdateAtMs,
    loader.faceLoadMilestones,
    loader.faceLoadProgress,
    loader.faceLoadSessionCompletedAtMs,
    loader.faceLoadSessionStartedAtMs,
    loader.faceLoadSessionToken,
    loader.faceLoadSourceLabel,
    loader.isImportFlowActive,
    loader.isLoading,
    loader.rootId,
    loader.sourceName,
    memoryInvestigation.enabled,
  ]);

  return null;
}

const QUARTER_TURN_RADIANS = Math.PI / 2;
const UNKNOWN_FACE_LOAD_STEP_WEIGHT = 6;
const FACE_LOAD_STEP_WEIGHTS: Readonly<Record<string, number>> = Object.freeze({
  "select-import-source": 0,
  "load-asset": 18,
  "validate-root": 6,
  "reset-state": 6,
  "mount-runtime": 8,
  "finalize-load": 8,
  "bundle-sync": 16,
  "rig-import-normalization": 14,
  "pose-graph-bootstrap": 10,
  "runtime-stabilization": 10,
});

interface AuthoredAnimationTarget {
  targetId: string;
  clipId: string;
  name: string;
  clip: AnimationClipIR;
}

interface ProceduralProgramSnapshot {
  nodes: EditorNode[];
  edges: EditorEdge[];
  enabledOutputs: string[];
  enabledInputs: string[];
  customInputPaths: string[];
}

interface AuthoredProceduralTarget {
  targetId: string;
  programId: string;
  name: string;
  snapshot: ProceduralProgramSnapshot;
}

interface AuthoredMotionGraphExportEntry {
  id: string;
  label: string;
  spec: { nodes: unknown[]; edges: unknown[] };
}

type RuntimePlaybackState = "playing" | "paused" | "stopped";

interface AnimationTargetPlaybackStatus {
  state: RuntimePlaybackState;
  timeLabel: string | null;
}

interface ProgramTargetPlaybackStatus {
  state: RuntimePlaybackState;
}

interface MotionGraphRuntimeResetEntry {
  path: string;
  value: number;
}

function authoredAnimationTargetValue(clipId: string): string {
  return `${AUTHORED_ANIMATION_TARGET_PREFIX}${clipId}`;
}

function parseAuthoredAnimationTargetValue(
  targetId: string | null | undefined,
): string | null {
  if (
    typeof targetId !== "string" ||
    !targetId.startsWith(AUTHORED_ANIMATION_TARGET_PREFIX)
  ) {
    return null;
  }
  const clipId = targetId.slice(AUTHORED_ANIMATION_TARGET_PREFIX.length).trim();
  return clipId.length > 0 ? clipId : null;
}

function createEmptyAnimationClip(
  clipId: string,
  name: string,
  duration = 10,
): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: clipId,
    name,
    duration,
    tracks: [],
  };
}

function motionGraphRuntimeControllerId(targetId: string): string {
  return `motiongraph-runtime:${encodeURIComponent(targetId)}`;
}

function createAuthoredAnimationTarget(
  clipId: string,
  name: string,
  duration = 10,
): AuthoredAnimationTarget {
  return {
    targetId: authoredAnimationTargetValue(clipId),
    clipId,
    name,
    clip: createEmptyAnimationClip(clipId, name, duration),
  };
}

function stableValueFingerprint(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Next free ordinal for an `authoring.timeline.clip.N` id.
 *
 * Must be given **every** clip id already in play, not just the authored
 * targets'. Imported bundle clips use the same id scheme — they were exported
 * from this app — so scanning authored targets alone hands the next authored
 * clip an id an imported clip already owns. Two targets then share a clip id,
 * and because clip id is the identity everywhere downstream, that single
 * collision:
 *
 * - lets `saveAnimationTarget`'s `clipId` match resolve to the wrong target,
 * - makes the two indistinguishable to the store's hydration marker, so one
 *   clip's tracks get written into the other,
 * - and collapses them into one entry on export, which is dropped animations.
 */
export function nextAuthoredAnimationClipOrdinal(
  existingClipIds: Iterable<string>,
): number {
  const prefix = "authoring.timeline.clip.";
  let maxOrdinal = 0;
  for (const clipId of existingClipIds) {
    if (typeof clipId !== "string" || !clipId.startsWith(prefix)) {
      continue;
    }
    const parsed = Number.parseInt(clipId.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > maxOrdinal) {
      maxOrdinal = parsed;
    }
  }
  return maxOrdinal + 1;
}

function authoredProceduralTargetValue(programId: string): string {
  return `${AUTHORED_PROCEDURAL_TARGET_PREFIX}${programId}`;
}

function parseAuthoredProceduralTargetValue(
  targetId: string | null | undefined,
): string | null {
  if (
    typeof targetId !== "string" ||
    !targetId.startsWith(AUTHORED_PROCEDURAL_TARGET_PREFIX)
  ) {
    return null;
  }
  const programId = targetId
    .slice(AUTHORED_PROCEDURAL_TARGET_PREFIX.length)
    .trim();
  return programId.length > 0 ? programId : null;
}

function createEmptyProceduralSnapshot(): ProceduralProgramSnapshot {
  return {
    nodes: [],
    edges: [],
    enabledOutputs: [],
    enabledInputs: [],
    customInputPaths: [],
  };
}

function createAuthoredProceduralTarget(
  programId: string,
  name: string,
): AuthoredProceduralTarget {
  return {
    targetId: authoredProceduralTargetValue(programId),
    programId,
    name,
    snapshot: createEmptyProceduralSnapshot(),
  };
}

function nextAuthoredProceduralProgramOrdinal(
  targets: readonly AuthoredProceduralTarget[],
): number {
  const prefix = "authoring.motiongraph.program.";
  let maxOrdinal = 0;
  targets.forEach((target) => {
    if (!target.programId.startsWith(prefix)) {
      return;
    }
    const raw = target.programId.slice(prefix.length);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > maxOrdinal) {
      maxOrdinal = parsed;
    }
  });
  return maxOrdinal + 1;
}

function snapshotProceduralEditorState(): ProceduralProgramSnapshot {
  const editorState = useEditorStore.getState();
  return {
    nodes: structuredClone(editorState.nodes),
    edges: structuredClone(editorState.edges),
    enabledOutputs: Array.from(editorState.enabledOutputs),
    enabledInputs: Array.from(editorState.enabledInputs),
    customInputPaths: [...editorState.customInputPaths],
  };
}

function hydrateProceduralEditorState(
  snapshot: ProceduralProgramSnapshot,
): void {
  const store = useEditorStore.getState();
  store.hydrate(
    structuredClone(snapshot.nodes),
    structuredClone(snapshot.edges),
    new Set(snapshot.enabledOutputs),
    new Set(snapshot.enabledInputs),
    [...snapshot.customInputPaths],
  );
}

function buildProceduralExportSpec(snapshot: ProceduralProgramSnapshot): {
  nodes: unknown[];
  edges: unknown[];
} {
  return buildGraphSpecForExport(snapshot.nodes, snapshot.edges) as {
    nodes: unknown[];
    edges: unknown[];
  };
}

function resolveStandardInputForRuntimePath(
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>,
  rawPath: string,
): StandardRigInput | null {
  const normalizedPath = normalizeStandardRigInputPath(rawPath);
  return (
    standardInputsByPath.get(normalizedPath) ??
    standardInputsByPath.get(normalizedPath.replace(/^\/rig\/[^/]+\//, "/")) ??
    null
  );
}

type VizijAssetLoaderState = ReturnType<typeof useVizijAssetLoader>;
type FaceLoadPhaseChange = Parameters<
  VizijAssetLoaderState["updateExternalPhase"]
>[0];
type FaceLoadStep = VizijAssetLoaderState["faceLoadSteps"][number];

function statusProgress(status: FaceLoadStep["status"]): number {
  switch (status) {
    case "complete":
    case "error":
      return 1;
    case "active":
      return 0.45;
    case "pending":
    default:
      return 0;
  }
}

function stepProgress(step: FaceLoadStep): number {
  if (step.status === "complete" || step.status === "error") {
    return 1;
  }
  if (step.substeps.length === 0) {
    return statusProgress(step.status);
  }
  const substepAverage =
    step.substeps.reduce(
      (sum, substep) => sum + statusProgress(substep.status),
      0,
    ) / step.substeps.length;
  if (step.status === "active") {
    return Math.max(0.12, substepAverage);
  }
  return substepAverage;
}

function computeWeightedFaceLoadProgress(steps: FaceLoadStep[]): number {
  if (steps.length === 0) {
    return 0;
  }
  let weightedProgress = 0;
  let totalWeight = 0;
  steps.forEach((step) => {
    const weight =
      FACE_LOAD_STEP_WEIGHTS[step.id] ?? UNKNOWN_FACE_LOAD_STEP_WEIGHT;
    totalWeight += weight;
    weightedProgress += stepProgress(step) * weight;
  });
  if (totalWeight <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, weightedProgress / totalWeight));
}

type CenterAuthoringMode =
  | "procedural-animation-programming"
  | "animation"
  | "reference-face"
  | "none";
type AuthoringSurface = Extract<
  SurfaceTab,
  "variables" | "poses" | "pose-groups" | "animations" | "programs"
>;

function applyEditFocusPanelDefaults(
  focus: EditFocus,
  setPanelVisibility: (panelId: WorkspacePanelId, isVisible: boolean) => void,
): void {
  const nextVisibility = createEditFocusPanelVisibility(focus);
  (Object.keys(nextVisibility) as WorkspacePanelId[]).forEach(
    (panelId: WorkspacePanelId) => {
      setPanelVisibility(panelId, nextVisibility[panelId]);
    },
  );
}

export default function App() {
  const assetLoader = useVizijAssetLoader();
  const updateFaceLoadPhase = useCallback(
    (update: FaceLoadPhaseChange) => {
      const sessionToken = assetLoader.faceLoadSessionToken;
      const operationId =
        update.operationId ??
        (update.substepId ? `${update.stepId}:${update.substepId}` : undefined);
      assetLoader.updateExternalPhase({
        ...update,
        sessionToken,
        operationId,
      });
      if (update.stepId === "bundle-sync" && update.status === "complete") {
        assetLoader.markFaceLoadMilestone("bundle-synced", {
          sessionToken,
        });
      }
      if (
        update.stepId === "runtime-stabilization" &&
        update.substepId === "settle-recompiles" &&
        update.status === "complete" &&
        assetLoader.faceLoadMilestones["bundle-synced"] !== null
      ) {
        assetLoader.markFaceLoadMilestone("graph-ready", {
          sessionToken,
        });
      }
    },
    [
      assetLoader.faceLoadSessionToken,
      assetLoader.faceLoadMilestones,
      assetLoader.markFaceLoadMilestone,
      assetLoader.updateExternalPhase,
    ],
  );

  return (
    <RigControllerProvider
      namespace={DEFAULT_NAMESPACE}
      rootId={assetLoader.rootId}
      sourceName={assetLoader.sourceName}
      onLoadPhaseChange={updateFaceLoadPhase}
    >
      <PoseRigProvider
        rootId={assetLoader.rootId}
        onLoadPhaseChange={updateFaceLoadPhase}
      >
        <AuthoringUiProvider>
          <RegistryProvider>
            <AppContent
              loader={assetLoader}
              onFaceLoadPhaseChange={updateFaceLoadPhase}
            />
          </RegistryProvider>
        </AuthoringUiProvider>
      </PoseRigProvider>
    </RigControllerProvider>
  );
}

interface AppContentProps {
  loader: VizijAssetLoaderState;
  onFaceLoadPhaseChange: (update: FaceLoadPhaseChange) => void;
}

function AppContent({ loader, onFaceLoadPhaseChange }: AppContentProps) {
  const {
    rootId,
    sourceName,
    isLoading,
    exportSceneRoot,
    faceLoadSessionToken,
    faceLoadMilestones,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    markFaceLoadMilestone,
    loadFromFile,
    bundle: loadedBundle,
    beginImportFlow,
    markImportFileSelected,
    markImportFlowError,
    completeImportFlow,
  } = loader;
  const memoryInvestigation = getMemoryInvestigationFlags();
  const runtimeInvestigationBypassed =
    memoryInvestigation.enabled && !memoryInvestigation.mainRuntimeEnabled;

  // Highlighting State (moved from Viewer)
  const [showSelectionGlow, setShowSelectionGlow] = useState(true);

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [runtimeExportBodies, setRuntimeExportBodies] =
    useState<RuntimeExportBodiesSnapshot>(
      createEmptyRuntimeExportBodiesSnapshot,
    );
  const [selectedPoseGroup, setSelectedPoseGroup] =
    useState<PoseGroupInspectorSelection | null>(null);
  const [selectedBlendStage, setSelectedBlendStage] =
    useState<BlendStageInspectorSelection | null>(null);
  const [showOrientationDialog, setShowOrientationDialog] = useState(false);
  const [orientationPromptSessionToken, setOrientationPromptSessionToken] =
    useState<string | null>(null);
  const exportGlbHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const pendingMainAssetFetchRef = useRef<AbortController | null>(null);
  const setWorkspacePanelVisibility = useWorkspaceStore(
    (state) => state.setPanelVisibility,
  );

  const cancelPendingMainAssetFetch = useCallback(() => {
    pendingMainAssetFetchRef.current?.abort();
    pendingMainAssetFetchRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelPendingMainAssetFetch();
    },
    [cancelPendingMainAssetFetch],
  );

  /**
   * GLB awaiting automatic animation import, captured when a face starts
   * loading and consumed once that face's inputs exist.
   */
  const pendingAnimationImportRef = useRef<{
    glb: ArrayBuffer;
    fileName: string;
  } | null>(null);

  const capturePendingAnimationImport = useCallback(async (file: File) => {
    try {
      pendingAnimationImportRef.current = {
        glb: await file.arrayBuffer(),
        fileName: file.name,
      };
    } catch {
      // Import is a convenience on top of the face load; never let it break one.
      pendingAnimationImportRef.current = null;
    }
  }, []);

  // Reference Face State

  const handleLoadAssetFromUrl = useCallback(
    async (url: string, filename: string) => {
      const sessionToken = beginImportFlow(`Preset: ${filename}`);
      cancelPendingMainAssetFetch();
      const controller = new AbortController();
      pendingMainAssetFetchRef.current = controller;
      try {
        markImportFileSelected({ sessionToken });
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Failed to fetch ${url} `);
        const blob = await response.blob();
        if (controller.signal.aborted) {
          return;
        }
        const file = new File([blob], filename, { type: "model/gltf-binary" });

        await capturePendingAnimationImport(file);
        await loadFromFile(
          file,
          () => loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
          { sessionToken },
        );
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        markImportFlowError("load-asset", { sessionToken });
        console.error("Failed to load asset from URL:", err);
      } finally {
        if (pendingMainAssetFetchRef.current === controller) {
          pendingMainAssetFetchRef.current = null;
        }
      }
    },
    [
      beginImportFlow,
      cancelPendingMainAssetFetch,
      capturePendingAnimationImport,
      loadFromFile,
      markImportFlowError,
      markImportFileSelected,
    ],
  );

  const handleLoadQuori = useCallback(() => {
    handleLoadAssetFromUrl(
      "/assets/Quori_Current_Extended.glb",
      "Quori_Current_Extended.glb",
    );
  }, [handleLoadAssetFromUrl]);

  const handleLoadPresetAsset = useCallback(
    (preset: FacePresetAssetOption) => {
      if (!preset.available) {
        return;
      }
      handleLoadAssetFromUrl(preset.url, preset.filename);
    },
    [handleLoadAssetFromUrl],
  );

  const referenceFaceContextValue = useReferenceFaceState();
  const sharedVariableSyncEnabled =
    referenceFaceContextValue.standardInputs.length > 0;
  const [mainRuntimeInputsById, setMainRuntimeInputsById] = useState<
    Map<string, StandardRigInput>
  >(new Map());
  const mainFaceHandleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const mainFaceInputValues = useBindingAuthoring((state) =>
    sharedVariableSyncEnabled ? state.inputValues : EMPTY_INPUT_VALUES,
  );
  const mainFaceInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const mirrorableMainInputsById = useMemo(() => {
    if (mainRuntimeInputsById.size === 0) {
      return mainFaceInputsById;
    }
    const merged = new Map(mainRuntimeInputsById);
    mainFaceInputsById.forEach((input, inputId) => {
      merged.set(inputId, input);
    });
    return merged;
  }, [mainFaceInputsById, mainRuntimeInputsById]);
  const handleMainRuntimeInputsReady = useCallback(
    (_inputs: StandardRigInput[], byId: Map<string, StandardRigInput>) => {
      setMainRuntimeInputsById(new Map(byId));
    },
    [],
  );

  // Graph Runtime Hook
  const faceSegment = useGraphRuntime((state) => state.faceSegment);
  const graphStatus = useGraphRuntime((state) => state.graphStatus);
  const graphError = useGraphRuntime((state) => state.graphError);
  const stageRuntimeInput = useGraphRuntime((state) => state.stageRuntimeInput);
  const runtimeViewReady = useGraphRuntime((state) => state.runtimeViewReady);
  const runtimeViewLoading = useGraphRuntime(
    (state) => state.runtimeViewLoading,
  );
  const runtimeViewRootId = useGraphRuntime((state) => state.runtimeViewRootId);
  const runtimeViewGraphCount = useGraphRuntime(
    (state) => state.runtimeViewGraphCount,
  );
  const runtimeWorld = useVizijStore((state) => state.world);
  const runtimeAnimatables = useVizijStore((state) => state.animatables);

  const [viewerSplitVertical, setViewerSplitVertical] = useState(false);
  const [motionGraphSplitVertical, setMotionGraphSplitVertical] =
    useState(false);
  const [authoredAnimationTargets, setAuthoredAnimationTargets] = useState<
    AuthoredAnimationTarget[]
  >([]);
  const [selectedAnimationTargetId, setSelectedAnimationTargetId] = useState<
    string | null
  >(null);
  const [activeAnimationRuntimeTargetId, setActiveAnimationRuntimeTargetId] =
    useState<string | null>(null);
  const [
    pendingAnimationRuntimePlayTargetId,
    setPendingAnimationRuntimePlayTargetId,
  ] = useState<string | null>(null);
  const [pendingAnimationTargetSwitchId, setPendingAnimationTargetSwitchId] =
    useState<string | null>(null);
  const [activeAuthoringSurface, setActiveAuthoringSurface] =
    useState<AuthoringSurface>("variables");
  const [authoredProceduralTargets, setAuthoredProceduralTargets] = useState<
    AuthoredProceduralTarget[]
  >([]);
  const [bundleAnimationNameOverrides, setBundleAnimationNameOverrides] =
    useState<Record<string, string>>({});
  const [
    bundleAnimationDurationOverrides,
    setBundleAnimationDurationOverrides,
  ] = useState<Record<string, number>>({});
  const [bundleAnimationClipOverrides, setBundleAnimationClipOverrides] =
    useState<Record<string, AnimationClipIR>>({});
  const [bundleProceduralNameOverrides, setBundleProceduralNameOverrides] =
    useState<Record<string, string>>({});
  const [
    bundleProceduralSnapshotOverrides,
    setBundleProceduralSnapshotOverrides,
  ] = useState<Record<string, ProceduralProgramSnapshot>>({});
  // The standard profile whose graph currently owns the motiongraph editor
  // (VIZ-93 edit session), `null` outside a session. While set, the
  // procedural target machinery must neither hydrate over the profile's
  // content nor snapshot it into a program — see the guards in
  // `saveProceduralTarget` and `loadSelectedProceduralTarget`.
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const editingProfileIdRef = useRef<string | null>(null);
  editingProfileIdRef.current = editingProfileId;
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const editingSkillIdRef = useRef<string | null>(null);
  editingSkillIdRef.current = editingSkillId;
  const [hiddenBundleAnimationTargetIds, setHiddenBundleAnimationTargetIds] =
    useState<Record<string, true>>({});
  const [hiddenBundleProceduralTargetIds, setHiddenBundleProceduralTargetIds] =
    useState<Record<string, true>>({});
  const [selectedProceduralTargetId, setSelectedProceduralTargetId] = useState<
    string | null
  >(null);
  const [activeInspectorTarget, setActiveInspectorTarget] =
    useState<ActiveInspectorTarget | null>(null);
  const [activeProgramRuntimeTargetId, setActiveProgramRuntimeTargetId] =
    useState<string | null>(null);
  const [programRuntimePlaybackState, setProgramRuntimePlaybackState] =
    useState<RuntimePlaybackState>("stopped");
  const handleRuntimeExportBodiesChange = useCallback(
    (next: RuntimeExportBodiesSnapshot) => {
      setRuntimeExportBodies((previous) => {
        const sameRootFiltered =
          previous.rootFilteredBodies.length ===
            next.rootFilteredBodies.length &&
          previous.rootFilteredBodies.every(
            (body, index) => body === next.rootFilteredBodies[index],
          );
        const sameAny =
          previous.anyBodies.length === next.anyBodies.length &&
          previous.anyBodies.every(
            (body, index) => body === next.anyBodies[index],
          );
        if (
          previous.runtimeRootId === next.runtimeRootId &&
          sameRootFiltered &&
          sameAny
        ) {
          return previous;
        }
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    setRuntimeExportBodies(createEmptyRuntimeExportBodiesSnapshot());
  }, [rootId]);
  useEffect(() => {
    setBundleAnimationNameOverrides({});
    setBundleAnimationDurationOverrides({});
    setBundleAnimationClipOverrides({});
    setBundleProceduralNameOverrides({});
    setBundleProceduralSnapshotOverrides({});
    setHiddenBundleAnimationTargetIds({});
    setHiddenBundleProceduralTargetIds({});
  }, [rootId]);

  const canExport = Boolean(rootId) && !isLoading;

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const standardInputs = useBindingAuthoring((state) => state.standardInputs);
  const bindings = useBindingAuthoring((state) => state.bindings);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const animatableComponents = useBindingAuthoring(
    (state) => state.animatableComponents,
  );
  const animatableComponentCount = useBindingAuthoring(
    (state) => state.animatableComponents.length,
  );
  const featureLabelOverrides = useBindingAuthoring(
    (state) => state.featureLabelOverrides,
  );
  const pipelineMetadataV1 = useBindingAuthoring(
    (state) => state.pipelineMetadataV1,
  );
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const rigOutputLookup = useBindingAuthoring((state) => state.rigOutputLookup);
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleMigrateAllLegacyBindings = useBindingAuthoring(
    (state) => state.handleMigrateAllLegacyBindings,
  );

  const uiState = useAuthoringUiState();
  const uiActions = useAuthoringUiActions();

  const {
    activeWorkbench,
    includeVizijBundle,
    includeImportedAnimations,
    skipDiscrepancyCheck,
    activeEditFocus,
    rotationDisplayMode,
  } = uiState;

  const poseRig = usePoseRig();
  const importAnimationClipIr = useAnimationStore(
    (state) => state.importClipIr,
  );
  const exportAnimationClipIr = useAnimationStore(
    (state) => state.exportClipIr,
  );
  const animationTracks = useAnimationStore((state) => state.tracks);
  const animationPlaybackState = useAnimationStore(
    (state) => state.transportPlaybackState,
  );
  const animationRuntimeTransportAdapter = useAnimationStore(
    (state) => state.runtimeTransportAdapter,
  );
  const animationTransportSessionKey = useAnimationStore(
    (state) => state.transportSessionKey,
  );
  const animationTransportRuntimeReady = useAnimationStore(
    (state) => state.transportRuntimeReady,
  );
  const advanceAnimationTransportSessionKey = useAnimationStore(
    (state) => state.advanceTransportSessionKey,
  );
  const stopAnimationTransportState = useAnimationStore((state) => state.stop);
  const selectedAnimationTrackId = useAnimationStore(
    (state) => state.selectedTrackId,
  );
  const selectAnimationTrack = useAnimationStore((state) => state.selectTrack);
  const selectAnimationKeyframe = useAnimationStore(
    (state) => state.selectKeyframe,
  );
  const animationDuration = useAnimationStore((state) => state.duration);
  const animationCurrentTime = useAnimationStore((state) => state.currentTime);
  const animationTimeDisplayMode = useAnimationStore(
    (state) => state.timeDisplayMode,
  );
  const animationLoopEnabled = useAnimationStore((state) => state.loop);
  const animationPlaySpeed = useAnimationStore((state) => state.playSpeed);
  const setAnimationDuration = useAnimationStore((state) => state.setDuration);
  const openInspectorForTarget = useCallback(
    (target: ActiveInspectorTarget) => {
      setWorkspacePanelVisibility("inspector", true);
      setActiveInspectorTarget((previous) =>
        areActiveInspectorTargetsEqual(previous, target) ? previous : target,
      );
    },
    [setWorkspacePanelVisibility],
  );
  const proceduralEditorNodes = useEditorStore((state) => state.nodes);
  const proceduralEditorEdges = useEditorStore((state) => state.edges);
  const proceduralEditorEnabledOutputs = useEditorStore(
    (state) => state.enabledOutputs,
  );
  const proceduralEditorEnabledInputs = useEditorStore(
    (state) => state.enabledInputs,
  );
  const proceduralEditorCustomInputPaths = useEditorStore(
    (state) => state.customInputPaths,
  );

  const { alert: showAlert } = useDialogQueue();

  useEffect(() => {
    uiActions.setIncludeVizijBundle(true);
    const animationCount = loadedBundle?.animations?.length ?? 0;
    uiActions.setIncludeImportedAnimations(animationCount > 0);
  }, [loadedBundle, uiActions]);

  const applyPoseGraphImport = useCallback(
    async (graphSpec: any, sourceNameHint: string) => {
      const baseName = sourceNameHint.replace(/\.json$/i, "");
      const warnings = poseRig.importPoseGraphSpec(graphSpec, {
        rigName: baseName,
        groupName: baseName,
        applyNeutral: false,
      });
      if (warnings.length > 0) {
        await showAlert(
          `Pose graph imported with ${warnings.length} warning(s). Review Pose diagnostics in the Pose Rig panel.`,
        );
      }
    },
    [poseRig, showAlert],
  );

  const {
    poseGraphRemap,
    handleImportPoseGraphFile,
    handlePoseGraphRemapApply,
    handlePoseGraphRemapCancel,
  } = usePoseGraphImport({
    faceSegment,
    standardInputs,
    rigOutputLookup,
    standardInputsByPath,
    alertDialog: showAlert,
    applyPoseGraphImport,
  });

  const standardInputCount = poseRig.standardInputs.length;

  const faceId = useGraphRuntime((state) => state.faceId);
  const animatables = useGraphRuntime((state) => state.animatables);
  const setPapGraphPlaybackState = useGraphRuntime(
    (state) => state.setGraphPlaybackState,
  );
  const handleFaceIdChange = useGraphRuntime(
    (state) => state.handleFaceIdChange,
  );
  const authoringSessionKey =
    rootId ?? faceLoadSessionToken ?? "__no-face-session__";
  const startAnimationRuntimeSession = useCallback(
    (targetId: string) => {
      advanceAnimationTransportSessionKey();
      setActiveAnimationRuntimeTargetId(targetId);
      setPendingAnimationRuntimePlayTargetId(targetId);
    },
    [advanceAnimationTransportSessionKey],
  );
  const clearAnimationRuntimeState = useCallback(() => {
    advanceAnimationTransportSessionKey();
    animationRuntimeTransportAdapter?.stopAnimation(AUTHORED_TIMELINE_CLIP_ID, {
      clearOutputs: true,
    });
    setPendingAnimationRuntimePlayTargetId(null);
    setActiveAnimationRuntimeTargetId(null);
  }, [advanceAnimationTransportSessionKey, animationRuntimeTransportAdapter]);
  const clearProgramRuntimeState = useCallback(() => {
    setProgramRuntimePlaybackState("stopped");
    setActiveProgramRuntimeTargetId(null);
  }, []);
  const resetAuthoringSessionState = useCallback(() => {
    clearAnimationRuntimeState();
    clearProgramRuntimeState();
    setPendingAnimationTargetSwitchId(null);
    poseRig.resetPoseState();
    setAuthoredAnimationTargets([]);
    setSelectedAnimationTargetId(null);
    setAuthoredProceduralTargets([]);
    setSelectedProceduralTargetId(null);
    setBundleAnimationNameOverrides({});
    setBundleAnimationDurationOverrides({});
    setBundleAnimationClipOverrides({});
    setBundleProceduralNameOverrides({});
    setBundleProceduralSnapshotOverrides({});
    setHiddenBundleAnimationTargetIds({});
    setHiddenBundleProceduralTargetIds({});
    setActiveInspectorTarget(null);
    uiActions.setActiveRuntimeSource("none");
    useAnimationStore.getState().reset();
    const editorStore = useEditorStore.getState();
    editorStore.clear();
    editorStore.setSelected(null);
  }, [
    clearAnimationRuntimeState,
    clearProgramRuntimeState,
    poseRig,
    uiActions,
  ]);
  useSessionResetEffect(authoringSessionKey, resetAuthoringSessionState);
  useEffect(() => {
    setPapGraphPlaybackState(
      activeProgramRuntimeTargetId && programRuntimePlaybackState === "playing"
        ? "playing"
        : "paused",
    );
  }, [
    activeProgramRuntimeTargetId,
    programRuntimePlaybackState,
    setPapGraphPlaybackState,
  ]);
  const canImportRigGraphFromBundle = useMemo(() => {
    if (!loader.rootId) {
      return false;
    }
    if (!runtimeWorld[loader.rootId]) {
      return false;
    }
    if (animatableComponentCount === 0) {
      return false;
    }
    if (!runtimeAnimatables || Object.keys(runtimeAnimatables).length === 0) {
      return false;
    }
    if (!runtimeViewReady) {
      return false;
    }
    return graphStatus === "ready" || graphStatus === "error";
  }, [
    animatableComponentCount,
    graphStatus,
    loader.rootId,
    runtimeAnimatables,
    runtimeViewReady,
    runtimeWorld,
  ]);
  const handleImportGraphSpec = useGraphRuntime(
    (state) => state.handleImportGraphSpec,
  );
  const bundleSessionKey = rootId ?? faceLoadSessionToken ?? "__no-bundle__";

  const bundleAnimationTargetOptions = useMemo(() => {
    const entries = loadedBundle?.animations ?? [];
    return entries
      .map((entry, index) => {
        const targetValue = bundleTargetValue(
          BUNDLE_ANIMATION_TARGET_PREFIX,
          bundleSessionKey,
          index,
        );
        const clipName =
          typeof entry.clip?.name === "string" ? entry.clip.name.trim() : "";
        const fallbackName =
          entry.id?.trim() || `Imported Animation ${index + 1}`;
        const baseLabel = clipName || fallbackName;
        return {
          value: targetValue,
          label: bundleAnimationNameOverrides[targetValue] ?? baseLabel,
        };
      })
      .filter((option) => !hiddenBundleAnimationTargetIds[option.value]);
  }, [
    bundleSessionKey,
    bundleAnimationNameOverrides,
    hiddenBundleAnimationTargetIds,
    loadedBundle?.animations,
  ]);

  const authoredAnimationTargetOptions = useMemo(
    () =>
      authoredAnimationTargets.map((target) => ({
        value: target.targetId,
        label: target.name.trim().length > 0 ? target.name : "Untitled Clip",
      })),
    [authoredAnimationTargets],
  );

  const animationTargetOptions = useMemo(
    () => [...authoredAnimationTargetOptions, ...bundleAnimationTargetOptions],
    [authoredAnimationTargetOptions, bundleAnimationTargetOptions],
  );

  const bundleProceduralEntries = useMemo(
    () =>
      (loadedBundle?.graphs ?? []).filter(
        (entry) => entry.kind?.toLowerCase?.() === "motiongraph",
      ),
    [loadedBundle?.graphs],
  );

  const bundleProceduralTargetOptions = useMemo(
    () =>
      bundleProceduralEntries
        .map((entry, index) => {
          const targetValue = bundleTargetValue(
            BUNDLE_PROCEDURAL_TARGET_PREFIX,
            bundleSessionKey,
            index,
          );
          const metadataLabel =
            typeof entry.label === "string" ? entry.label.trim() : "";
          const metadataId =
            typeof entry.id === "string" ? entry.id.trim() : "";
          const baseLabel =
            metadataLabel || metadataId || `Imported Program ${index + 1}`;
          return {
            value: targetValue,
            label: bundleProceduralNameOverrides[targetValue] ?? baseLabel,
          };
        })
        .filter((option) => !hiddenBundleProceduralTargetIds[option.value]),
    [
      bundleSessionKey,
      bundleProceduralEntries,
      bundleProceduralNameOverrides,
      hiddenBundleProceduralTargetIds,
    ],
  );

  const authoredProceduralTargetOptions = useMemo(
    () =>
      authoredProceduralTargets.map((target) => ({
        value: target.targetId,
        label: target.name.trim().length > 0 ? target.name : "Untitled Program",
      })),
    [authoredProceduralTargets],
  );

  const proceduralTargetOptions = useMemo(
    () => [
      ...authoredProceduralTargetOptions,
      ...bundleProceduralTargetOptions,
    ],
    [authoredProceduralTargetOptions, bundleProceduralTargetOptions],
  );
  const animationTargetLabelById = useMemo(
    () =>
      new Map(
        animationTargetOptions.map((target) => [target.value, target.label]),
      ),
    [animationTargetOptions],
  );
  const programTargetLabelById = useMemo(
    () =>
      new Map(
        proceduralTargetOptions.map((target) => [target.value, target.label]),
      ),
    [proceduralTargetOptions],
  );
  const resolveBundleAnimationEntry = useCallback(
    (targetId: string) => {
      const index = parseBundleTargetIndex(
        targetId,
        BUNDLE_ANIMATION_TARGET_PREFIX,
      );
      if (index === null) {
        return null;
      }
      return loadedBundle?.animations?.[index] ?? null;
    },
    [loadedBundle?.animations],
  );
  const resolveImportedAnimationClip = useCallback(
    (targetId: string): AnimationClipIR | null => {
      const entry = resolveBundleAnimationEntry(targetId);
      if (!entry) {
        return null;
      }
      const baseClip = bundleAnimationEntryToClipIr(entry, {
        standardInputsById: mainFaceInputsById,
      });
      if (!baseClip) {
        return null;
      }
      const overriddenName = bundleAnimationNameOverrides[targetId]?.trim();
      const overriddenDuration = bundleAnimationDurationOverrides[targetId];
      const resolvedBaseClip = {
        ...baseClip,
        name:
          overriddenName && overriddenName.length > 0
            ? overriddenName
            : baseClip.name,
        duration: Number.isFinite(overriddenDuration)
          ? overriddenDuration
          : baseClip.duration,
      };
      const override = bundleAnimationClipOverrides[targetId];
      const clip = override ? structuredClone(override) : resolvedBaseClip;
      return {
        ...clip,
        name:
          overriddenName && overriddenName.length > 0
            ? overriddenName
            : clip.name,
        duration: Number.isFinite(overriddenDuration)
          ? overriddenDuration
          : clip.duration,
      };
    },
    [
      bundleAnimationClipOverrides,
      bundleAnimationDurationOverrides,
      bundleAnimationNameOverrides,
      mainFaceInputsById,
      resolveBundleAnimationEntry,
    ],
  );
  const resolveImportedAnimationBaseClip = useCallback(
    (targetId: string): AnimationClipIR | null => {
      const entry = resolveBundleAnimationEntry(targetId);
      if (!entry) {
        return null;
      }
      const clip = bundleAnimationEntryToClipIr(entry, {
        standardInputsById: mainFaceInputsById,
      });
      if (!clip) {
        return null;
      }
      const overriddenName = bundleAnimationNameOverrides[targetId]?.trim();
      const overriddenDuration = bundleAnimationDurationOverrides[targetId];
      return {
        ...clip,
        name:
          overriddenName && overriddenName.length > 0
            ? overriddenName
            : clip.name,
        duration: Number.isFinite(overriddenDuration)
          ? overriddenDuration
          : clip.duration,
      };
    },
    [
      bundleAnimationDurationOverrides,
      bundleAnimationNameOverrides,
      mainFaceInputsById,
      resolveBundleAnimationEntry,
    ],
  );
  const resolveBundleProceduralEntry = useCallback(
    (targetId: string) => {
      const index = parseBundleTargetIndex(
        targetId,
        BUNDLE_PROCEDURAL_TARGET_PREFIX,
      );
      if (index === null) {
        return null;
      }
      return bundleProceduralEntries[index] ?? null;
    },
    [bundleProceduralEntries],
  );
  const resolveImportedProceduralBaseSnapshot = useCallback(
    (targetId: string): ProceduralProgramSnapshot | null => {
      const entry = resolveBundleProceduralEntry(targetId);
      if (!entry?.spec || typeof entry.spec !== "object") {
        return null;
      }
      const parsed = specToEditorState(entry.spec as Record<string, unknown>);
      return {
        nodes: parsed.nodes,
        edges: parsed.edges,
        enabledOutputs: Array.from(parsed.enabledOutputs),
        enabledInputs: Array.from(parsed.enabledInputs),
        customInputPaths: [...parsed.customInputPaths],
      };
    },
    [resolveBundleProceduralEntry],
  );
  const resolveImportedProceduralSnapshot = useCallback(
    (targetId: string): ProceduralProgramSnapshot | null => {
      const override = bundleProceduralSnapshotOverrides[targetId];
      if (override) {
        return structuredClone(override);
      }
      return resolveImportedProceduralBaseSnapshot(targetId);
    },
    [bundleProceduralSnapshotOverrides, resolveImportedProceduralBaseSnapshot],
  );
  const effectiveAnimationRuntimePlaybackState: RuntimePlaybackState =
    activeAnimationRuntimeTargetId
      ? pendingAnimationRuntimePlayTargetId === activeAnimationRuntimeTargetId
        ? "playing"
        : animationPlaybackState
      : "stopped";
  const effectiveProgramRuntimePlaybackState: RuntimePlaybackState =
    activeProgramRuntimeTargetId ? programRuntimePlaybackState : "stopped";
  const activeAnimationRuntimeTimeLabel =
    activeAnimationRuntimeTargetId &&
    effectiveAnimationRuntimePlaybackState !== "stopped"
      ? formatPlaybackClock(animationCurrentTime, animationTimeDisplayMode)
      : null;
  const animationTargetPlaybackById = useMemo<
    Record<string, AnimationTargetPlaybackStatus>
  >(() => {
    const next: Record<string, AnimationTargetPlaybackStatus> = {};
    animationTargetOptions.forEach((target) => {
      next[target.value] = {
        state: "stopped",
        timeLabel: null,
      };
    });
    if (activeAnimationRuntimeTargetId) {
      next[activeAnimationRuntimeTargetId] = {
        state: effectiveAnimationRuntimePlaybackState,
        timeLabel: activeAnimationRuntimeTimeLabel,
      };
    }
    return next;
  }, [
    activeAnimationRuntimeTargetId,
    activeAnimationRuntimeTimeLabel,
    animationTargetOptions,
    effectiveAnimationRuntimePlaybackState,
  ]);
  const programTargetPlaybackById = useMemo<
    Record<string, ProgramTargetPlaybackStatus>
  >(() => {
    const next: Record<string, ProgramTargetPlaybackStatus> = {};
    proceduralTargetOptions.forEach((target) => {
      next[target.value] = {
        state: "stopped",
      };
    });
    if (activeProgramRuntimeTargetId) {
      next[activeProgramRuntimeTargetId] = {
        state: effectiveProgramRuntimePlaybackState,
      };
    }
    return next;
  }, [
    activeProgramRuntimeTargetId,
    effectiveProgramRuntimePlaybackState,
    proceduralTargetOptions,
  ]);
  const authoringProgramTargets = useMemo(
    () => [
      ...authoredProceduralTargets.map((target) => ({
        id: target.targetId,
        label: target.name.trim().length > 0 ? target.name : "Untitled Program",
        source: "authored" as const,
        selected: target.targetId === selectedProceduralTargetId,
        meta: `${target.snapshot.nodes.length} node${
          target.snapshot.nodes.length === 1 ? "" : "s"
        }`,
        runtimeState:
          programTargetPlaybackById[target.targetId]?.state ?? "stopped",
      })),
      ...bundleProceduralTargetOptions.map((target) => {
        const snapshot = resolveImportedProceduralSnapshot(target.value);
        return {
          id: target.value,
          label: target.label,
          source: "imported" as const,
          selected: target.value === selectedProceduralTargetId,
          meta: snapshot
            ? `${snapshot.nodes.length} node${
                snapshot.nodes.length === 1 ? "" : "s"
              }`
            : "Imported program",
          runtimeState:
            programTargetPlaybackById[target.value]?.state ?? "stopped",
        };
      }),
    ],
    [
      authoredProceduralTargets,
      bundleProceduralTargetOptions,
      programTargetPlaybackById,
      resolveImportedProceduralSnapshot,
      selectedProceduralTargetId,
    ],
  );
  const saveProceduralTarget = useCallback(
    (targetId: string) => {
      // A profile or skill edit session owns the editor: its content must
      // never be snapshotted into a program target.
      if (editingProfileIdRef.current || editingSkillIdRef.current) {
        return;
      }
      const programId = parseAuthoredProceduralTargetValue(targetId);
      if (!programId && !targetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
        return;
      }
      const snapshot = snapshotProceduralEditorState();
      if (programId) {
        setAuthoredProceduralTargets((previous) => {
          const index = previous.findIndex(
            (target) =>
              target.targetId === targetId || target.programId === programId,
          );
          if (index < 0) {
            return previous;
          }
          const target = previous[index]!;
          const updatedTarget: AuthoredProceduralTarget = {
            ...target,
            snapshot,
          };
          if (
            updatedTarget.programId === target.programId &&
            updatedTarget.targetId === target.targetId &&
            updatedTarget.name === target.name &&
            stableValueFingerprint(updatedTarget.snapshot) ===
              stableValueFingerprint(target.snapshot)
          ) {
            return previous;
          }
          const next = [...previous];
          next[index] = updatedTarget;
          return next;
        });
        return;
      }
      const baselineSnapshot = resolveImportedProceduralBaseSnapshot(targetId);
      if (!baselineSnapshot) {
        return;
      }
      setBundleProceduralSnapshotOverrides((previous) => {
        const previousSnapshot = previous[targetId];
        const fingerprint = stableValueFingerprint(snapshot);
        if (fingerprint === stableValueFingerprint(baselineSnapshot)) {
          if (!previousSnapshot) {
            return previous;
          }
          const { [targetId]: _removed, ...rest } = previous;
          return rest;
        }
        if (
          previousSnapshot &&
          fingerprint === stableValueFingerprint(previousSnapshot)
        ) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: snapshot,
        };
      });
    },
    [resolveImportedProceduralBaseSnapshot],
  );

  const saveAnimationTarget = useCallback(
    (targetId: string) => {
      const clipId = parseAuthoredAnimationTargetValue(targetId);
      if (!clipId && !targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        return;
      }
      if (clipId) {
        // Snapshot the store HERE, not inside the updater.
        //
        // `exportAnimationClipIr` reads the animation store at the moment it
        // is called. A functional setState updater runs during a later render
        // — and in StrictMode runs twice — by which time a clip switch may
        // already have reloaded the store with a different clip. The snapshot
        // then captured the incoming clip's tracks and stamped them with the
        // outgoing clip's id. Traced:
        //
        //   save.enter         dest=clip.3  n=1     <- 1 track, correct
        //   store.importClipIr clip.1 incoming=4    <- store reloaded
        //   save.writeAuthored dest=clip.3 was=1->4 <- wrong tracks persisted
        //
        // Reading it eagerly makes the updater pure, so when it runs cannot
        // change what it writes.
        const existing = authoredAnimationTargets.find(
          (target) => target.targetId === targetId || target.clipId === clipId,
        );
        if (!existing) {
          return;
        }
        const snapshotClip = exportAnimationClipIr({
          id: existing.clipId,
          name: existing.name,
        });
        setAuthoredAnimationTargets((previous) => {
          const index = previous.findIndex(
            (target) =>
              target.targetId === targetId || target.clipId === clipId,
          );
          if (index < 0) {
            return previous;
          }
          const target = previous[index]!;
          const clip = snapshotClip;
          const updatedTarget: AuthoredAnimationTarget = {
            ...target,
            clipId: clip.id,
            targetId: authoredAnimationTargetValue(clip.id),
            clip,
          };
          if (
            updatedTarget.clipId === target.clipId &&
            updatedTarget.targetId === target.targetId &&
            updatedTarget.name === target.name &&
            stableValueFingerprint(updatedTarget.clip) ===
              stableValueFingerprint(target.clip)
          ) {
            return previous;
          }
          const next = [...previous];
          next[index] = updatedTarget;
          return next;
        });
        return;
      }
      const baselineClip = resolveImportedAnimationBaseClip(targetId);
      if (!baselineClip) {
        return;
      }
      const targetName =
        animationTargetOptions.find((option) => option.value === targetId)
          ?.label ?? baselineClip.name;
      const clip = exportAnimationClipIr({
        id: baselineClip.id,
        name: targetName,
      });
      setBundleAnimationClipOverrides((previous) => {
        const previousClip = previous[targetId];
        const fingerprint = stableValueFingerprint(clip);
        if (fingerprint === stableValueFingerprint(baselineClip)) {
          if (!previousClip) {
            return previous;
          }
          const { [targetId]: _removed, ...rest } = previous;
          return rest;
        }
        if (
          previousClip &&
          fingerprint === stableValueFingerprint(previousClip)
        ) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: clip,
        };
      });
    },
    [
      animationTargetOptions,
      authoredAnimationTargets,
      exportAnimationClipIr,
      resolveImportedAnimationBaseClip,
    ],
  );

  /**
   * Every clip id already taken, authored or imported. Clip id is the identity
   * used by saving, hydration and export, so a new clip must not reuse one.
   */
  const reservedAnimationClipIds = useMemo(() => {
    const ids = new Set<string>();
    authoredAnimationTargets.forEach((target) => {
      ids.add(target.clipId);
      if (typeof target.clip?.id === "string") {
        ids.add(target.clip.id);
      }
    });
    (loadedBundle?.animations ?? []).forEach((entry) => {
      if (typeof entry?.id === "string") {
        ids.add(entry.id);
      }
      const clipId = (entry as { clip?: { id?: unknown } })?.clip?.id;
      if (typeof clipId === "string") {
        ids.add(clipId);
      }
    });
    return ids;
  }, [authoredAnimationTargets, loadedBundle?.animations]);

  const selectedAuthoredAnimationTarget = useMemo(
    () =>
      authoredAnimationTargets.find(
        (target) => target.targetId === selectedAnimationTargetId,
      ) ?? null,
    [authoredAnimationTargets, selectedAnimationTargetId],
  );
  // There is deliberately NO autosave effect here.
  //
  // One used to persist the editing buffer whenever `tracks` or `duration`
  // changed. Its destination was resolved separately from the data being
  // written, so any render where selection and buffer disagreed wrote the
  // wrong clip — which produced, at different times, a new clip holding
  // another clip's tracks, every clip emptied, and edits appearing not to
  // save. See docs/notes/ANIMATION_SELECTION_STATE_2026-09-03.md.
  //
  // Nothing needs it. The buffer is persisted when switching away, while it
  // still holds the outgoing clip, and every other consumer materialises the
  // selected clip from the buffer directly rather than reading the saved
  // copy: export via `authoredAnimationClipsForExport`, playback via
  // `activeAnimationRuntimeClip`, and the clip list below.

  const authoringAnimationTargets = useMemo(
    () => [
      ...authoredAnimationTargets.map((target) => ({
        id: target.targetId,
        label: target.name.trim().length > 0 ? target.name : "Untitled Clip",
        source: "authored" as const,
        selected: target.targetId === selectedAnimationTargetId,
        // The saved copy of the selected clip is refreshed on switch-away, so
        // its count would lag the edit in progress; read the buffer instead.
        meta: (() => {
          const trackCount =
            target.targetId === selectedAnimationTargetId
              ? animationTracks.length
              : target.clip.tracks.length;
          return `${trackCount} track${trackCount === 1 ? "" : "s"}`;
        })(),
        runtimeState:
          animationTargetPlaybackById[target.targetId]?.state ?? "stopped",
        runtimeTimeLabel:
          animationTargetPlaybackById[target.targetId]?.timeLabel ?? null,
      })),
      ...bundleAnimationTargetOptions.map((target) => {
        const clip = resolveImportedAnimationClip(target.value);
        return {
          id: target.value,
          label: target.label,
          source: "imported" as const,
          selected: target.value === selectedAnimationTargetId,
          meta: (() => {
            if (!clip) {
              return "Imported clip";
            }
            const trackCount =
              target.value === selectedAnimationTargetId
                ? animationTracks.length
                : clip.tracks.length;
            return `${trackCount} track${trackCount === 1 ? "" : "s"}`;
          })(),
          runtimeState:
            animationTargetPlaybackById[target.value]?.state ?? "stopped",
          runtimeTimeLabel:
            animationTargetPlaybackById[target.value]?.timeLabel ?? null,
        };
      }),
    ],
    [
      animationTargetPlaybackById,
      animationTracks,
      authoredAnimationTargets,
      bundleAnimationTargetOptions,
      resolveImportedAnimationClip,
      selectedAnimationTargetId,
    ],
  );
  const selectedAuthoredProceduralTarget = useMemo(
    () =>
      authoredProceduralTargets.find(
        (target) => target.targetId === selectedProceduralTargetId,
      ) ?? null,
    [authoredProceduralTargets, selectedProceduralTargetId],
  );
  useEffect(() => {
    if (!selectedProceduralTargetId) {
      return;
    }
    saveProceduralTarget(selectedProceduralTargetId);
  }, [
    proceduralEditorCustomInputPaths,
    proceduralEditorEdges,
    proceduralEditorEnabledInputs,
    proceduralEditorEnabledOutputs,
    proceduralEditorNodes,
    saveProceduralTarget,
    selectedProceduralTargetId,
  ]);
  const selectedAnimationInspectorTarget =
    useMemo<AnimationInspectorSelection | null>(() => {
      if (!selectedAnimationTargetId) {
        return null;
      }

      const authoredClipId = parseAuthoredAnimationTargetValue(
        selectedAnimationTargetId,
      );
      let clip: AnimationClipIR | null = null;
      let targetName = "Untitled Clip";
      let source: "authored" | "imported" = "imported";

      if (authoredClipId) {
        const authoredTarget = authoredAnimationTargets.find(
          (target) =>
            target.targetId === selectedAnimationTargetId ||
            target.clipId === authoredClipId,
        );
        if (!authoredTarget) {
          return null;
        }
        targetName =
          authoredTarget.name.trim().length > 0
            ? authoredTarget.name
            : "Untitled Clip";
        source = "authored";
        clip = exportAnimationClipIr({
          id: authoredTarget.clipId,
          name: targetName,
        });
      } else if (
        selectedAnimationTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)
      ) {
        clip = resolveImportedAnimationClip(selectedAnimationTargetId);
        if (!clip) {
          return null;
        }
        targetName =
          bundleAnimationTargetOptions.find(
            (option) => option.value === selectedAnimationTargetId,
          )?.label ??
          clip.name?.trim() ??
          "Imported Animation";
      } else {
        return null;
      }

      return {
        targetId: selectedAnimationTargetId,
        name: targetName,
        source,
        duration: clip.duration,
        trackCount: clip.tracks.length,
        tracks: clip.tracks.map((track) => {
          const directInput = mainFaceInputsById.get(track.variableId) ?? null;
          const pathInput =
            directInput ??
            resolveStandardInputForRuntimePath(
              standardInputsByPath,
              track.channel,
            );
          return {
            id: track.id,
            label: track.label?.trim().length
              ? track.label.trim()
              : directInput?.label?.trim() ||
                pathInput?.label?.trim() ||
                track.variableId,
            channel: track.channel,
            keyframeCount: track.keyframes.length,
            inputId: directInput?.id ?? pathInput?.id ?? null,
            inputLabel:
              directInput?.label?.trim() || pathInput?.label?.trim() || null,
          };
        }),
      };
    }, [
      animationDuration,
      animationTracks,
      authoredAnimationTargets,
      bundleAnimationTargetOptions,
      exportAnimationClipIr,
      mainFaceInputsById,
      resolveImportedAnimationClip,
      selectedAnimationTargetId,
      standardInputsByPath,
    ]);
  const selectedProgramInspectorTarget =
    useMemo<ProgramInspectorSelection | null>(() => {
      if (!selectedProceduralTargetId) {
        return null;
      }

      let snapshot: ProceduralProgramSnapshot | null = null;
      let targetName = "Untitled Program";
      let source: "authored" | "imported" = "imported";

      const authoredProgramId = parseAuthoredProceduralTargetValue(
        selectedProceduralTargetId,
      );
      if (authoredProgramId) {
        const authoredTarget = authoredProceduralTargets.find(
          (target) =>
            target.targetId === selectedProceduralTargetId ||
            target.programId === authoredProgramId,
        );
        if (!authoredTarget) {
          return null;
        }
        targetName =
          authoredTarget.name.trim().length > 0
            ? authoredTarget.name
            : "Untitled Program";
        source = "authored";
        snapshot =
          selectedProceduralTargetId === authoredTarget.targetId
            ? snapshotProceduralEditorState()
            : structuredClone(authoredTarget.snapshot);
      } else if (
        selectedProceduralTargetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)
      ) {
        snapshot = resolveImportedProceduralSnapshot(
          selectedProceduralTargetId,
        );
        if (!snapshot) {
          return null;
        }
        targetName =
          bundleProceduralTargetOptions.find(
            (option) => option.value === selectedProceduralTargetId,
          )?.label ?? "Imported Program";
      } else {
        return null;
      }

      const customInputPathSet = new Set(snapshot.customInputPaths);
      const inputs = Array.from(new Set(snapshot.enabledInputs))
        .sort((left, right) => left.localeCompare(right))
        .map((path) => {
          const input = resolveStandardInputForRuntimePath(
            standardInputsByPath,
            path,
          );
          return {
            path,
            label: input?.label?.trim() || input?.id || path,
            inputId: input?.id ?? null,
            tag: customInputPathSet.has(path) ? "Custom" : null,
          };
        });
      const outputs = Array.from(new Set(snapshot.enabledOutputs))
        .sort((left, right) => left.localeCompare(right))
        .map((path) => {
          const input = resolveStandardInputForRuntimePath(
            standardInputsByPath,
            path,
          );
          return {
            path,
            label: input?.label?.trim() || input?.id || path,
            inputId: input?.id ?? null,
            tag: input ? null : "External",
          };
        });

      return {
        targetId: selectedProceduralTargetId,
        name: targetName,
        source,
        nodeCount: snapshot.nodes.length,
        edgeCount: snapshot.edges.length,
        inputCount: inputs.length,
        outputCount: outputs.length,
        nodes: snapshot.nodes
          .filter((node) => node.type === "input" || node.type === "output")
          .map((node) => {
            const rawLabel = node.data?.label;
            return {
              id: node.id,
              label:
                typeof rawLabel === "string" && rawLabel.trim().length > 0
                  ? rawLabel.trim()
                  : (node.type ?? node.id),
              kind:
                node.type === "input"
                  ? ("input" as const)
                  : ("output" as const),
            };
          }),
        inputs,
        outputs,
      };
    }, [
      authoredProceduralTargets,
      bundleProceduralTargetOptions,
      proceduralEditorCustomInputPaths,
      proceduralEditorEdges,
      proceduralEditorEnabledInputs,
      proceduralEditorEnabledOutputs,
      proceduralEditorNodes,
      resolveImportedProceduralSnapshot,
      selectedProceduralTargetId,
      standardInputsByPath,
    ]);
  const activeAnimationRuntimeClip = useMemo<AnimationClipIR | null>(() => {
    if (!activeAnimationRuntimeTargetId) {
      return null;
    }

    const authoredClipId = parseAuthoredAnimationTargetValue(
      activeAnimationRuntimeTargetId,
    );
    if (authoredClipId) {
      const authoredTarget = authoredAnimationTargets.find(
        (target) =>
          target.targetId === activeAnimationRuntimeTargetId ||
          target.clipId === authoredClipId,
      );
      if (!authoredTarget) {
        return null;
      }
      if (activeAnimationRuntimeTargetId === selectedAnimationTargetId) {
        return {
          ...exportAnimationClipIr({
            id: authoredTarget.clipId,
            name: authoredTarget.name,
          }),
          id: AUTHORED_TIMELINE_CLIP_ID,
        };
      }
      return {
        ...structuredClone(authoredTarget.clip),
        id: AUTHORED_TIMELINE_CLIP_ID,
      };
    }
    if (
      !activeAnimationRuntimeTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)
    ) {
      return null;
    }
    const clip = resolveImportedAnimationClip(activeAnimationRuntimeTargetId);
    if (!clip) {
      return null;
    }
    return {
      ...clip,
      id: AUTHORED_TIMELINE_CLIP_ID,
    };
  }, [
    activeAnimationRuntimeTargetId,
    authoredAnimationTargets,
    exportAnimationClipIr,
    resolveImportedAnimationClip,
    selectedAnimationTargetId,
  ]);
  const activeProgramRuntimeSnapshot =
    useMemo<ProceduralProgramSnapshot | null>(() => {
      if (!activeProgramRuntimeTargetId) {
        return null;
      }

      const authoredProgramId = parseAuthoredProceduralTargetValue(
        activeProgramRuntimeTargetId,
      );
      if (authoredProgramId) {
        const authoredTarget = authoredProceduralTargets.find(
          (target) =>
            target.targetId === activeProgramRuntimeTargetId ||
            target.programId === authoredProgramId,
        );
        if (!authoredTarget) {
          return null;
        }
        return activeProgramRuntimeTargetId === selectedProceduralTargetId
          ? snapshotProceduralEditorState()
          : structuredClone(authoredTarget.snapshot);
      }
      if (
        !activeProgramRuntimeTargetId.startsWith(
          BUNDLE_PROCEDURAL_TARGET_PREFIX,
        )
      ) {
        return null;
      }
      return resolveImportedProceduralSnapshot(activeProgramRuntimeTargetId);
    }, [
      activeProgramRuntimeTargetId,
      authoredProceduralTargets,
      proceduralEditorCustomInputPaths,
      proceduralEditorEdges,
      proceduralEditorEnabledInputs,
      proceduralEditorEnabledOutputs,
      proceduralEditorNodes,
      resolveImportedProceduralSnapshot,
      selectedProceduralTargetId,
    ]);
  const activeProgramRuntimeResetValues = useMemo<
    MotionGraphRuntimeResetEntry[]
  >(() => {
    if (!activeProgramRuntimeSnapshot) {
      return [];
    }
    return Array.from(new Set(activeProgramRuntimeSnapshot.enabledOutputs))
      .sort((left, right) => left.localeCompare(right))
      .map((path) => {
        const input = resolveStandardInputForRuntimePath(
          standardInputsByPath,
          path,
        );
        const defaultValue = input?.defaultValue;
        return {
          path,
          value:
            typeof defaultValue === "number" && Number.isFinite(defaultValue)
              ? defaultValue
              : 0,
        };
      });
  }, [activeProgramRuntimeSnapshot, standardInputsByPath]);
  const activeProgramRuntimeControllerId = useMemo(
    () =>
      activeProgramRuntimeTargetId
        ? motionGraphRuntimeControllerId(activeProgramRuntimeTargetId)
        : null,
    [activeProgramRuntimeTargetId],
  );
  const loadSelectedAnimationTarget = useCallback(
    (targetId: string | null) => {
      if (!targetId) {
        useAnimationStore.getState().reset();
        return;
      }
      const authoredClipId = parseAuthoredAnimationTargetValue(targetId);
      if (authoredClipId) {
        const target = authoredAnimationTargets.find(
          (entry) =>
            entry.targetId === targetId || entry.clipId === authoredClipId,
        );
        if (target) {
          importAnimationClipIr(target.clip);
          return;
        }
      } else if (targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        const clip = resolveImportedAnimationClip(targetId);
        if (clip) {
          importAnimationClipIr(clip);
          return;
        }
      }
      useAnimationStore.getState().reset();
    },
    [
      authoredAnimationTargets,
      importAnimationClipIr,
      resolveImportedAnimationClip,
    ],
  );
  const loadSelectedProceduralTarget = useCallback(
    (targetId: string | null) => {
      // A profile or skill edit session owns the editor: target changes
      // neither hydrate over its content nor clear it (apply/discard does).
      if (editingProfileIdRef.current || editingSkillIdRef.current) {
        return;
      }
      if (!targetId) {
        const editorStore = useEditorStore.getState();
        editorStore.clear();
        editorStore.setSelected(null);
        return;
      }
      const authoredProgramId = parseAuthoredProceduralTargetValue(targetId);
      if (authoredProgramId) {
        const authoredTarget = authoredProceduralTargets.find(
          (target) =>
            target.targetId === targetId ||
            target.programId === authoredProgramId,
        );
        if (authoredTarget) {
          hydrateProceduralEditorState(authoredTarget.snapshot);
          return;
        }
      } else if (targetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
        const snapshot = resolveImportedProceduralSnapshot(targetId);
        if (snapshot) {
          hydrateProceduralEditorState(snapshot);
          return;
        }
      }
      const editorStore = useEditorStore.getState();
      editorStore.clear();
      editorStore.setSelected(null);
    },
    [authoredProceduralTargets, resolveImportedProceduralSnapshot],
  );
  useEffect(() => {
    if (!pendingAnimationTargetSwitchId || activeAnimationRuntimeTargetId) {
      return;
    }
    setSelectedAnimationTargetId(pendingAnimationTargetSwitchId);
    loadSelectedAnimationTarget(pendingAnimationTargetSwitchId);
    setPendingAnimationTargetSwitchId(null);
  }, [
    activeAnimationRuntimeTargetId,
    loadSelectedAnimationTarget,
    pendingAnimationTargetSwitchId,
  ]);
  const resolvedSelectedAnimationTargetId = useManagedTargetLifecycle({
    sessionKey: authoringSessionKey,
    targetOptions: animationTargetOptions,
    selectedTargetId: selectedAnimationTargetId,
    setSelectedTargetId: setSelectedAnimationTargetId,
    loadSelectedTarget: loadSelectedAnimationTarget,
    activeRuntimeTargetId: activeAnimationRuntimeTargetId,
    clearInvalidActiveRuntimeTarget: clearAnimationRuntimeState,
  });
  const resolvedSelectedProceduralTargetId = useManagedTargetLifecycle({
    sessionKey: authoringSessionKey,
    targetOptions: proceduralTargetOptions,
    selectedTargetId: selectedProceduralTargetId,
    setSelectedTargetId: setSelectedProceduralTargetId,
    loadSelectedTarget: loadSelectedProceduralTarget,
    activeRuntimeTargetId: activeProgramRuntimeTargetId,
    clearInvalidActiveRuntimeTarget: clearProgramRuntimeState,
  });
  const selectedProgramRuntimeSnapshot =
    useMemo<ProceduralProgramSnapshot | null>(() => {
      if (!resolvedSelectedProceduralTargetId) {
        return null;
      }

      const authoredProgramId = parseAuthoredProceduralTargetValue(
        resolvedSelectedProceduralTargetId,
      );
      if (authoredProgramId) {
        const authoredTarget = authoredProceduralTargets.find(
          (target) =>
            target.targetId === resolvedSelectedProceduralTargetId ||
            target.programId === authoredProgramId,
        );
        if (!authoredTarget) {
          return null;
        }
        return resolvedSelectedProceduralTargetId === selectedProceduralTargetId
          ? snapshotProceduralEditorState()
          : structuredClone(authoredTarget.snapshot);
      }
      if (
        !resolvedSelectedProceduralTargetId.startsWith(
          BUNDLE_PROCEDURAL_TARGET_PREFIX,
        )
      ) {
        return null;
      }
      return resolveImportedProceduralSnapshot(
        resolvedSelectedProceduralTargetId,
      );
    }, [
      authoredProceduralTargets,
      proceduralEditorCustomInputPaths,
      proceduralEditorEdges,
      proceduralEditorEnabledInputs,
      proceduralEditorEnabledOutputs,
      proceduralEditorNodes,
      resolveImportedProceduralSnapshot,
      resolvedSelectedProceduralTargetId,
      selectedProceduralTargetId,
    ]);

  const handleSelectAnimationTarget = useCallback(
    (targetId: string) => {
      if (targetId === selectedAnimationTargetId) {
        return;
      }
      if (selectedAnimationTargetId) {
        saveAnimationTarget(selectedAnimationTargetId);
      }
      if (
        activeAnimationRuntimeTargetId &&
        activeAnimationRuntimeTargetId !== targetId
      ) {
        setPendingAnimationTargetSwitchId(targetId);
        clearAnimationRuntimeState();
        useAnimationStore.getState().reset();
        return;
      }
      setSelectedAnimationTargetId(targetId);
      loadSelectedAnimationTarget(targetId);
    },
    [
      activeAnimationRuntimeTargetId,
      clearAnimationRuntimeState,
      loadSelectedAnimationTarget,
      saveAnimationTarget,
      selectedAnimationTargetId,
      setPendingAnimationTargetSwitchId,
    ],
  );

  const handleCreateAnimationTarget = useCallback(() => {
    if (selectedAnimationTargetId) {
      saveAnimationTarget(selectedAnimationTargetId);
    }

    const nextOrdinal = nextAuthoredAnimationClipOrdinal(
      reservedAnimationClipIds,
    );
    const nextClipId = `authoring.timeline.clip.${nextOrdinal}`;
    const nextClipName = `Animation Clip ${nextOrdinal}`;
    const nextTarget = createAuthoredAnimationTarget(
      nextClipId,
      nextClipName,
      animationDuration,
    );
    setAuthoredAnimationTargets((previous) => [...previous, nextTarget]);
    setSelectedAnimationTargetId(nextTarget.targetId);
  }, [
    animationDuration,
    authoredAnimationTargets,
    saveAnimationTarget,
    selectedAnimationTargetId,
  ]);

  const handleDuplicateAnimationTarget = useCallback(
    (targetId: string) => {
      const nextOrdinal = nextAuthoredAnimationClipOrdinal(
        reservedAnimationClipIds,
      );
      const nextClipId = `authoring.timeline.clip.${nextOrdinal}`;
      let sourceClip: AnimationClipIR | null = null;
      let sourceName = `Animation Clip ${nextOrdinal}`;

      const authoredClipId = parseAuthoredAnimationTargetValue(targetId);
      if (authoredClipId) {
        const authoredTarget = authoredAnimationTargets.find(
          (target) =>
            target.targetId === targetId || target.clipId === authoredClipId,
        );
        if (!authoredTarget) {
          return;
        }
        sourceName =
          authoredTarget.name.trim().length > 0
            ? authoredTarget.name
            : sourceName;
        sourceClip =
          targetId === selectedAnimationTargetId
            ? exportAnimationClipIr({
                id: authoredTarget.clipId,
                name: authoredTarget.name,
              })
            : structuredClone(authoredTarget.clip);
      } else if (targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        const importedClip = resolveImportedAnimationClip(targetId);
        if (!importedClip) {
          return;
        }
        sourceClip = importedClip;
        sourceName =
          bundleAnimationTargetOptions.find(
            (option) => option.value === targetId,
          )?.label ??
          importedClip.name?.trim() ??
          sourceName;
      }

      if (!sourceClip) {
        return;
      }

      const nextName = `${sourceName} Copy`;
      const nextClip: AnimationClipIR = {
        ...structuredClone(sourceClip),
        id: nextClipId,
        name: nextName,
      };
      const nextTarget: AuthoredAnimationTarget = {
        targetId: authoredAnimationTargetValue(nextClipId),
        clipId: nextClipId,
        name: nextName,
        clip: nextClip,
      };

      setActiveAuthoringSurface("animations");
      setWorkspacePanelVisibility("animation", true);
      setAuthoredAnimationTargets((previous) => [...previous, nextTarget]);
      setSelectedAnimationTargetId(nextTarget.targetId);
    },
    [
      authoredAnimationTargets,
      bundleAnimationTargetOptions,
      exportAnimationClipIr,
      resolveImportedAnimationClip,
      selectedAnimationTargetId,
      setWorkspacePanelVisibility,
    ],
  );

  /**
   * Imports native glTF animations from a GLB onto the loaded face.
   *
   * `announce: "problems-only"` is used for the automatic import that runs when
   * a face loads: a dialog on every load would be noise, but silently swallowing
   * unresolved channels would hide real problems.
   */
  const runGlbAnimationImport = useCallback(
    async (options: {
      glb: ArrayBuffer;
      fileName: string;
      announce: "always" | "problems-only";
    }) => {
      const { glb, fileName, announce } = options;
      const catalog = buildCatalogFromInputPaths(
        Array.from(mainFaceInputsById.values()),
      );
      if (catalog.size === 0) {
        if (announce === "always") {
          await showAlert(
            "Load a face first — imported animation channels are matched against the loaded face's inputs.",
          );
        }
        return;
      }

      let result: ReturnType<typeof importGltfAnimations>;
      try {
        const nextOrdinal = nextAuthoredAnimationClipOrdinal(
          reservedAnimationClipIds,
        );
        result = importGltfAnimations({
          glb,
          catalog,
          clipIdPrefix: `authoring.timeline.clip.${nextOrdinal}`,
          clipNamePrefix: fileName.replace(/\.glb$/i, ""),
        });
      } catch (error) {
        await showAlert(
          `Could not read animations from ${fileName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }

      if (result.stats.sourceAnimations === 0 && announce !== "always") {
        return;
      }

      const summaryLines = [
        `${fileName}`,
        "",
        `Source animations: ${result.stats.sourceAnimations} (grouping: ${result.grouping})`,
        `Channels resolved: ${result.stats.resolvedChannels} of ${result.stats.scalarChannels}`,
        `Keyframes imported: ${result.stats.keyframes}`,
        `Clips created: ${result.clips.length}`,
      ];
      if (result.diagnostics.length > 0) {
        summaryLines.push("", "Notes:");
        for (const diagnostic of result.diagnostics) {
          summaryLines.push(
            `• [${diagnostic.severity}] ${diagnostic.message}${
              diagnostic.remediation ? ` ${diagnostic.remediation}` : ""
            }`,
          );
        }
      }

      // Re-importing the same GLB is routine; matching on clip content means a
      // re-export that changed nothing about the animation does not pile up
      // identical clips.
      const { fresh, duplicates } = dedupeImportedClips({
        clips: result.clips,
        existing: authoredAnimationTargets.map((target) => ({
          name: target.name,
          clip: target.clip,
        })),
      });
      if (duplicates.length > 0) {
        summaryLines.push(
          "",
          `Skipped ${duplicates.length} clip(s) already present: ${duplicates
            .map((entry) => entry.existingName)
            .join(", ")}.`,
        );
      }

      if (fresh.length === 0 && duplicates.length > 0) {
        if (announce === "always") {
          await showAlert(summaryLines.join("\n"));
        }
        return;
      }

      if (result.clips.length === 0) {
        if (announce === "always" || result.stats.scalarChannels > 0) {
          await showAlert(
            [
              "No animation channels could be imported.",
              "",
              ...summaryLines,
            ].join("\n"),
          );
        }
        return;
      }

      // A propsrig input's range is inferred from a single rest value, which
      // cannot bound a curve — and the rig graph clamps each channel to its
      // range, so an imported animation that leaves it is silently flattened.
      // Widen to admit the curve: real data is better evidence of a channel's
      // extent than a rest sample, and widening is lossless where clamping
      // destroys motion.
      const rangeFit = computeInputRangeFit({
        clips: fresh,
        inputsById: mainFaceInputsById,
      });
      if (rangeFit.adjustments.length > 0) {
        rangeFit.adjustments.forEach((adjustment) => {
          handleUpdateStandardInput(adjustment.inputId, {
            range: { min: adjustment.next.min, max: adjustment.next.max },
          });
        });
        summaryLines.push(
          "",
          `Widened ${rangeFit.adjustments.length} input range(s) so the imported curves are not clamped:`,
          ...rangeFit.adjustments.map(
            (adjustment) => `• ${describeRangeAdjustment(adjustment)}`,
          ),
        );
      }

      const nextTargets = fresh.map((clip) => ({
        targetId: authoredAnimationTargetValue(clip.id),
        clipId: clip.id,
        name: clip.name ?? clip.id,
        clip,
      }));

      setAuthoredAnimationTargets((previous) => [...previous, ...nextTargets]);

      if (announce === "always") {
        // Explicit import: jump the author to what they just brought in.
        setActiveAuthoringSurface("animations");
        setWorkspacePanelVisibility("animation", true);
        setSelectedAnimationTargetId(nextTargets[0]!.targetId);
        await showAlert(summaryLines.join("\n"));
        return;
      }

      // Automatic import: make the clip selectable without stealing focus.
      setSelectedAnimationTargetId(
        (previous) => previous ?? nextTargets[0]!.targetId,
      );
      const problems = result.diagnostics.filter(
        (diagnostic) => diagnostic.severity !== "info",
      );
      if (problems.length > 0) {
        await showAlert(summaryLines.join("\n"));
      }
    },
    [
      showAlert,
      authoredAnimationTargets,
      handleUpdateStandardInput,
      mainFaceInputsById,
      setActiveAuthoringSurface,
      setWorkspacePanelVisibility,
    ],
  );

  // Auto-import a freshly loaded face's own embedded animations. Gated on
  // `runtime-ready` plus a non-empty input catalog, because inputs populate
  // progressively during load and resolving against a partial catalog would
  // report false "unresolved" channels.
  useEffect(() => {
    const pending = pendingAnimationImportRef.current;
    if (!pending) {
      return;
    }
    if (!faceLoadMilestones["runtime-ready"]) {
      return;
    }
    if (mainFaceInputsById.size === 0) {
      return;
    }
    pendingAnimationImportRef.current = null;
    void runGlbAnimationImport({
      glb: pending.glb,
      fileName: pending.fileName,
      announce: "problems-only",
    });
  }, [faceLoadMilestones, mainFaceInputsById, runGlbAnimationImport]);

  const importAnimationsFromGlbFile = useCallback(
    async (file: File) => {
      let glb: ArrayBuffer;
      try {
        glb = await file.arrayBuffer();
      } catch (error) {
        await showAlert(
          `Could not read ${file.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
      await runGlbAnimationImport({
        glb,
        fileName: file.name,
        announce: "always",
      });
    },
    [runGlbAnimationImport, showAlert],
  );

  const deleteAnimationTargetById = useCallback(
    (deletingTargetId: string) => {
      const authoredClipId =
        parseAuthoredAnimationTargetValue(deletingTargetId);
      const activeTarget = authoredAnimationTargets.find(
        (target) => target.targetId === deletingTargetId,
      );
      const activeOptionLabel =
        animationTargetOptions.find(
          (option) => option.value === deletingTargetId,
        )?.label ?? activeTarget?.name;
      const targetLabel = activeTarget?.name?.trim() || "this clip";
      if (
        !window.confirm(
          `Delete animation clip "${activeOptionLabel || targetLabel}"? This cannot be undone.`,
        )
      ) {
        return;
      }

      let nextAuthoredTargets = authoredAnimationTargets;
      if (authoredClipId) {
        nextAuthoredTargets = authoredAnimationTargets.filter(
          (target) => target.targetId !== deletingTargetId,
        );
      } else if (deletingTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        setHiddenBundleAnimationTargetIds((previous) => ({
          ...previous,
          [deletingTargetId]: true,
        }));
        setBundleAnimationClipOverrides((previous) => {
          const { [deletingTargetId]: _removed, ...rest } = previous;
          return rest;
        });
      }

      const remainingBundleTargets = bundleAnimationTargetOptions.filter(
        (option) => option.value !== deletingTargetId,
      );

      if (
        nextAuthoredTargets.length === 0 &&
        remainingBundleTargets.length === 0
      ) {
        setAuthoredAnimationTargets([]);
        setSelectedAnimationTargetId(null);
        setActiveInspectorTarget((previous) =>
          previous?.kind === "animation-target" ||
          previous?.kind === "animation-track"
            ? null
            : previous,
        );
        useAnimationStore.getState().reset();
        return;
      }

      setAuthoredAnimationTargets(nextAuthoredTargets);
      const nextTargetId =
        nextAuthoredTargets[0]?.targetId ?? remainingBundleTargets[0]!.value;
      setSelectedAnimationTargetId(nextTargetId);
    },
    [
      animationTargetOptions,
      authoredAnimationTargets,
      bundleAnimationTargetOptions,
      setBundleAnimationClipOverrides,
      setHiddenBundleAnimationTargetIds,
    ],
  );
  const authoredAnimationClipsForExport = useMemo(() => {
    const authoredClipId = parseAuthoredAnimationTargetValue(
      selectedAnimationTargetId,
    );
    const activeImportedTargetId =
      selectedAnimationTargetId &&
      selectedAnimationTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)
        ? selectedAnimationTargetId
        : null;
    const liveActiveClip =
      authoredClipId && selectedAuthoredAnimationTarget
        ? exportAnimationClipIr({
            id: selectedAuthoredAnimationTarget.clipId,
            name: selectedAuthoredAnimationTarget.name,
          })
        : null;
    const authoredClips = authoredAnimationTargets.map((target) => {
      if (
        liveActiveClip &&
        target.targetId === selectedAuthoredAnimationTarget?.targetId
      ) {
        return liveActiveClip;
      }
      return target.clip;
    });
    const importedTargetIds = new Set(
      Object.keys(bundleAnimationClipOverrides),
    );
    Object.keys(bundleAnimationNameOverrides).forEach((targetId) =>
      importedTargetIds.add(targetId),
    );
    Object.keys(bundleAnimationDurationOverrides).forEach((targetId) =>
      importedTargetIds.add(targetId),
    );
    if (activeImportedTargetId) {
      importedTargetIds.add(activeImportedTargetId);
    }
    const importedClips = Array.from(importedTargetIds)
      .map((targetId) =>
        targetId === activeImportedTargetId
          ? (() => {
              const baselineClip = resolveImportedAnimationBaseClip(targetId);
              if (!baselineClip) {
                return null;
              }
              const targetName =
                animationTargetOptions.find(
                  (option) => option.value === targetId,
                )?.label ?? baselineClip.name;
              const liveClip = exportAnimationClipIr({
                id: baselineClip.id,
                name: targetName,
              });
              const matchesBaseline =
                stableValueFingerprint(liveClip) ===
                stableValueFingerprint(baselineClip);
              const hasImportedEdits =
                Boolean(bundleAnimationClipOverrides[targetId]) ||
                Boolean(bundleAnimationNameOverrides[targetId]) ||
                Number.isFinite(bundleAnimationDurationOverrides[targetId]);
              return matchesBaseline && !hasImportedEdits
                ? null
                : matchesBaseline
                  ? baselineClip
                  : liveClip;
            })()
          : resolveImportedAnimationClip(targetId),
      )
      .filter((clip): clip is AnimationClipIR => clip !== null);
    return [...authoredClips, ...importedClips];
  }, [
    animationDuration,
    animationTracks,
    animationTargetOptions,
    authoredAnimationTargets,
    bundleAnimationClipOverrides,
    bundleAnimationDurationOverrides,
    bundleAnimationNameOverrides,
    exportAnimationClipIr,
    resolveImportedAnimationBaseClip,
    resolveImportedAnimationClip,
    selectedAnimationTargetId,
    selectedAuthoredAnimationTarget,
  ]);

  const handleSelectProceduralTarget = useCallback(
    (targetId: string) => {
      if (targetId === selectedProceduralTargetId) {
        return;
      }
      if (selectedProceduralTargetId) {
        saveProceduralTarget(selectedProceduralTargetId);
      }

      setSelectedProceduralTargetId(targetId);
      loadSelectedProceduralTarget(targetId);
    },
    [
      loadSelectedProceduralTarget,
      saveProceduralTarget,
      selectedProceduralTargetId,
    ],
  );

  const handleCreateProceduralTarget = useCallback(() => {
    if (selectedProceduralTargetId) {
      saveProceduralTarget(selectedProceduralTargetId);
    }

    const nextOrdinal = nextAuthoredProceduralProgramOrdinal(
      authoredProceduralTargets,
    );
    const nextProgramId = `authoring.motiongraph.program.${nextOrdinal}`;
    const nextProgramName = `Procedural Program ${nextOrdinal}`;
    const nextTarget = createAuthoredProceduralTarget(
      nextProgramId,
      nextProgramName,
    );
    setAuthoredProceduralTargets((previous) => [...previous, nextTarget]);
    setSelectedProceduralTargetId(nextTarget.targetId);
  }, [
    authoredProceduralTargets,
    saveProceduralTarget,
    selectedProceduralTargetId,
  ]);

  const handleDuplicateProgramTarget = useCallback(
    (targetId: string) => {
      const nextOrdinal = nextAuthoredProceduralProgramOrdinal(
        authoredProceduralTargets,
      );
      const nextProgramId = `authoring.motiongraph.program.${nextOrdinal}`;
      let sourceSnapshot: ProceduralProgramSnapshot | null = null;
      let sourceName = `Procedural Program ${nextOrdinal}`;

      const authoredProgramId = parseAuthoredProceduralTargetValue(targetId);
      if (authoredProgramId) {
        const authoredTarget = authoredProceduralTargets.find(
          (target) =>
            target.targetId === targetId ||
            target.programId === authoredProgramId,
        );
        if (!authoredTarget) {
          return;
        }
        sourceName =
          authoredTarget.name.trim().length > 0
            ? authoredTarget.name
            : sourceName;
        sourceSnapshot =
          targetId === selectedProceduralTargetId
            ? snapshotProceduralEditorState()
            : structuredClone(authoredTarget.snapshot);
      } else if (targetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
        sourceSnapshot = resolveImportedProceduralSnapshot(targetId);
        if (!sourceSnapshot) {
          return;
        }
        sourceName =
          bundleProceduralTargetOptions.find(
            (option) => option.value === targetId,
          )?.label ?? sourceName;
      }

      if (!sourceSnapshot) {
        return;
      }

      const nextName = `${sourceName} Copy`;
      const nextTarget: AuthoredProceduralTarget = {
        targetId: authoredProceduralTargetValue(nextProgramId),
        programId: nextProgramId,
        name: nextName,
        snapshot: structuredClone(sourceSnapshot),
      };

      setActiveAuthoringSurface("programs");
      setWorkspacePanelVisibility("motiongraphPalette", true);
      setWorkspacePanelVisibility("motiongraph", true);
      setAuthoredProceduralTargets((previous) => [...previous, nextTarget]);
      setSelectedProceduralTargetId(nextTarget.targetId);
    },
    [
      authoredProceduralTargets,
      bundleProceduralTargetOptions,
      resolveImportedProceduralSnapshot,
      selectedProceduralTargetId,
      setWorkspacePanelVisibility,
    ],
  );

  const deleteProceduralTargetById = useCallback(
    (deletingTargetId: string) => {
      const authoredProgramId =
        parseAuthoredProceduralTargetValue(deletingTargetId);
      const activeTarget = authoredProceduralTargets.find(
        (target) => target.targetId === deletingTargetId,
      );
      const activeOptionLabel =
        proceduralTargetOptions.find(
          (option) => option.value === deletingTargetId,
        )?.label ?? activeTarget?.name;
      const targetLabel = activeTarget?.name?.trim() || "this program";
      if (
        !window.confirm(
          `Delete procedural program "${activeOptionLabel || targetLabel}"? This cannot be undone.`,
        )
      ) {
        return;
      }

      let nextAuthoredTargets = authoredProceduralTargets;
      if (authoredProgramId) {
        nextAuthoredTargets = authoredProceduralTargets.filter(
          (target) => target.targetId !== deletingTargetId,
        );
      } else if (deletingTargetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
        setHiddenBundleProceduralTargetIds((previous) => ({
          ...previous,
          [deletingTargetId]: true,
        }));
        setBundleProceduralSnapshotOverrides((previous) => {
          const { [deletingTargetId]: _removed, ...rest } = previous;
          return rest;
        });
      }

      const remainingBundleTargets = bundleProceduralTargetOptions.filter(
        (option) => option.value !== deletingTargetId,
      );

      if (
        nextAuthoredTargets.length === 0 &&
        remainingBundleTargets.length === 0
      ) {
        setAuthoredProceduralTargets([]);
        setSelectedProceduralTargetId(null);
        setActiveInspectorTarget((previous) =>
          previous?.kind === "program-target" ||
          previous?.kind === "motiongraph-node"
            ? null
            : previous,
        );
        useEditorStore.getState().clear();
        return;
      }

      setAuthoredProceduralTargets(nextAuthoredTargets);
      const nextTargetId =
        nextAuthoredTargets[0]?.targetId ?? remainingBundleTargets[0]!.value;
      setSelectedProceduralTargetId(nextTargetId);
    },
    [
      authoredProceduralTargets,
      bundleProceduralTargetOptions,
      proceduralTargetOptions,
      setBundleProceduralSnapshotOverrides,
      setHiddenBundleProceduralTargetIds,
    ],
  );
  const handleInspectAnimationTarget = useCallback(
    (targetId: string) => {
      setActiveAuthoringSurface("animations");
      openInspectorForTarget({ kind: "animation-target", targetId });
      setWorkspacePanelVisibility("animation", true);
      uiActions.setActiveRuntimeSource("animation");
      selectAnimationTrack(null);
      selectAnimationKeyframe(null);
      handleSelectAnimationTarget(targetId);
    },
    [
      handleSelectAnimationTarget,
      openInspectorForTarget,
      selectAnimationKeyframe,
      selectAnimationTrack,
      setWorkspacePanelVisibility,
      uiActions,
    ],
  );
  const handleInspectProgramTarget = useCallback(
    (targetId: string) => {
      setActiveAuthoringSurface("programs");
      openInspectorForTarget({ kind: "program-target", targetId });
      setWorkspacePanelVisibility("motiongraphPalette", true);
      setWorkspacePanelVisibility("motiongraph", true);
      uiActions.setActiveRuntimeSource("procedural-animation-programming");
      useEditorStore.getState().setSelected(null);
      handleSelectProceduralTarget(targetId);
    },
    [
      handleSelectProceduralTarget,
      openInspectorForTarget,
      setWorkspacePanelVisibility,
      uiActions,
    ],
  );
  const handleCreateAndInspectAnimationTarget = useCallback(() => {
    setActiveAuthoringSurface("animations");
    setWorkspacePanelVisibility("animation", true);
    uiActions.setActiveRuntimeSource("animation");
    handleCreateAnimationTarget();
  }, [handleCreateAnimationTarget, setWorkspacePanelVisibility, uiActions]);
  const handleCreateAndInspectProgramTarget = useCallback(() => {
    setActiveAuthoringSurface("programs");
    setWorkspacePanelVisibility("motiongraphPalette", true);
    setWorkspacePanelVisibility("motiongraph", true);
    uiActions.setActiveRuntimeSource("procedural-animation-programming");
    handleCreateProceduralTarget();
  }, [handleCreateProceduralTarget, setWorkspacePanelVisibility, uiActions]);
  const handlePlayAnimationTarget = useCallback(
    (targetId: string) => {
      uiActions.setActiveRuntimeSource("animation");
      setWorkspacePanelVisibility("animation", true);
      if (targetId !== selectedAnimationTargetId) {
        handleSelectAnimationTarget(targetId);
      }
      if (
        targetId === activeAnimationRuntimeTargetId &&
        animationPlaybackState === "playing"
      ) {
        return;
      }
      if (
        activeAnimationRuntimeTargetId &&
        activeAnimationRuntimeTargetId !== targetId
      ) {
        clearAnimationRuntimeState();
      }
      if (
        targetId === activeAnimationRuntimeTargetId &&
        animationPlaybackState === "paused" &&
        animationRuntimeTransportAdapter
      ) {
        animationRuntimeTransportAdapter.setAnimationLoop(
          AUTHORED_TIMELINE_CLIP_ID,
          animationLoopEnabled,
        );
        animationRuntimeTransportAdapter.seekAnimation(
          AUTHORED_TIMELINE_CLIP_ID,
          animationCurrentTime,
        );
        void animationRuntimeTransportAdapter.playAnimation(
          AUTHORED_TIMELINE_CLIP_ID,
          {
            reset: false,
            speed: animationPlaySpeed,
          },
        );
        setPendingAnimationRuntimePlayTargetId(null);
        return;
      }
      startAnimationRuntimeSession(targetId);
    },
    [
      activeAnimationRuntimeTargetId,
      startAnimationRuntimeSession,
      animationCurrentTime,
      animationLoopEnabled,
      animationPlaySpeed,
      animationPlaybackState,
      animationRuntimeTransportAdapter,
      clearAnimationRuntimeState,
      handleSelectAnimationTarget,
      selectedAnimationTargetId,
      uiActions,
      setWorkspacePanelVisibility,
    ],
  );
  const handlePauseAnimationTarget = useCallback(
    (targetId: string) => {
      const runtimeTargetId =
        targetId === activeAnimationRuntimeTargetId
          ? targetId
          : activeAnimationRuntimeTargetId;
      if (!runtimeTargetId) {
        return;
      }
      uiActions.setActiveRuntimeSource("animation");
      animationRuntimeTransportAdapter?.pauseAnimation(
        AUTHORED_TIMELINE_CLIP_ID,
      );
    },
    [
      activeAnimationRuntimeTargetId,
      animationRuntimeTransportAdapter,
      uiActions,
    ],
  );
  /**
   * Stop halts the clip and rewinds to the start, keeping the runtime session
   * alive.
   *
   * It deliberately does not tear the session down: clearing the active
   * runtime target unregisters the animation source and mutes the clip to
   * zero tracks, so the next Play has to re-activate and re-register
   * everything. Halting in place keeps the clip registered, so Play resumes
   * immediately — and the runtime's own stop already rewinds the player and
   * emits the clip's t=0 pose.
   */
  const handleStopAnimationTarget = useCallback(
    (targetId: string) => {
      const runtimeTargetId =
        targetId === activeAnimationRuntimeTargetId
          ? targetId
          : activeAnimationRuntimeTargetId;
      if (!runtimeTargetId) {
        return;
      }
      uiActions.setActiveRuntimeSource("animation");
      setPendingAnimationRuntimePlayTargetId(null);
      animationRuntimeTransportAdapter?.stopAnimation(
        AUTHORED_TIMELINE_CLIP_ID,
        { clearOutputs: true },
      );
      stopAnimationTransportState();
    },
    [
      activeAnimationRuntimeTargetId,
      animationRuntimeTransportAdapter,
      stopAnimationTransportState,
      uiActions,
    ],
  );
  const handlePlayProgramTarget = useCallback(
    (targetId: string) => {
      uiActions.setActiveRuntimeSource("procedural-animation-programming");
      setWorkspacePanelVisibility("motiongraph", true);
      if (targetId !== selectedProceduralTargetId) {
        handleSelectProceduralTarget(targetId);
      }
      if (
        targetId === activeProgramRuntimeTargetId &&
        programRuntimePlaybackState === "playing"
      ) {
        return;
      }
      setActiveProgramRuntimeTargetId(targetId);
      setProgramRuntimePlaybackState("playing");
    },
    [
      activeProgramRuntimeTargetId,
      handleSelectProceduralTarget,
      programRuntimePlaybackState,
      selectedProceduralTargetId,
      setWorkspacePanelVisibility,
      uiActions,
    ],
  );
  const handlePauseProgramTarget = useCallback(
    (targetId: string) => {
      if (
        !activeProgramRuntimeTargetId ||
        targetId !== activeProgramRuntimeTargetId
      ) {
        return;
      }
      uiActions.setActiveRuntimeSource("procedural-animation-programming");
      setProgramRuntimePlaybackState("paused");
    },
    [activeProgramRuntimeTargetId, uiActions],
  );
  const handleStopProgramTarget = useCallback(
    (targetId: string) => {
      if (
        !activeProgramRuntimeTargetId ||
        targetId !== activeProgramRuntimeTargetId
      ) {
        return;
      }
      uiActions.setActiveRuntimeSource("procedural-animation-programming");
      clearProgramRuntimeState();
    },
    [activeProgramRuntimeTargetId, clearProgramRuntimeState, uiActions],
  );
  const handleRenameAnimationTarget = useCallback(
    (targetId: string, nextName: string) => {
      const authoredClipId = parseAuthoredAnimationTargetValue(targetId);
      if (authoredClipId) {
        setAuthoredAnimationTargets((previous) =>
          previous.map((target) =>
            target.targetId === targetId || target.clipId === authoredClipId
              ? { ...target, name: nextName }
              : target,
          ),
        );
        return;
      }
      if (!targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        return;
      }
      setBundleAnimationNameOverrides((previous) => ({
        ...previous,
        [targetId]: nextName,
      }));
    },
    [],
  );
  const handleUpdateAnimationTargetDuration = useCallback(
    (targetId: string, nextDuration: number) => {
      if (!Number.isFinite(nextDuration) || nextDuration < 0) {
        return;
      }

      const normalizedDuration = Math.max(0, nextDuration);
      const authoredClipId = parseAuthoredAnimationTargetValue(targetId);
      if (authoredClipId) {
        if (targetId !== selectedAnimationTargetId) {
          return;
        }
        setAnimationDuration(normalizedDuration);
        saveAnimationTarget(targetId);
        return;
      }
      if (!targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        return;
      }
      setBundleAnimationDurationOverrides((previous) => ({
        ...previous,
        [targetId]: normalizedDuration,
      }));
      if (targetId === selectedAnimationTargetId) {
        setAnimationDuration(normalizedDuration);
      }
    },
    [
      saveAnimationTarget,
      selectedAnimationTargetId,
      setAnimationDuration,
      setBundleAnimationDurationOverrides,
    ],
  );
  const handleInspectAnimationTrackFromInspector = useCallback(
    (trackId: string) => {
      if (!selectedAnimationTargetId) {
        return;
      }
      setActiveAuthoringSurface("animations");
      openInspectorForTarget({
        kind: "animation-track",
        targetId: selectedAnimationTargetId,
        trackId,
      });
      setWorkspacePanelVisibility("animation", true);
      uiActions.setActiveRuntimeSource("animation");
      selectAnimationKeyframe(null);
      selectAnimationTrack(trackId);
    },
    [
      openInspectorForTarget,
      selectedAnimationTargetId,
      selectAnimationKeyframe,
      selectAnimationTrack,
      setWorkspacePanelVisibility,
      uiActions,
    ],
  );
  const handleInspectAnimationTrackFromTimeline = useCallback(
    (trackId: string) => {
      if (!selectedAnimationTargetId) {
        return;
      }
      setActiveAuthoringSurface("animations");
      openInspectorForTarget({
        kind: "animation-track",
        targetId: selectedAnimationTargetId,
        trackId,
      });
      setWorkspacePanelVisibility("animation", true);
      uiActions.setActiveRuntimeSource("animation");
    },
    [
      openInspectorForTarget,
      selectedAnimationTargetId,
      setWorkspacePanelVisibility,
      uiActions,
    ],
  );
  const handleRenameProgramTarget = useCallback(
    (targetId: string, nextName: string) => {
      const authoredProgramId = parseAuthoredProceduralTargetValue(targetId);
      if (authoredProgramId) {
        setAuthoredProceduralTargets((previous) =>
          previous.map((target) =>
            target.targetId === targetId ||
            target.programId === authoredProgramId
              ? { ...target, name: nextName }
              : target,
          ),
        );
        return;
      }
      if (!targetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
        return;
      }
      setBundleProceduralNameOverrides((previous) => ({
        ...previous,
        [targetId]: nextName,
      }));
    },
    [],
  );

  const authoredProceduralProgramsForExport = useMemo(() => {
    const activeAuthoredProgramId = parseAuthoredProceduralTargetValue(
      selectedProceduralTargetId,
    );
    const activeImportedProgram =
      selectedProceduralTargetId &&
      selectedProceduralTargetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)
        ? selectedProceduralTargetId
        : null;
    const liveActiveSnapshot = activeAuthoredProgramId
      ? {
          nodes: structuredClone(proceduralEditorNodes),
          edges: structuredClone(proceduralEditorEdges),
          enabledOutputs: Array.from(proceduralEditorEnabledOutputs),
          enabledInputs: Array.from(proceduralEditorEnabledInputs),
          customInputPaths: [...proceduralEditorCustomInputPaths],
        }
      : null;
    const authoredEntries = authoredProceduralTargets
      .map<AuthoredMotionGraphExportEntry | null>((target) => {
        const snapshot =
          liveActiveSnapshot &&
          selectedAuthoredProceduralTarget &&
          target.targetId === selectedAuthoredProceduralTarget.targetId
            ? liveActiveSnapshot
            : target.snapshot;
        const spec = buildProceduralExportSpec(snapshot);
        if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
          return null;
        }
        return {
          id: target.programId,
          label: target.name,
          spec,
        };
      })
      .filter(
        (entry): entry is AuthoredMotionGraphExportEntry => entry !== null,
      );
    const importedEntries = bundleProceduralTargetOptions
      .map<AuthoredMotionGraphExportEntry | null>((target) => {
        const entry = resolveBundleProceduralEntry(target.value);
        if (!entry?.id) {
          return null;
        }
        const originalSnapshot = resolveImportedProceduralBaseSnapshot(
          target.value,
        );
        if (
          !originalSnapshot ||
          !entry.spec ||
          typeof entry.spec !== "object"
        ) {
          return null;
        }
        const currentSnapshot =
          activeImportedProgram === target.value
            ? snapshotProceduralEditorState()
            : bundleProceduralSnapshotOverrides[target.value]
              ? structuredClone(
                  bundleProceduralSnapshotOverrides[target.value]!,
                )
              : null;
        const spec =
          currentSnapshot &&
          stableValueFingerprint(currentSnapshot) !==
            stableValueFingerprint(originalSnapshot)
            ? buildProceduralExportSpec(currentSnapshot)
            : structuredClone(
                entry.spec as { nodes: unknown[]; edges: unknown[] },
              );
        if (!spec || !Array.isArray(spec.nodes) || spec.nodes.length === 0) {
          return null;
        }
        return {
          id: entry.id,
          label: target.label,
          spec,
        };
      })
      .filter(
        (entry): entry is AuthoredMotionGraphExportEntry => entry !== null,
      );
    return [...authoredEntries, ...importedEntries];
  }, [
    authoredProceduralTargets,
    bundleProceduralSnapshotOverrides,
    bundleProceduralTargetOptions,
    proceduralEditorCustomInputPaths,
    proceduralEditorEdges,
    proceduralEditorEnabledInputs,
    proceduralEditorEnabledOutputs,
    proceduralEditorNodes,
    resolveBundleProceduralEntry,
    resolveImportedProceduralBaseSnapshot,
    selectedAuthoredProceduralTarget,
    selectedProceduralTargetId,
  ]);

  const activeMotionGraphIdForExport = useMemo<string | null>(() => {
    if (
      effectiveProgramRuntimePlaybackState !== "playing" ||
      !activeProgramRuntimeTargetId
    ) {
      return null;
    }
    const authored = authoredProceduralTargets.find(
      (t) => t.targetId === activeProgramRuntimeTargetId,
    );
    if (authored) {
      return authored.programId;
    }
    const importedEntry = resolveBundleProceduralEntry(
      activeProgramRuntimeTargetId,
    );
    return importedEntry?.id ?? null;
  }, [
    effectiveProgramRuntimePlaybackState,
    activeProgramRuntimeTargetId,
    authoredProceduralTargets,
    resolveBundleProceduralEntry,
  ]);

  const loadingSessionActive =
    loader.faceLoadSessionStartedAtMs !== null &&
    loader.faceLoadSessionCompletedAtMs === null;
  const loadingCoordinatorSettled = faceLoadInFlightOperationCount === 0;
  const deterministicMilestoneChainReady =
    faceLoadMilestones["asset-loaded"] !== null &&
    faceLoadMilestones["bundle-synced"] !== null &&
    faceLoadMilestones["graph-ready"] !== null;
  const exportSessionKey =
    faceLoadSessionToken ??
    `${sourceName ?? "__no-source__"}:${rootId ?? "__no-root__"}`;
  const exportSessionReady =
    Boolean(rootId) &&
    deterministicMilestoneChainReady &&
    loadingCoordinatorSettled &&
    !loadingSessionActive &&
    !isLoading;
  const exportDirtySnapshot = useMemo(
    () =>
      buildGlbExportDirtySnapshot({
        faceId,
        includeVizijBundle,
        includeImportedAnimations,
        animatables,
        animatableComponents,
        featureLabelOverrides,
        standardInputs,
        bindings,
        inputBindings,
        pipelineMetadataV1,
        poseGraphSpec: poseRig.poseGraphSpec,
        poseGraphFileName: poseRig.poseGraphFileName,
        poseConfigDraft: poseRig.poseConfigDraft,
        poseIrDraft: poseRig.poseIrDraft,
        blendMode: poseRig.blendMode,
        crossGroupBlendMode: poseRig.crossGroupBlendMode,
        authoredAnimationClips: authoredAnimationClipsForExport,
        authoredMotionGraphs: authoredProceduralProgramsForExport,
        carriedGraphs: carriedBundleGraphs(loader.bundle),
      }),
    [
      animatableComponents,
      animatables,
      authoredAnimationClipsForExport,
      authoredProceduralProgramsForExport,
      bindings,
      loader.bundle,
      faceId,
      featureLabelOverrides,
      includeImportedAnimations,
      includeVizijBundle,
      inputBindings,
      pipelineMetadataV1,
      poseRig.blendMode,
      poseRig.crossGroupBlendMode,
      poseRig.poseConfigDraft,
      poseRig.poseGraphFileName,
      poseRig.poseGraphSpec,
      poseRig.poseIrDraft,
      standardInputs,
    ],
  );
  const { isDirty: hasUnsavedGlbChanges, markSaved: markGlbExportSaved } =
    useExportDirtyState({
      sessionKey: exportSessionKey,
      ready: exportSessionReady,
      snapshot: exportDirtySnapshot,
    });

  const handleRegisterGlbExportHandler = useCallback(
    (handler: (() => Promise<void>) | null) => {
      exportGlbHandlerRef.current = handler;
    },
    [],
  );
  const handleSaveExport = useCallback(() => {
    if (!canExport) {
      return;
    }
    const exportGlb = exportGlbHandlerRef.current;
    if (!exportGlb) {
      setShowExportDialog(true);
      return;
    }
    void exportGlb();
  }, [canExport]);

  useEffect(() => {
    if (
      !pendingAnimationRuntimePlayTargetId ||
      pendingAnimationRuntimePlayTargetId !== activeAnimationRuntimeTargetId ||
      !activeAnimationRuntimeClip ||
      !animationRuntimeTransportAdapter ||
      !animationTransportRuntimeReady
    ) {
      return;
    }
    let cancelled = false;
    let retryTimeoutId: number | null = null;

    const attemptPlay = () => {
      if (cancelled) {
        return;
      }
      // Match the transport contract (UI_DESIGN.md "Animation Transport
      // Contract" 1): Play starts from the current playhead, at the chosen
      // speed. This path used to pass `{ reset: true, speed: 1 }`, so the
      // first Play of a session silently rewound to 0 and ignored the speed
      // dropdown — while the resume path a few lines up did it correctly.
      // Read the transport settings imperatively rather than closing over
      // them: `currentTime` changes on every playhead tick, so having it in
      // this effect's dependencies would restart playback continuously.
      const {
        currentTime: playFromTime,
        loop: playLoop,
        playSpeed,
      } = useAnimationStore.getState();
      animationRuntimeTransportAdapter.setAnimationLoop(
        AUTHORED_TIMELINE_CLIP_ID,
        playLoop,
      );
      animationRuntimeTransportAdapter.seekAnimation(
        AUTHORED_TIMELINE_CLIP_ID,
        playFromTime,
      );
      const playPromise = animationRuntimeTransportAdapter.playAnimation(
        AUTHORED_TIMELINE_CLIP_ID,
        { reset: false, speed: playSpeed },
      );
      if (
        animationRuntimeTransportAdapter.getAnimationState(
          AUTHORED_TIMELINE_CLIP_ID,
        )
      ) {
        setPendingAnimationRuntimePlayTargetId(null);
        void playPromise.catch((error) => {
          if (!cancelled) {
            console.error(
              "[vizij-authoring] animation runtime playback failed",
              error,
            );
          }
        });
        return;
      }
      void playPromise.catch((error) => {
        if (
          error instanceof Error &&
          error.message.includes("is not part of the current asset bundle")
        ) {
          return;
        }
        if (!cancelled) {
          console.error(
            "[vizij-authoring] animation runtime playback failed",
            error,
          );
        }
      });
      retryTimeoutId = window.setTimeout(attemptPlay, 50);
    };

    attemptPlay();
    return () => {
      cancelled = true;
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId);
      }
    };
  }, [
    activeAnimationRuntimeClip,
    activeAnimationRuntimeTargetId,
    animationTransportRuntimeReady,
    animationRuntimeTransportAdapter,
    pendingAnimationRuntimePlayTargetId,
  ]);

  useBundleSynchronizer({
    faceId,
    rootId: loader.rootId,
    loadedBundle: loader.bundle,
    standardInputCount,
    skipDiscrepancyCheck,
    importGraphSpec: handleImportGraphSpec,
    canImportRigGraph: canImportRigGraphFromBundle,
    adoptFaceId: handleFaceIdChange,
    importPoseConfigFromData: poseRig.importPoseConfigFromData,
    resetPoseState: poseRig.resetPoseState,
    onPhaseChange: onFaceLoadPhaseChange,
  });

  const sceneRotationInputs = useMemo(
    () => resolveRootSceneRotationInputs(managedStandardInputs, rootId),
    [managedStandardInputs, rootId],
  );

  const orientationAxisAvailability = useMemo(
    () => ({
      x: Boolean(sceneRotationInputs.x),
      y: Boolean(sceneRotationInputs.y),
      z: Boolean(sceneRotationInputs.z),
    }),
    [sceneRotationInputs],
  );

  const orientationAxisDegrees = useMemo(
    () => ({
      x: sceneRotationInputs.x
        ? radiansToRoundedDegrees(sceneRotationInputs.x.defaultValue)
        : 0,
      y: sceneRotationInputs.y
        ? radiansToRoundedDegrees(sceneRotationInputs.y.defaultValue)
        : 0,
      z: sceneRotationInputs.z
        ? radiansToRoundedDegrees(sceneRotationInputs.z.defaultValue)
        : 0,
    }),
    [sceneRotationInputs],
  );

  const handleOrientationDialogClose = useCallback(() => {
    setShowOrientationDialog(false);
  }, []);

  const handleRotateSceneOrientation = useCallback(
    (axis: RotationAxis, direction: -1 | 1) => {
      const target = sceneRotationInputs[axis];
      if (!target) {
        return;
      }
      const nextDefaultValue =
        target.defaultValue + direction * QUARTER_TURN_RADIANS;
      handleUpdateStandardInput(target.inputId, {
        defaultValue: nextDefaultValue,
      });
      mainFaceHandleInputValueChange(target.inputId, nextDefaultValue);
    },
    [
      handleUpdateStandardInput,
      mainFaceHandleInputValueChange,
      sceneRotationInputs,
    ],
  );

  useEffect(() => {
    if (!rootId || !faceLoadSessionToken) {
      setShowOrientationDialog(false);
      return;
    }
    if (faceLoadMilestones["asset-loaded"] === null) {
      return;
    }
    if (loadedBundle !== null) {
      setShowOrientationDialog(false);
      return;
    }
    if (orientationPromptSessionToken === faceLoadSessionToken) {
      return;
    }
    setOrientationPromptSessionToken(faceLoadSessionToken);
    setShowOrientationDialog(true);
  }, [
    faceLoadMilestones,
    faceLoadSessionToken,
    loadedBundle,
    orientationPromptSessionToken,
    rootId,
  ]);

  const hierarchyPanelVisible = useWorkspaceStore(
    (state) => state.panels.hierarchy.isVisible,
  );
  const variablesPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.variables.isVisible,
  );
  const posesPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.poses.isVisible,
  );
  const materialsPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.materials.isVisible,
  );
  const inputsPanelTabVisible = useWorkspaceStore(
    (state) => state.panels.inputs.isVisible,
  );
  const referenceFacePanelVisible = useWorkspaceStore(
    (state) => state.panels.referenceFace.isVisible,
  );
  const animationPanelVisible = useWorkspaceStore(
    (state) => state.panels.animation.isVisible,
  );
  const motionGraphPanelVisible = useWorkspaceStore(
    (state) => state.panels.motiongraph.isVisible,
  );
  const motionGraphPalettePanelVisible = useWorkspaceStore(
    (state) => state.panels.motiongraphPalette.isVisible,
  );
  const inspectorPanelVisible = useWorkspaceStore(
    (state) => state.panels.inspector.isVisible,
  );
  const speechPanelVisible = useWorkspaceStore(
    (state) => state.panels.speech.isVisible,
  );
  const debugPanelVisible = useWorkspaceStore(
    (state) => state.panels.debug.isVisible,
  );
  useEffect(() => {
    applyEditFocusPanelDefaults(activeEditFocus, setWorkspacePanelVisibility);
  }, [activeEditFocus, setWorkspacePanelVisibility]);
  useEffect(() => {
    if (activeEditFocus === "animation") {
      uiActions.setActiveRuntimeSource("animation");
      return;
    }
    if (activeEditFocus === "procedural-animation-programming") {
      uiActions.setActiveRuntimeSource("procedural-animation-programming");
    }
  }, [activeEditFocus, uiActions]);
  const centerAuthoringMode: CenterAuthoringMode = motionGraphPanelVisible
    ? "procedural-animation-programming"
    : animationPanelVisible
      ? "animation"
      : referenceFacePanelVisible
        ? "reference-face"
        : "none";
  const selectedAnimationPanelPlaybackState: RuntimePlaybackState =
    resolvedSelectedAnimationTargetId &&
    resolvedSelectedAnimationTargetId === activeAnimationRuntimeTargetId
      ? effectiveAnimationRuntimePlaybackState
      : "stopped";
  const selectedProgramPanelPlaybackState: RuntimePlaybackState =
    resolvedSelectedProceduralTargetId &&
    resolvedSelectedProceduralTargetId === activeProgramRuntimeTargetId
      ? effectiveProgramRuntimePlaybackState
      : "stopped";
  const selectedAnimationCanPauseOrStop =
    resolvedSelectedAnimationTargetId !== null &&
    resolvedSelectedAnimationTargetId === activeAnimationRuntimeTargetId;
  const selectedProgramCanPauseOrStop =
    resolvedSelectedProceduralTargetId !== null &&
    resolvedSelectedProceduralTargetId === activeProgramRuntimeTargetId;
  const activeAnimationRuntimeName = activeAnimationRuntimeTargetId
    ? (animationTargetLabelById.get(activeAnimationRuntimeTargetId) ??
      "Untitled Clip")
    : null;
  const activeProgramRuntimeName = activeProgramRuntimeTargetId
    ? (programTargetLabelById.get(activeProgramRuntimeTargetId) ??
      "Untitled Program")
    : null;
  const animationPanelStatusMessage =
    activeAnimationRuntimeTargetId &&
    resolvedSelectedAnimationTargetId !== activeAnimationRuntimeTargetId
      ? `Currently running: ${activeAnimationRuntimeName}`
      : null;
  const programPanelStatusMessage =
    activeProgramRuntimeTargetId &&
    resolvedSelectedProceduralTargetId !== activeProgramRuntimeTargetId
      ? `Currently running: ${activeProgramRuntimeName}`
      : null;
  const handlePlayAnimationRuntime = useCallback(() => {
    if (resolvedSelectedAnimationTargetId) {
      handlePlayAnimationTarget(resolvedSelectedAnimationTargetId);
    }
  }, [handlePlayAnimationTarget, resolvedSelectedAnimationTargetId]);
  const handlePauseAnimationRuntime = useCallback(() => {
    if (selectedAnimationCanPauseOrStop && resolvedSelectedAnimationTargetId) {
      handlePauseAnimationTarget(resolvedSelectedAnimationTargetId);
    }
  }, [
    handlePauseAnimationTarget,
    resolvedSelectedAnimationTargetId,
    selectedAnimationCanPauseOrStop,
  ]);
  const handleStopAnimationRuntime = useCallback(() => {
    if (selectedAnimationCanPauseOrStop && resolvedSelectedAnimationTargetId) {
      handleStopAnimationTarget(resolvedSelectedAnimationTargetId);
    }
  }, [
    handleStopAnimationTarget,
    resolvedSelectedAnimationTargetId,
    selectedAnimationCanPauseOrStop,
  ]);
  const handlePlayProgramRuntime = useCallback(() => {
    if (resolvedSelectedProceduralTargetId) {
      handlePlayProgramTarget(resolvedSelectedProceduralTargetId);
    }
  }, [handlePlayProgramTarget, resolvedSelectedProceduralTargetId]);
  const handlePauseProgramRuntime = useCallback(() => {
    if (selectedProgramCanPauseOrStop && resolvedSelectedProceduralTargetId) {
      handlePauseProgramTarget(resolvedSelectedProceduralTargetId);
    }
  }, [
    handlePauseProgramTarget,
    resolvedSelectedProceduralTargetId,
    selectedProgramCanPauseOrStop,
  ]);
  const handleStopProgramRuntime = useCallback(() => {
    if (selectedProgramCanPauseOrStop && resolvedSelectedProceduralTargetId) {
      handleStopProgramTarget(resolvedSelectedProceduralTargetId);
    }
  }, [
    handleStopProgramTarget,
    resolvedSelectedProceduralTargetId,
    selectedProgramCanPauseOrStop,
  ]);
  const animationSourceActive = activeAnimationRuntimeClip !== null;
  const runtimeStatusLabel = useMemo(() => {
    const parts: string[] = [];
    if (activeAnimationRuntimeTargetId) {
      parts.push(
        `Animation: ${
          effectiveAnimationRuntimePlaybackState === "playing"
            ? "Playing"
            : effectiveAnimationRuntimePlaybackState === "paused"
              ? "Paused"
              : "Idle"
        }`,
      );
    }
    if (activeProgramRuntimeTargetId) {
      parts.push(
        `Program: ${
          effectiveProgramRuntimePlaybackState === "playing"
            ? "Playing"
            : effectiveProgramRuntimePlaybackState === "paused"
              ? "Paused"
              : "Idle"
        }`,
      );
    }
    if (parts.length > 0) {
      return parts.join(" · ");
    }
    return "Runtime: Idle";
  }, [
    activeAnimationRuntimeTargetId,
    activeProgramRuntimeTargetId,
    effectiveAnimationRuntimePlaybackState,
    effectiveProgramRuntimePlaybackState,
  ]);
  const runtimeActions = useMemo(
    () =>
      [
        activeAnimationRuntimeTargetId
          ? {
              label: "Stop Animation",
              onClick: clearAnimationRuntimeState,
              title: "Stop the active animation",
              disabled: effectiveAnimationRuntimePlaybackState === "stopped",
              testId: "main-runtime-stop-animation",
            }
          : null,
        activeProgramRuntimeTargetId
          ? {
              label: "Stop Program",
              onClick: clearProgramRuntimeState,
              title: "Stop the active procedural program",
              disabled: effectiveProgramRuntimePlaybackState === "stopped",
              testId: "main-runtime-stop-program",
            }
          : null,
      ].filter(
        (action): action is NonNullable<typeof action> => action !== null,
      ),
    [
      activeAnimationRuntimeTargetId,
      activeProgramRuntimeTargetId,
      clearAnimationRuntimeState,
      clearProgramRuntimeState,
      effectiveAnimationRuntimePlaybackState,
      effectiveProgramRuntimePlaybackState,
    ],
  );
  const viewerRuntimeControlKind = useMemo<
    "animation" | "program" | null
  >(() => {
    if (activeAnimationRuntimeTargetId && activeProgramRuntimeTargetId) {
      return null;
    }
    if (activeProgramRuntimeTargetId) {
      return "program";
    }
    if (activeAnimationRuntimeTargetId) {
      return "animation";
    }
    const canPlayProgram = Boolean(
      resolvedSelectedProceduralTargetId && selectedProgramRuntimeSnapshot,
    );
    const canPlayAnimation = Boolean(resolvedSelectedAnimationTargetId);
    if (canPlayProgram === canPlayAnimation) {
      return null;
    }
    return canPlayProgram ? "program" : "animation";
  }, [
    activeAnimationRuntimeTargetId,
    activeProgramRuntimeTargetId,
    resolvedSelectedAnimationTargetId,
    resolvedSelectedProceduralTargetId,
    selectedProgramRuntimeSnapshot,
  ]);
  const viewerRuntimePlaybackState: RuntimePlaybackState | undefined =
    viewerRuntimeControlKind === "program"
      ? effectiveProgramRuntimePlaybackState
      : viewerRuntimeControlKind === "animation"
        ? effectiveAnimationRuntimePlaybackState
        : undefined;
  const handleViewerPlayRuntime = useCallback(() => {
    if (viewerRuntimeControlKind === "program") {
      const targetId =
        activeProgramRuntimeTargetId ?? resolvedSelectedProceduralTargetId;
      if (targetId) {
        handlePlayProgramTarget(targetId);
      }
      return;
    }
    if (viewerRuntimeControlKind === "animation") {
      const targetId =
        activeAnimationRuntimeTargetId ?? resolvedSelectedAnimationTargetId;
      if (targetId) {
        handlePlayAnimationTarget(targetId);
      }
    }
  }, [
    activeAnimationRuntimeTargetId,
    activeProgramRuntimeTargetId,
    handlePlayAnimationTarget,
    handlePlayProgramTarget,
    resolvedSelectedAnimationTargetId,
    resolvedSelectedProceduralTargetId,
    viewerRuntimeControlKind,
  ]);
  const handleViewerPauseRuntime = useCallback(() => {
    if (
      viewerRuntimeControlKind === "program" &&
      activeProgramRuntimeTargetId
    ) {
      handlePauseProgramTarget(activeProgramRuntimeTargetId);
      return;
    }
    if (
      viewerRuntimeControlKind === "animation" &&
      activeAnimationRuntimeTargetId
    ) {
      handlePauseAnimationTarget(activeAnimationRuntimeTargetId);
    }
  }, [
    activeAnimationRuntimeTargetId,
    activeProgramRuntimeTargetId,
    handlePauseAnimationTarget,
    handlePauseProgramTarget,
    viewerRuntimeControlKind,
  ]);
  const viewerPlayRuntime =
    viewerRuntimeControlKind === null ? undefined : handleViewerPlayRuntime;
  const viewerPauseRuntime =
    viewerRuntimePlaybackState === "playing"
      ? handleViewerPauseRuntime
      : undefined;
  const visibleVariablesSurfaces = useMemo(
    () =>
      getVisibleVariablesSurfaces({
        variables: { isVisible: variablesPanelTabVisible },
        poses: { isVisible: posesPanelTabVisible },
        materials: { isVisible: materialsPanelTabVisible },
        inputs: { isVisible: inputsPanelTabVisible },
      }),
    [
      inputsPanelTabVisible,
      materialsPanelTabVisible,
      posesPanelTabVisible,
      variablesPanelTabVisible,
    ],
  );
  const inputControlSurfaces = useMemo(
    () => visibleVariablesSurfaces.filter((surface) => surface === "inputs"),
    [visibleVariablesSurfaces],
  );
  const controlAuthoringSurfaces = useMemo<AuthoringSurface[]>(
    () =>
      visibleVariablesSurfaces.filter(
        (surface): surface is AuthoringSurface => surface !== "inputs",
      ),
    [visibleVariablesSurfaces],
  );
  const controlAuthoringPanelVisible = controlAuthoringSurfaces.length > 0;
  const authoringSurfaces = useMemo<AuthoringSurface[]>(
    () =>
      controlAuthoringPanelVisible
        ? [...controlAuthoringSurfaces, "animations", "programs"]
        : controlAuthoringSurfaces,
    [controlAuthoringPanelVisible, controlAuthoringSurfaces],
  );
  useEffect(() => {
    if (authoringSurfaces.length === 0) {
      return;
    }
    if (authoringSurfaces.includes(activeAuthoringSurface)) {
      return;
    }
    setActiveAuthoringSurface(authoringSurfaces[0]!);
  }, [activeAuthoringSurface, authoringSurfaces]);
  const inputControlsPanelVisible = inputControlSurfaces.length > 0;
  const centerPanelDefaultSize = activeEditFocus === "pose-editing" ? 40 : 60;
  const rightSidebarDefaultSize = activeEditFocus === "pose-editing" ? 40 : 20;
  const rightSidebarResetKey =
    activeEditFocus === "pose-editing" ? "pose-editing" : "default";
  const handleHideControlAuthoringPanel = useCallback(() => {
    setWorkspacePanelVisibility("variables", false);
    setWorkspacePanelVisibility("poses", false);
    setWorkspacePanelVisibility("materials", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideHierarchyPanel = useCallback(() => {
    setWorkspacePanelVisibility("hierarchy", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideInputControlsPanel = useCallback(() => {
    setWorkspacePanelVisibility("inputs", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideInspectorPanel = useCallback(() => {
    setWorkspacePanelVisibility("inspector", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideAnimationPanel = useCallback(() => {
    setWorkspacePanelVisibility("animation", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideMotionGraphPanel = useCallback(() => {
    setWorkspacePanelVisibility("motiongraph", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideMotionGraphPalettePanel = useCallback(() => {
    setWorkspacePanelVisibility("motiongraphPalette", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideReferenceFacePanel = useCallback(() => {
    setWorkspacePanelVisibility("referenceFace", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideSpeechPanel = useCallback(() => {
    setWorkspacePanelVisibility("speech", false);
  }, [setWorkspacePanelVisibility]);
  const handleHideDebugPanel = useCallback(() => {
    setWorkspacePanelVisibility("debug", false);
  }, [setWorkspacePanelVisibility]);
  const {
    selectedId,
    selectedRigId,
    selectedPoseId,
    selectedMaterialId,
    selectedMotionGraphNodeId,
    handleSelectObject,
    handleSelectPose,
    handleSelectRig,
    handleSelectMaterial,
    handleSelectMotionGraphNode,
    handleClearSelection,
  } = useUnifiedSelection();
  const selectedSceneId = selectedId;
  const clearPoseGraphInspectorSelection = useCallback(() => {
    setSelectedPoseGroup(null);
    setSelectedBlendStage(null);
  }, []);
  useEffect(() => {
    setActiveInspectorTarget((previous) => {
      const next = synchronizeActiveInspectorTarget(previous, {
        selectedSceneId,
        selectedRigId,
        selectedPoseId,
        selectedMaterialId,
        selectedPoseGroup,
        selectedBlendStage,
        selectedAnimationTargetId: resolvedSelectedAnimationTargetId,
        selectedAnimationTrackId,
        selectedProgramTargetId: resolvedSelectedProceduralTargetId,
        selectedMotionGraphNodeId,
      });
      return areActiveInspectorTargetsEqual(previous, next) ? previous : next;
    });
  }, [
    selectedSceneId,
    selectedRigId,
    selectedPoseId,
    selectedMaterialId,
    selectedPoseGroup,
    selectedBlendStage,
    resolvedSelectedAnimationTargetId,
    selectedAnimationTrackId,
    resolvedSelectedProceduralTargetId,
    selectedMotionGraphNodeId,
  ]);
  const handleSelectObjectWithInspectorSync = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      if (id) {
        clearPoseGraphInspectorSelection();
        openInspectorForTarget({ kind: "scene", id });
      }
      handleSelectObject(id, options);
    },
    [
      clearPoseGraphInspectorSelection,
      handleSelectObject,
      openInspectorForTarget,
    ],
  );
  const handleSelectRigWithInspectorSync = useCallback(
    (id: string | null) => {
      if (id) {
        clearPoseGraphInspectorSelection();
        openInspectorForTarget({ kind: "rig", id });
      }
      handleSelectRig(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectRig, openInspectorForTarget],
  );
  const handleClearSelectionWithInspectorSync = useCallback(() => {
    clearPoseGraphInspectorSelection();
    handleClearSelection();
  }, [clearPoseGraphInspectorSelection, handleClearSelection]);
  const handleSelectPoseWithInspectorSync = useCallback(
    (id: string) => {
      if (id) {
        clearPoseGraphInspectorSelection();
        openInspectorForTarget({ kind: "pose", id });
      }
      handleSelectPose(id);
    },
    [
      clearPoseGraphInspectorSelection,
      handleSelectPose,
      openInspectorForTarget,
    ],
  );
  const handleSelectPoseGroupWithInspectorSync = useCallback(
    (selection: PoseGroupInspectorSelection | null) => {
      if (selection) {
        openInspectorForTarget({
          kind: "pose-group",
          groupId: selection.groupId,
          groupPath: selection.groupPath,
        });
        if (selectedId) {
          handleClearSelection();
        }
        if (selectedRigId) {
          handleSelectRig(null);
        }
        if (selectedMaterialId) {
          handleSelectMaterial(null);
        }
        if (selectedMotionGraphNodeId) {
          handleSelectMotionGraphNode(null);
        }
        poseRig.selectPose("");
        setSelectedBlendStage(null);
      }
      setSelectedPoseGroup(selection);
    },
    [
      handleClearSelection,
      handleSelectMaterial,
      handleSelectRig,
      openInspectorForTarget,
      poseRig,
      selectedId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      selectedRigId,
      handleSelectMotionGraphNode,
    ],
  );
  const handleSelectBlendStageWithInspectorSync = useCallback(
    (selection: BlendStageInspectorSelection | null) => {
      if (selection) {
        openInspectorForTarget({ kind: "blend-stage", id: selection.id });
        if (selectedId) {
          handleClearSelection();
        }
        if (selectedRigId) {
          handleSelectRig(null);
        }
        if (selectedMaterialId) {
          handleSelectMaterial(null);
        }
        if (selectedMotionGraphNodeId) {
          handleSelectMotionGraphNode(null);
        }
        poseRig.selectPose("");
        setSelectedPoseGroup(null);
      }
      setSelectedBlendStage(selection);
    },
    [
      handleClearSelection,
      handleSelectMaterial,
      handleSelectRig,
      openInspectorForTarget,
      poseRig,
      selectedId,
      selectedMaterialId,
      selectedMotionGraphNodeId,
      selectedRigId,
      handleSelectMotionGraphNode,
    ],
  );
  const handleSelectMotionGraphNodeWithInspectorSync = useCallback(
    (id: string | null) => {
      if (id && selectedProceduralTargetId) {
        clearPoseGraphInspectorSelection();
        openInspectorForTarget({
          kind: "motiongraph-node",
          targetId: selectedProceduralTargetId,
          nodeId: id,
        });
      }
      handleSelectMotionGraphNode(id);
    },
    [
      clearPoseGraphInspectorSelection,
      handleSelectMotionGraphNode,
      openInspectorForTarget,
      selectedProceduralTargetId,
    ],
  );
  const handleInspectProgramNodeFromInspector = useCallback(
    (nodeId: string) => {
      setActiveAuthoringSurface("programs");
      setWorkspacePanelVisibility("motiongraphPalette", true);
      setWorkspacePanelVisibility("motiongraph", true);
      uiActions.setActiveRuntimeSource("procedural-animation-programming");
      handleSelectMotionGraphNodeWithInspectorSync(nodeId);
    },
    [
      handleSelectMotionGraphNodeWithInspectorSync,
      setWorkspacePanelVisibility,
      uiActions,
    ],
  );
  const handleInspectInputFromAuthoringInspector = useCallback(
    (inputId: string) => {
      handleSelectRigWithInspectorSync(inputId);
    },
    [handleSelectRigWithInspectorSync],
  );
  useEffect(() => {
    if (motionGraphPanelVisible) {
      return;
    }
    if (selectedMotionGraphNodeId) {
      handleSelectMotionGraphNode(null);
    }
  }, [
    motionGraphPanelVisible,
    selectedMotionGraphNodeId,
    handleSelectMotionGraphNode,
  ]);

  const sharedVariableSync = useSharedVariableSync({
    mainInputsById: mirrorableMainInputsById,
    mainInputValues: mainFaceInputValues,
    referenceInputs: referenceFaceContextValue.standardInputs,
    referenceInputValues: referenceFaceContextValue.inputValues,
    onMainInputValueChange: mainFaceHandleInputValueChange,
    onReferenceInputValueChange:
      referenceFaceContextValue.handleInputValueChange,
    initialPolicy: "off",
  });

  // Reference Face Import
  const refFaceFileInputRef = useRef<HTMLInputElement>(null);
  const handleRefFaceFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      referenceFaceContextValue.setFile(file);
      event.target.value = "";
    },
    [referenceFaceContextValue],
  );

  const handleImportReferenceFaceClick = useCallback(() => {
    refFaceFileInputRef.current?.click();
  }, []);

  // File Import Logic
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipNextDiscrepancyCheck = useRef(false);

  const handleNewClick = useCallback(() => {
    cancelPendingMainAssetFetch();
    resetAuthoringSessionState();
    loader.reset();
  }, [cancelPendingMainAssetFetch, loader, resetAuthoringSessionState]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        skipNextDiscrepancyCheck.current = false;
        return;
      }
      const skipChecks = skipNextDiscrepancyCheck.current;
      const sessionToken = beginImportFlow(
        skipChecks ? "File import (skip checks)" : "File import",
      );
      cancelPendingMainAssetFetch();
      markImportFileSelected({ sessionToken });

      if (skipChecks) {
        uiActions.setSkipDiscrepancyCheck(true);
      } else {
        uiActions.setSkipDiscrepancyCheck(false);
      }
      skipNextDiscrepancyCheck.current = false;

      await capturePendingAnimationImport(file);
      await loadFromFile(
        file,
        () => loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
        { sessionToken },
      );
      event.target.value = "";
    },
    [
      beginImportFlow,
      cancelPendingMainAssetFetch,
      capturePendingAnimationImport,
      loadFromFile,
      markImportFileSelected,
      uiActions,
    ],
  );

  const handleImportClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = false;
    fileInputRef.current?.click();
  }, []);

  const handleImportSkipChecksClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = true;
    fileInputRef.current?.click();
  }, []);

  const animationGlbInputRef = useRef<HTMLInputElement>(null);

  const handleImportGlbAnimationsClick = useCallback(() => {
    animationGlbInputRef.current?.click();
  }, []);

  const handleAnimationGlbFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }
      await importAnimationsFromGlbFile(file);
    },
    [importAnimationsFromGlbFile],
  );

  const {
    profiles: availableStandardProfiles,
    embeddedProfileIds,
    toggleProfile: toggleStandardProfile,
    exportProfileJson: exportStandardProfileJson,
    importProfileJson: importStandardProfileJson,
    replaceProfileSpec: replaceStandardProfileSpec,
  } = useStandardProfiles({
    bundle: loader.bundle,
    updateBundle: loader.updateBundle,
  });
  const handleEditStandardProfileGraph = useCallback(
    (profileId: string) => {
      const entry = (loader.bundle?.graphs ?? []).find(
        (graph) => embeddedProfileId(graph) === profileId,
      );
      if (!entry?.spec) {
        console.error(`no embedded profile ${profileId} to edit`);
        return;
      }
      // Park the current program's edits exactly like a target switch, then
      // let the profile session own the editor.
      if (selectedProceduralTargetId) {
        saveProceduralTarget(selectedProceduralTargetId);
      }
      setSelectedProceduralTargetId(null);
      const parsed = specToEditorState(entry.spec as Record<string, unknown>);
      hydrateProceduralEditorState({
        nodes: parsed.nodes,
        edges: parsed.edges,
        enabledOutputs: Array.from(parsed.enabledOutputs),
        enabledInputs: Array.from(parsed.enabledInputs),
        customInputPaths: [...parsed.customInputPaths],
      });
      setEditingProfileId(profileId);
      setWorkspacePanelVisibility("motiongraph", true);
    },
    [
      loader.bundle,
      saveProceduralTarget,
      selectedProceduralTargetId,
      setWorkspacePanelVisibility,
    ],
  );
  const applyStandardProfileEdits = useCallback(() => {
    if (!editingProfileId) {
      return;
    }
    const spec = buildProceduralExportSpec(snapshotProceduralEditorState());
    replaceStandardProfileSpec(
      editingProfileId,
      spec as Record<string, unknown>,
    );
    setEditingProfileId(null);
    const editorStore = useEditorStore.getState();
    editorStore.clear();
    editorStore.setSelected(null);
  }, [editingProfileId, replaceStandardProfileSpec]);
  const discardStandardProfileEdits = useCallback(() => {
    setEditingProfileId(null);
    const editorStore = useEditorStore.getState();
    editorStore.clear();
    editorStore.setSelected(null);
  }, []);
  // The profile whose "Replace from JSON..." picker is open — consumed when
  // the hidden input below delivers the chosen file.
  const replaceProfileIdRef = useRef<string | null>(null);
  const profileJsonInputRef = useRef<HTMLInputElement>(null);
  const handleReplaceStandardProfileJson = useCallback((profileId: string) => {
    replaceProfileIdRef.current = profileId;
    profileJsonInputRef.current?.click();
  }, []);
  const handleProfileJsonFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const profileId = replaceProfileIdRef.current;
      replaceProfileIdRef.current = null;
      event.target.value = "";
      if (file && profileId) {
        void importStandardProfileJson(profileId, file);
      }
    },
    [importStandardProfileJson],
  );

  const {
    skills: availableSkills,
    embeddedSkillIds,
    toggleSkill,
    exportSkillJson,
    importSkillJson,
    replaceSkillSpec,
  } = useSkills({
    bundle: loader.bundle,
    updateBundle: loader.updateBundle,
  });
  const handleEditSkillGraph = useCallback(
    (skillId: string) => {
      const entry = (loader.bundle?.graphs ?? []).find(
        (graph) => embeddedSkillId(graph) === skillId,
      );
      if (!entry?.spec) {
        console.error(`no embedded skill ${skillId} to edit`);
        return;
      }
      // Park the current program's edits exactly like a target switch, then
      // let the skill session own the editor.
      if (selectedProceduralTargetId) {
        saveProceduralTarget(selectedProceduralTargetId);
      }
      setSelectedProceduralTargetId(null);
      const parsed = specToEditorState(entry.spec as Record<string, unknown>);
      hydrateProceduralEditorState({
        nodes: parsed.nodes,
        edges: parsed.edges,
        enabledOutputs: Array.from(parsed.enabledOutputs),
        enabledInputs: Array.from(parsed.enabledInputs),
        customInputPaths: [...parsed.customInputPaths],
      });
      setEditingSkillId(skillId);
      setWorkspacePanelVisibility("motiongraph", true);
    },
    [
      loader.bundle,
      saveProceduralTarget,
      selectedProceduralTargetId,
      setWorkspacePanelVisibility,
    ],
  );
  const applySkillEdits = useCallback(() => {
    if (!editingSkillId) {
      return;
    }
    const spec = buildProceduralExportSpec(snapshotProceduralEditorState());
    replaceSkillSpec(editingSkillId, spec as Record<string, unknown>);
    setEditingSkillId(null);
    const editorStore = useEditorStore.getState();
    editorStore.clear();
    editorStore.setSelected(null);
  }, [editingSkillId, replaceSkillSpec]);
  const discardSkillEdits = useCallback(() => {
    setEditingSkillId(null);
    const editorStore = useEditorStore.getState();
    editorStore.clear();
    editorStore.setSelected(null);
  }, []);
  // The skill whose "Replace from JSON..." picker is open — consumed when
  // the hidden input below delivers the chosen file.
  const replaceSkillIdRef = useRef<string | null>(null);
  const skillJsonInputRef = useRef<HTMLInputElement>(null);
  const handleReplaceSkillJson = useCallback((skillId: string) => {
    replaceSkillIdRef.current = skillId;
    skillJsonInputRef.current?.click();
  }, []);
  const handleSkillJsonFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      const skillId = replaceSkillIdRef.current;
      replaceSkillIdRef.current = null;
      event.target.value = "";
      if (file && skillId) {
        void importSkillJson(skillId, file);
      }
    },
    [importSkillJson],
  );

  const menuBar = (
    <AppMenuBar
      onNew={handleNewClick}
      onImport={handleImportClick}
      onImportSkipChecks={handleImportSkipChecksClick}
      onImportReferenceFace={handleImportReferenceFaceClick}
      onImportGlbAnimations={handleImportGlbAnimationsClick}
      standardProfiles={availableStandardProfiles}
      embeddedProfileIds={embeddedProfileIds}
      onToggleStandardProfile={(profileId, enabled) => {
        void toggleStandardProfile(profileId, enabled);
      }}
      onExportStandardProfileJson={exportStandardProfileJson}
      onReplaceStandardProfileJson={handleReplaceStandardProfileJson}
      onEditStandardProfileGraph={handleEditStandardProfileGraph}
      skills={availableSkills}
      embeddedSkillIds={embeddedSkillIds}
      onToggleSkill={(skillId, enabled) => {
        void toggleSkill(skillId, enabled);
      }}
      onExportSkillJson={exportSkillJson}
      onReplaceSkillJson={handleReplaceSkillJson}
      onEditSkillGraph={handleEditSkillGraph}
      onSave={handleSaveExport}
      onExport={() => setShowExportDialog(true)}
      canSave={canExport}
      saveDirty={hasUnsavedGlbChanges}
      showSelectionGlow={showSelectionGlow}
      onToggleSelectionGlow={setShowSelectionGlow}
      activeEditFocus={activeEditFocus}
      onSelectEditFocus={uiActions.setEditFocus}
      rotationDisplayMode={rotationDisplayMode}
      onSelectRotationDisplayMode={uiActions.setRotationDisplayMode}
      activeAuthoringSurface={activeAuthoringSurface}
      onSelectAuthoringSurface={setActiveAuthoringSurface}
    />
  );

  const runtimeBundle = useMemo(
    () =>
      buildRuntimeBaseBundle({
        namespace: DEFAULT_NAMESPACE,
        world: runtimeWorld ?? null,
        animatables: runtimeAnimatables ?? null,
        loadedBundle: loadedBundle ?? null,
      }),
    [loadedBundle, runtimeAnimatables, runtimeWorld],
  );

  const runtimeInputReady =
    runtimeInvestigationBypassed ||
    (typeof stageRuntimeInput === "function" && graphStatus === "ready");
  const runtimeVisibleReady =
    runtimeInvestigationBypassed ||
    (runtimeViewReady &&
      !runtimeViewLoading &&
      runtimeViewRootId !== null &&
      runtimeViewRootId === rootId);
  const loadingBarVisible = loadingSessionActive;
  const weightedStepProgress = useMemo(
    () => computeWeightedFaceLoadProgress(loader.faceLoadSteps),
    [loader.faceLoadSteps],
  );
  const migrationStepInFlightRef = useRef(false);
  const [migrationCompletedSessionToken, setMigrationCompletedSessionToken] =
    useState<string | null>(null);
  const migrationCompleteForSession =
    faceLoadSessionToken !== null &&
    migrationCompletedSessionToken === faceLoadSessionToken;
  const loadingBarProgress =
    runtimeInputReady &&
    runtimeVisibleReady &&
    loadingCoordinatorSettled &&
    migrationCompleteForSession
      ? 1
      : weightedStepProgress;
  const previousLoadingSessionActiveRef = useRef(loadingSessionActive);

  useEffect(() => {
    if (!loadingSessionActive) {
      migrationStepInFlightRef.current = false;
      setMigrationCompletedSessionToken(null);
    }
  }, [loadingSessionActive]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const previous = previousLoadingSessionActiveRef.current;
    if (previous !== loadingSessionActive) {
      console.log("[face-load][app]", {
        event: loadingSessionActive ? "session-visible" : "session-hidden",
        sessionToken: faceLoadSessionToken,
        graphStatus,
        runtimeInputReady,
        runtimeVisibleReady,
        runtimeViewRootId,
        runtimeViewGraphCount,
        rootId,
        milestones: faceLoadMilestones,
        inFlightOperations: faceLoadInFlightOperationCount,
        lastOperationAtMs: faceLoadLastOperationUpdateAtMs,
        startedAtMs: loader.faceLoadSessionStartedAtMs,
        completedAtMs: loader.faceLoadSessionCompletedAtMs,
      });
      previousLoadingSessionActiveRef.current = loadingSessionActive;
    }
  }, [
    faceLoadMilestones,
    faceLoadSessionToken,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    graphStatus,
    loader.faceLoadSessionCompletedAtMs,
    loader.faceLoadSessionStartedAtMs,
    loadingSessionActive,
    rootId,
    runtimeInputReady,
    runtimeViewRootId,
    runtimeViewGraphCount,
    runtimeVisibleReady,
  ]);

  useEffect(() => {
    const completionSettleWindowMs = 500;
    if (!loadingSessionActive) {
      return;
    }
    if (
      rootId &&
      loadedBundle === null &&
      faceLoadMilestones["asset-loaded"] !== null &&
      faceLoadMilestones["bundle-synced"] === null
    ) {
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        substepId: "normalize-rig-graph",
        status: "complete",
      });
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        substepId: "import-rig-graph",
        status: "complete",
      });
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        substepId: "import-pose-config",
        status: "complete",
      });
      onFaceLoadPhaseChange({
        stepId: "bundle-sync",
        status: "complete",
      });
    }
    onFaceLoadPhaseChange({
      stepId: "runtime-stabilization",
      substepId: "wait-runtime-input-bridge",
      status: runtimeInputReady ? "complete" : "active",
    });
    if (migrationStepInFlightRef.current || migrationCompleteForSession) {
      onFaceLoadPhaseChange({
        stepId: "runtime-stabilization",
        substepId: "migrate-legacy-bindings",
        status: migrationStepInFlightRef.current ? "active" : "complete",
      });
    }
    if (runtimeInputReady && runtimeVisibleReady) {
      if (deterministicMilestoneChainReady) {
        markFaceLoadMilestone("runtime-ready", {
          sessionToken: faceLoadSessionToken,
        });
      }
    }
    if (
      graphStatus === "ready" &&
      faceLoadMilestones["asset-loaded"] !== null &&
      faceLoadMilestones["bundle-synced"] !== null &&
      faceLoadMilestones["graph-ready"] === null
    ) {
      markFaceLoadMilestone("graph-ready", {
        sessionToken: faceLoadSessionToken,
      });
    }
    if (!runtimeInputReady || !runtimeVisibleReady) {
      return;
    }
    if (!deterministicMilestoneChainReady) {
      if (__DEV__) {
        console.log("[face-load][app]", {
          event: "wait-milestone-chain",
          sessionToken: faceLoadSessionToken,
          graphStatus,
          runtimeInputReady,
          runtimeVisibleReady,
          runtimeViewRootId,
          runtimeViewGraphCount,
          rootId,
          milestones: faceLoadMilestones,
        });
      }
      return;
    }
    if (!loadingCoordinatorSettled) {
      if (__DEV__) {
        console.log("[face-load][app]", {
          event: "wait-operations",
          sessionToken: faceLoadSessionToken,
          inFlightOperations: faceLoadInFlightOperationCount,
        });
      }
      return;
    }
    if (!migrationCompleteForSession) {
      if (!faceLoadSessionToken || migrationStepInFlightRef.current) {
        return;
      }
      migrationStepInFlightRef.current = true;
      onFaceLoadPhaseChange({
        stepId: "runtime-stabilization",
        substepId: "migrate-legacy-bindings",
        status: "active",
      });
      let migratedCount = 0;
      try {
        migratedCount = handleMigrateAllLegacyBindings();
      } catch (error) {
        console.error(
          "[face-load][app] failed to auto-migrate legacy bindings",
          error,
        );
      } finally {
        if (__DEV__) {
          console.log("[face-load][app]", {
            event: "migrate-legacy-bindings-complete",
            sessionToken: faceLoadSessionToken,
            migratedCount,
          });
        }
        migrationStepInFlightRef.current = false;
        setMigrationCompletedSessionToken(faceLoadSessionToken);
        onFaceLoadPhaseChange({
          stepId: "runtime-stabilization",
          substepId: "migrate-legacy-bindings",
          status: "complete",
        });
      }
      return;
    }
    const sinceLastOperationMs =
      typeof faceLoadLastOperationUpdateAtMs === "number"
        ? Math.max(0, Date.now() - faceLoadLastOperationUpdateAtMs)
        : completionSettleWindowMs;
    const settleDelayMs = Math.max(
      0,
      completionSettleWindowMs - sinceLastOperationMs,
    );
    if (__DEV__) {
      console.log("[face-load][app]", {
        event: "complete-scheduled",
        sessionToken: faceLoadSessionToken,
        settleDelayMs,
        inFlightOperations: faceLoadInFlightOperationCount,
        milestones: faceLoadMilestones,
      });
    }
    const timer = window.setTimeout(() => {
      if (__DEV__) {
        console.log("[face-load][app]", {
          event: "complete-fired",
          sessionToken: faceLoadSessionToken,
          milestones: faceLoadMilestones,
        });
      }
      completeImportFlow();
    }, settleDelayMs);
    return () => window.clearTimeout(timer);
  }, [
    completeImportFlow,
    deterministicMilestoneChainReady,
    faceLoadInFlightOperationCount,
    faceLoadLastOperationUpdateAtMs,
    faceLoadMilestones,
    faceLoadSessionToken,
    handleMigrateAllLegacyBindings,
    graphStatus,
    loadingCoordinatorSettled,
    migrationCompleteForSession,
    loadingSessionActive,
    loadedBundle,
    markFaceLoadMilestone,
    setMigrationCompletedSessionToken,
    runtimeInputReady,
    runtimeViewRootId,
    runtimeViewGraphCount,
    runtimeVisibleReady,
    onFaceLoadPhaseChange,
    rootId,
  ]);

  const sceneLoaded = Boolean(rootId);
  const effectiveHierarchyPanelVisible = sceneLoaded && hierarchyPanelVisible;
  const effectiveInputControlsPanelVisible =
    sceneLoaded && inputControlsPanelVisible;
  const effectiveControlAuthoringPanelVisible =
    sceneLoaded && controlAuthoringPanelVisible;
  const effectiveAnimationPanelVisible = sceneLoaded && animationPanelVisible;
  const effectiveMotionGraphPanelVisible =
    sceneLoaded && motionGraphPanelVisible;
  const effectiveMotionGraphPalettePanelVisible =
    sceneLoaded && motionGraphPalettePanelVisible;
  const effectiveReferenceFacePanelVisible =
    sceneLoaded && referenceFacePanelVisible;
  const effectiveInspectorPanelVisible = sceneLoaded && inspectorPanelVisible;
  const effectiveSpeechPanelVisible = sceneLoaded && speechPanelVisible;
  const effectiveDebugPanelVisible = sceneLoaded && debugPanelVisible;

  const mainViewerPane = (
    <div className="relative w-full h-full">
      {loadingBarVisible && (
        <div className="absolute top-2 left-2 right-2 z-20 pointer-events-none">
          <FaceLoadingProgressBar
            visible={loadingBarVisible}
            progress={loadingBarProgress}
            steps={loader.faceLoadSteps}
            milestones={faceLoadMilestones}
            graphStatus={graphStatus}
            graphError={graphError}
            runtimeInputReady={runtimeInputReady}
            sessionStartedAtMs={loader.faceLoadSessionStartedAtMs}
            sessionCompletedAtMs={loader.faceLoadSessionCompletedAtMs}
            inFlightOperations={faceLoadInFlightOperationCount}
            sourceLabel={loader.faceLoadSourceLabel}
          />
        </div>
      )}
      <Viewer
        rootId={rootId}
        namespace={DEFAULT_NAMESPACE}
        bundle={rootId ? runtimeBundle : null}
        runtimeEnabled={memoryInvestigation.mainRuntimeEnabled}
        animationSourceActive={animationSourceActive}
        animationRuntimeClip={activeAnimationRuntimeClip}
        animationTransportSessionKey={animationTransportSessionKey}
        motionGraphRuntimeNodes={activeProgramRuntimeSnapshot?.nodes}
        motionGraphRuntimeEdges={activeProgramRuntimeSnapshot?.edges}
        motionGraphPlaybackState={effectiveProgramRuntimePlaybackState}
        motionGraphRuntimeControllerId={activeProgramRuntimeControllerId}
        motionGraphRuntimeResetValues={activeProgramRuntimeResetValues}
        runtimeStatusLabel={runtimeStatusLabel}
        runtimePlaybackState={viewerRuntimePlaybackState}
        onPlayRuntime={viewerPlayRuntime}
        onPauseRuntime={viewerPauseRuntime}
        runtimeActions={runtimeActions}
        selectedSceneId={selectedSceneId}
        onSelectScene={handleSelectObjectWithInspectorSync}
        onRuntimeInputsReady={handleMainRuntimeInputsReady}
        onRuntimeExportBodiesChange={handleRuntimeExportBodiesChange}
        onClearSelection={handleClearSelectionWithInspectorSync}
        showSelectionGlow={showSelectionGlow}
        onImportClick={handleImportClick}
        onLoadQuori={handleLoadQuori}
        presetLoadOptions={FACE_PRESET_GRID_OPTIONS}
        onLoadPresetAsset={handleLoadPresetAsset}
      />
    </div>
  );
  const viewerContent = (
    <div
      className={
        activeWorkbench === "std-feature-spaces"
          ? `viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`
          : "viewer-wrapper relative w-full h-full"
      }
      style={{ height: "100%", width: "100%" }}
    >
      <PanelGroup orientation={viewerSplitVertical ? "horizontal" : "vertical"}>
        <ResizablePanel
          defaultSize={effectiveReferenceFacePanelVisible ? 70 : 100}
          minSize={20}
        >
          {mainViewerPane}
        </ResizablePanel>
        {effectiveReferenceFacePanelVisible ? (
          <>
            <PanelResizeHandle
              className={
                viewerSplitVertical
                  ? "w-1 bg-border-default hover:bg-border-hover transition-colors"
                  : "h-1 bg-border-default hover:bg-border-hover transition-colors"
              }
            />
            <ResizablePanel defaultSize={30} minSize={20}>
              <ReferenceFacePanel
                runtimeEnabled={memoryInvestigation.referenceRuntimeEnabled}
                splitVertical={viewerSplitVertical}
                onToggleSplit={() => setViewerSplitVertical((prev) => !prev)}
                onClosePanel={handleHideReferenceFacePanel}
              />
            </ResizablePanel>
          </>
        ) : null}
      </PanelGroup>

      {/* Hidden file input for Reference Face import */}
      <input
        ref={refFaceFileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={handleRefFaceFileChange}
      />
    </div>
  );
  const viewportContent = (
    <PanelGroup
      orientation={motionGraphSplitVertical ? "horizontal" : "vertical"}
    >
      <ResizablePanel
        defaultSize={effectiveMotionGraphPanelVisible ? 58 : 100}
        minSize={20}
      >
        {viewerContent}
      </ResizablePanel>
      {effectiveMotionGraphPanelVisible ? (
        <>
          <PanelResizeHandle
            className={
              motionGraphSplitVertical
                ? "w-1 bg-border-default hover:bg-border-hover transition-colors"
                : "h-1 bg-border-default hover:bg-border-hover transition-colors"
            }
          />
          <ResizablePanel defaultSize={42} minSize={20}>
            <div className="flex h-full flex-col">
              {editingProfileId ? (
                <div
                  className="flex items-center gap-2 border-b border-border-default bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary"
                  data-testid="profile-editor-banner"
                >
                  <span className="flex-1">
                    Editing the{" "}
                    <span className="font-semibold text-text-primary">
                      {editingProfileId}
                    </span>{" "}
                    standard profile — applied to the embedded copy, not a
                    program.
                  </span>
                  <button
                    type="button"
                    className="rounded bg-accent-primary px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    data-testid="profile-editor-apply"
                    onClick={applyStandardProfileEdits}
                  >
                    Apply to Profile
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-hover"
                    data-testid="profile-editor-discard"
                    onClick={discardStandardProfileEdits}
                  >
                    Discard
                  </button>
                </div>
              ) : null}
              {editingSkillId ? (
                <div
                  className="flex items-center gap-2 border-b border-border-default bg-bg-secondary px-3 py-1.5 text-xs text-text-secondary"
                  data-testid="skill-editor-banner"
                >
                  <span className="flex-1">
                    Editing the{" "}
                    <span className="font-semibold text-text-primary">
                      {editingSkillId}
                    </span>{" "}
                    skill fragment — applied to the embedded copy, not a
                    program.
                  </span>
                  <button
                    type="button"
                    className="rounded bg-accent-primary px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    data-testid="skill-editor-apply"
                    onClick={applySkillEdits}
                  >
                    Apply to Skill
                  </button>
                  <button
                    type="button"
                    className="rounded border border-border-default px-2 py-1 text-xs hover:bg-bg-hover"
                    data-testid="skill-editor-discard"
                    onClick={discardSkillEdits}
                  >
                    Discard
                  </button>
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <MotionGraphPanel
                  onSelectNode={handleSelectMotionGraphNodeWithInspectorSync}
                  playbackState={selectedProgramPanelPlaybackState}
                  onPlayTransport={
                    resolvedSelectedProceduralTargetId
                      ? handlePlayProgramRuntime
                      : undefined
                  }
                  onPauseTransport={
                    selectedProgramCanPauseOrStop
                      ? handlePauseProgramRuntime
                      : undefined
                  }
                  onStopTransport={
                    selectedProgramCanPauseOrStop
                      ? handleStopProgramRuntime
                      : undefined
                  }
                  playbackAvailable={Boolean(
                    resolvedSelectedProceduralTargetId &&
                      selectedProgramRuntimeSnapshot,
                  )}
                  statusMessage={programPanelStatusMessage}
                  splitVertical={motionGraphSplitVertical}
                  onToggleSplit={() =>
                    setMotionGraphSplitVertical((prev) => !prev)
                  }
                  onClosePanel={handleHideMotionGraphPanel}
                />
              </div>
            </div>
          </ResizablePanel>
        </>
      ) : null}
    </PanelGroup>
  );

  return (
    <ReferenceFaceProvider value={referenceFaceContextValue}>
      <SharedVariableSyncProvider value={sharedVariableSync}>
        {memoryInvestigation.enabled ? (
          <MemoryDebugBridge loader={loader} />
        ) : null}
        <WorkspaceLayout
          menuBar={menuBar}
          // Left
          leftTopVisible={effectiveHierarchyPanelVisible}
          leftTopPanel={
            <HierarchyPanel
              showSelectionGlow={showSelectionGlow}
              onToggleSelectionGlow={setShowSelectionGlow}
              onSelectObject={handleSelectObjectWithInspectorSync}
              referenceFaceFile={referenceFaceContextValue.file}
              onClosePanel={handleHideHierarchyPanel}
            />
          }
          leftBottomPanel={
            <VariablesPanel
              selectedRigId={selectedRigId}
              selectedPoseId={selectedPoseId}
              selectedSceneId={selectedSceneId}
              onSelectRig={handleSelectRigWithInspectorSync}
              onSelectPose={handleSelectPoseWithInspectorSync}
              onSelectScene={handleSelectObjectWithInspectorSync}
              availableSurfaces={authoringSurfaces}
              activeSurfaceOverride={activeAuthoringSurface}
              onActiveSurfaceChange={(surface) => {
                if (surface === "inputs") {
                  return;
                }
                setActiveAuthoringSurface(surface);
              }}
              selectedPoseGroup={selectedPoseGroup}
              onSelectPoseGroup={handleSelectPoseGroupWithInspectorSync}
              selectedBlendStage={selectedBlendStage}
              onSelectBlendStage={handleSelectBlendStageWithInspectorSync}
              animationTargets={authoringAnimationTargets}
              onSelectAnimationTarget={handleInspectAnimationTarget}
              onCreateAnimationTarget={handleCreateAndInspectAnimationTarget}
              onDuplicateAnimationTarget={handleDuplicateAnimationTarget}
              onDeleteAnimationTarget={deleteAnimationTargetById}
              onPlayAnimationTarget={handlePlayAnimationTarget}
              onPauseAnimationTarget={handlePauseAnimationTarget}
              onStopAnimationTarget={handleStopAnimationTarget}
              programTargets={authoringProgramTargets}
              onSelectProgramTarget={handleInspectProgramTarget}
              onCreateProgramTarget={handleCreateAndInspectProgramTarget}
              onDuplicateProgramTarget={handleDuplicateProgramTarget}
              onDeleteProgramTarget={deleteProceduralTargetById}
              onPlayProgramTarget={handlePlayProgramTarget}
              onPauseProgramTarget={handlePauseProgramTarget}
              onStopProgramTarget={handleStopProgramTarget}
              panelTitle="Authoring"
              panelDescription="Author and organize drivers, poses, pose groups, animations, and programs."
              onClosePanel={handleHideControlAuthoringPanel}
              animationActive={effectiveAnimationPanelVisible}
              centerAuthoringMode={centerAuthoringMode}
              runtimeFaceId={faceId}
              enableMotionGraphPruning={false}
            />
          }
          leftBottomVisible2={false}
          leftBottomVisible3={false}
          leftBottomPanel3={null}
          leftMiddleVisible={effectiveInputControlsPanelVisible}
          leftMiddlePanel={
            <VariablesPanel
              selectedRigId={selectedRigId}
              selectedPoseId={selectedPoseId}
              selectedSceneId={selectedSceneId}
              onSelectRig={handleSelectRigWithInspectorSync}
              onSelectPose={handleSelectPoseWithInspectorSync}
              onSelectScene={handleSelectObjectWithInspectorSync}
              availableSurfaces={inputControlSurfaces}
              panelTitle="Input Controls"
              panelDescription="Preview and adjust live rig and pose-weight inputs plus procedural animation I/O."
              onClosePanel={handleHideInputControlsPanel}
              motionGraphActive={effectiveMotionGraphPanelVisible}
              animationActive={effectiveAnimationPanelVisible}
              centerAuthoringMode={centerAuthoringMode}
              runtimeFaceId={faceId}
              enableMotionGraphPruning={!editingProfileId && !editingSkillId}
              onSelectMotionGraphNode={
                handleSelectMotionGraphNodeWithInspectorSync
              }
            />
          }
          leftBottomVisible={effectiveControlAuthoringPanelVisible}
          viewport={viewportContent}
          bottomVisible={effectiveAnimationPanelVisible}
          bottomPanel={
            <AnimationPanel
              onClosePanel={handleHideAnimationPanel}
              onInspectTrack={handleInspectAnimationTrackFromTimeline}
              playbackState={selectedAnimationPanelPlaybackState}
              onPlayTransport={
                resolvedSelectedAnimationTargetId
                  ? handlePlayAnimationRuntime
                  : undefined
              }
              onPauseTransport={
                selectedAnimationCanPauseOrStop
                  ? handlePauseAnimationRuntime
                  : undefined
              }
              onStopTransport={
                selectedAnimationCanPauseOrStop
                  ? handleStopAnimationRuntime
                  : undefined
              }
              statusMessage={animationPanelStatusMessage}
            />
          }
          centerPanelDefaultSize={centerPanelDefaultSize}
          // Right
          rightTopVisible={false}
          rightTopPanel={null}
          rightBottomVisible={
            (effectiveMotionGraphPanelVisible &&
              effectiveMotionGraphPalettePanelVisible) ||
            effectiveInspectorPanelVisible ||
            effectiveSpeechPanelVisible ||
            effectiveDebugPanelVisible
          }
          rightSidebarDefaultSize={rightSidebarDefaultSize}
          rightSidebarResetKey={rightSidebarResetKey}
          rightBottomPanel={
            <div className="flex h-full min-h-0 flex-col">
              {effectiveMotionGraphPanelVisible &&
              effectiveMotionGraphPalettePanelVisible ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <MotionGraphPalettePanel
                    onClosePanel={handleHideMotionGraphPalettePanel}
                  />
                </div>
              ) : null}
              {effectiveMotionGraphPanelVisible &&
              effectiveMotionGraphPalettePanelVisible &&
              (effectiveInspectorPanelVisible ||
                effectiveSpeechPanelVisible ||
                effectiveDebugPanelVisible) ? (
                <div className="border-t border-border-default/70" />
              ) : null}
              {effectiveInspectorPanelVisible ? (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <InspectorPanel
                    activeInspectorTarget={activeInspectorTarget}
                    selectedPoseGroup={selectedPoseGroup}
                    onSelectPoseGroup={handleSelectPoseGroupWithInspectorSync}
                    selectedBlendStage={selectedBlendStage}
                    onSelectBlendStage={handleSelectBlendStageWithInspectorSync}
                    selectedAnimationTarget={selectedAnimationInspectorTarget}
                    onRenameAnimationTarget={handleRenameAnimationTarget}
                    onUpdateAnimationTargetDuration={
                      handleUpdateAnimationTargetDuration
                    }
                    onInspectAnimationTrack={
                      handleInspectAnimationTrackFromInspector
                    }
                    onInspectAnimationInput={
                      handleInspectInputFromAuthoringInspector
                    }
                    selectedProgramTarget={selectedProgramInspectorTarget}
                    onRenameProgramTarget={handleRenameProgramTarget}
                    onInspectProgramNode={handleInspectProgramNodeFromInspector}
                    onInspectProgramInput={
                      handleInspectInputFromAuthoringInspector
                    }
                    hasReferenceFaceFile={Boolean(
                      referenceFaceContextValue.file,
                    )}
                    onClosePanel={handleHideInspectorPanel}
                  />
                </div>
              ) : null}
              {effectiveSpeechPanelVisible ? (
                <div className="flex-1 min-h-0 overflow-y-auto border-t border-border-default/70">
                  <SpeechPanel onClosePanel={handleHideSpeechPanel} />
                </div>
              ) : null}
              {effectiveDebugPanelVisible ? (
                <div className="flex-1 min-h-0 overflow-y-auto border-t border-border-default/70">
                  <DebugPanel
                    rootId={loader.rootId}
                    loadedBundle={loader.bundle}
                    updateBundle={loader.updateBundle}
                    isLoading={loader.isLoading}
                    onClosePanel={handleHideDebugPanel}
                  />
                </div>
              ) : null}
            </div>
          }
        />
      </SharedVariableSyncProvider>

      <AppWizards
        showExportDialog={showExportDialog}
        onCloseExportDialog={() => setShowExportDialog(false)}
        rootId={rootId}
        exportSceneRoot={exportSceneRoot}
        runtimeExportBodies={runtimeExportBodies}
        sourceName={sourceName}
        loadedBundle={loadedBundle}
        authoredAnimationClips={authoredAnimationClipsForExport}
        authoredProceduralPrograms={authoredProceduralProgramsForExport}
        activeMotionGraphId={activeMotionGraphIdForExport}
        canExport={canExport}
        handleImportPoseGraphFile={handleImportPoseGraphFile}
        poseGraphRemap={poseGraphRemap}
        handlePoseGraphRemapApply={handlePoseGraphRemapApply}
        handlePoseGraphRemapCancel={handlePoseGraphRemapCancel}
        onExportGlbComplete={markGlbExportSaved}
        registerGlbExportHandler={handleRegisterGlbExportHandler}
      />

      <OrientationConfirmationDialog
        open={showOrientationDialog}
        onClose={handleOrientationDialogClose}
        axisDegrees={orientationAxisDegrees}
        axisAvailability={orientationAxisAvailability}
        onRotateAxis={handleRotateSceneOrientation}
      />

      {/* Hidden File Input for Import */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".glb,.gltf"
        data-testid="app-import-file-input"
        onChange={(e) => void handleFileChange(e)}
      />
      {/* Hidden file input for importing native glTF animations */}
      <input
        type="file"
        ref={animationGlbInputRef}
        className="hidden"
        accept=".glb,.gltf"
        data-testid="app-import-glb-animations-input"
        onChange={(e) => void handleAnimationGlbFileChange(e)}
      />
      {/* Hidden file input for "Replace <profile> from JSON..." */}
      <input
        type="file"
        ref={profileJsonInputRef}
        className="hidden"
        accept=".json"
        data-testid="app-profile-json-input"
        onChange={handleProfileJsonFileChange}
      />
      {/* Hidden file input for "Replace <skill> from JSON..." */}
      <input
        type="file"
        ref={skillJsonInputRef}
        className="hidden"
        accept=".json"
        data-testid="app-skill-json-input"
        onChange={handleSkillJsonFileChange}
      />
    </ReferenceFaceProvider>
  );
}
