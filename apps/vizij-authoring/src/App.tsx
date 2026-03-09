import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Panel as ResizablePanel,
  Group as PanelGroup,
  Separator as PanelResizeHandle,
} from "react-resizable-panels";
import { useDialogQueue } from "@vizij/authoring-shared";
import { loadGLTFFromBlobWithBundle, useVizijStore } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import { WorkspaceLayout } from "./layouts/WorkspaceLayout";
import {
  useWorkspaceStore,
  type WorkspacePanelId,
} from "./state/workspaceStore";
import { AppMenuBar } from "./components/app/AppMenuBar";
import { DebugPanel } from "./components/panels/DebugPanel";
import { VariablesPanel } from "./components/panels/VariablesPanel";
import { AnimationPanel } from "./components/panels/AnimationPanel";
import {
  Viewer,
  type RuntimeExportBodiesSnapshot,
} from "./components/app/Viewer";
import { HierarchyPanel } from "./components/panels/HierarchyPanel";
import { ReferenceFacePanel } from "./components/app/ReferenceFacePanel";
import { FaceLoadingProgressBar } from "./components/app/FaceLoadingProgressBar";
import { OrientationConfirmationDialog } from "./components/app/OrientationConfirmationDialog";
import { RuntimeSourceToolbar } from "./components/app/RuntimeSourceToolbar";
import {
  FACE_PRESET_GRID_OPTIONS,
  type FacePresetAssetOption,
} from "./components/app/facePresetAssets";
import { DEFAULT_NAMESPACE } from "./utils/constants";
import { useVizijAssetLoader } from "./hooks/useVizijAssetLoader";
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
  type RuntimeAuthoringSource,
} from "./state/AuthoringUiProvider";
import { PoseRigProvider, usePoseRig } from "./state/PoseRigProvider";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
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
import { SharedVariableSyncProvider } from "./state/SharedVariableSyncContext";
import { getVisibleVariablesSurfaces } from "./components/panels/variablesSurfaceOrder";
import {
  radiansToRoundedDegrees,
  resolveRootSceneRotationInputs,
  type RotationAxis,
} from "./components/app/importOrientation";
import { useAnimationStore } from "./state/animationStore";
import { useAnimationTransport } from "./hooks/useAnimationTransport";
import { bundleAnimationEntryToClipIr } from "./utils/animationClipCompiler";
import {
  buildGlbExportDirtySnapshot,
  useExportDirtyState,
} from "./hooks/useExportDirtyState";
import { createEditFocusPanelVisibility } from "./state/editFocusPanels";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_CLIP_ID,
  type AnimationClipIR,
} from "./types/animationClipIr";

const __DEV__ = process.env.NODE_ENV !== "production";
const AUTHORED_ANIMATION_TARGET_PREFIX = "authored-animation:";
const AUTHORED_PROCEDURAL_TARGET_PREFIX = "authored-procedural:";
const BUNDLE_ANIMATION_TARGET_PREFIX = "bundle-animation:";
const BUNDLE_PROCEDURAL_TARGET_PREFIX = "bundle-procedural:";
const AUTHORED_PROCEDURAL_MAIN_PROGRAM_ID = "authoring.motiongraph.main";
const DEFAULT_NEW_ANIMATION_CLIP_NAME = "New Animation Clip";
const DEFAULT_NEW_PROCEDURAL_PROGRAM_NAME = "New Procedural Program";
const EMPTY_INPUT_VALUES: Readonly<Record<string, number>> = Object.freeze({});
function createEmptyRuntimeExportBodiesSnapshot(): RuntimeExportBodiesSnapshot {
  return {
    rootFilteredBodies: [],
    anyBodies: [],
    runtimeRootId: null,
  };
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

function authoredAnimationTargetValue(clipId: string): string {
  return `${AUTHORED_ANIMATION_TARGET_PREFIX}${clipId}`;
}

function parseAuthoredAnimationTargetValue(targetId: string): string | null {
  if (!targetId.startsWith(AUTHORED_ANIMATION_TARGET_PREFIX)) {
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

function nextAuthoredAnimationClipOrdinal(
  targets: readonly AuthoredAnimationTarget[],
): number {
  const prefix = "authoring.timeline.clip.";
  let maxOrdinal = 0;
  targets.forEach((target) => {
    if (!target.clipId.startsWith(prefix)) {
      return;
    }
    const raw = target.clipId.slice(prefix.length);
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > maxOrdinal) {
      maxOrdinal = parsed;
    }
  });
  return maxOrdinal + 1;
}

function authoredProceduralTargetValue(programId: string): string {
  return `${AUTHORED_PROCEDURAL_TARGET_PREFIX}${programId}`;
}

function parseAuthoredProceduralTargetValue(targetId: string): string | null {
  if (!targetId.startsWith(AUTHORED_PROCEDURAL_TARGET_PREFIX)) {
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
const RUNTIME_SOURCE_OPTIONS: Array<{
  value: RuntimeAuthoringSource;
  label: string;
}> = [
  { value: "none", label: "Default" },
  { value: "animation", label: "Animation" },
  {
    value: "procedural-animation-programming",
    label: "Procedural Animation",
  },
];

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

  // Reference Face State

  const handleLoadAssetFromUrl = useCallback(
    async (url: string, filename: string) => {
      try {
        beginImportFlow(`Preset: ${filename}`);
        markImportFileSelected();
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url} `);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: "model/gltf-binary" });

        await loadFromFile(file, () =>
          loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
        );
      } catch (err) {
        markImportFlowError("load-asset");
        console.error("Failed to load asset from URL:", err);
      }
    },
    [
      beginImportFlow,
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

  const handleLoadHugo = useCallback(() => {
    handleLoadAssetFromUrl("/assets/Hugo_Legacy.glb", "Hugo_Legacy.glb");
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
  >(() => [
    createAuthoredAnimationTarget(
      AUTHORED_TIMELINE_CLIP_ID,
      DEFAULT_NEW_ANIMATION_CLIP_NAME,
    ),
  ]);
  const [selectedAnimationTargetId, setSelectedAnimationTargetId] = useState(
    () => authoredAnimationTargetValue(AUTHORED_TIMELINE_CLIP_ID),
  );
  const [authoredProceduralTargets, setAuthoredProceduralTargets] = useState<
    AuthoredProceduralTarget[]
  >(() => [
    createAuthoredProceduralTarget(
      AUTHORED_PROCEDURAL_MAIN_PROGRAM_ID,
      DEFAULT_NEW_PROCEDURAL_PROGRAM_NAME,
    ),
  ]);
  const [bundleAnimationNameOverrides, setBundleAnimationNameOverrides] =
    useState<Record<string, string>>({});
  const [
    bundleAnimationDurationOverrides,
    setBundleAnimationDurationOverrides,
  ] = useState<Record<string, number>>({});
  const [bundleProceduralNameOverrides, setBundleProceduralNameOverrides] =
    useState<Record<string, string>>({});
  const [hiddenBundleAnimationTargetIds, setHiddenBundleAnimationTargetIds] =
    useState<Record<string, true>>({});
  const [hiddenBundleProceduralTargetIds, setHiddenBundleProceduralTargetIds] =
    useState<Record<string, true>>({});
  const [selectedProceduralTargetId, setSelectedProceduralTargetId] = useState(
    () => authoredProceduralTargetValue(AUTHORED_PROCEDURAL_MAIN_PROGRAM_ID),
  );
  const lastMotionGraphImportRootIdRef = useRef<string | null>(null);
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
    setBundleProceduralNameOverrides({});
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
    activeRuntimeSource,
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
  const animationTransportEnabled = useAnimationStore(
    (state) => state.transportEnabled,
  );
  const animationDuration = useAnimationStore((state) => state.duration);
  const setAnimationDuration = useAnimationStore((state) => state.setDuration);
  const {
    active: animationTransportActive,
    play: playAnimationTransport,
    pause: pauseAnimationTransport,
    stop: stopAnimationTransport,
  } = useAnimationTransport();
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
  const papPlaybackState = useGraphRuntime((state) => state.graphPlaybackState);
  const papTimeSeconds = useGraphRuntime((state) => state.graphTimeSeconds);
  const papPlaybackAvailable = useGraphRuntime(
    (state) => state.graphPlaybackAvailable,
  );
  const playPapGraph = useGraphRuntime((state) => state.playGraph);
  const pausePapGraph = useGraphRuntime((state) => state.pauseGraph);
  const stopPapGraph = useGraphRuntime((state) => state.stopGraph);
  const handleFaceIdChange = useGraphRuntime(
    (state) => state.handleFaceIdChange,
  );
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
  const importMotionGraph = useCallback(
    (spec: Record<string, unknown> | null) => {
      const store = useEditorStore.getState();
      const currentRootId = loader.rootId ?? null;
      const rootChanged =
        lastMotionGraphImportRootIdRef.current !== currentRootId;
      const clearOnRootChange = () => {
        if (!rootChanged) {
          return;
        }
        store.clear();
        lastMotionGraphImportRootIdRef.current = currentRootId;
      };
      if (!spec) {
        clearOnRootChange();
        return;
      }
      const result = specToEditorState(spec);
      if (result.nodes.length === 0) {
        clearOnRootChange();
        return;
      }
      store.hydrate(
        result.nodes,
        result.edges,
        result.enabledOutputs,
        result.enabledInputs,
        result.customInputPaths,
      );
      lastMotionGraphImportRootIdRef.current = currentRootId;
    },
    [loader.rootId],
  );

  const bundleAnimationTargetOptions = useMemo(() => {
    const entries = loadedBundle?.animations ?? [];
    return entries
      .map((entry, index) => {
        const targetValue = `${BUNDLE_ANIMATION_TARGET_PREFIX}${index}`;
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
          const targetValue = `${BUNDLE_PROCEDURAL_TARGET_PREFIX}${index}`;
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

  const saveAuthoredAnimationTarget = useCallback(
    (targetId: string) => {
      const clipId = parseAuthoredAnimationTargetValue(targetId);
      if (!clipId) {
        return;
      }
      setAuthoredAnimationTargets((previous) => {
        const index = previous.findIndex(
          (target) => target.targetId === targetId || target.clipId === clipId,
        );
        if (index < 0) {
          return previous;
        }
        const target = previous[index]!;
        const clip = exportAnimationClipIr({
          id: target.clipId,
          name: target.name,
        });
        const updatedTarget: AuthoredAnimationTarget = {
          ...target,
          clipId: clip.id,
          targetId: authoredAnimationTargetValue(clip.id),
          clip,
        };
        const next = [...previous];
        next[index] = updatedTarget;
        return next;
      });
    },
    [exportAnimationClipIr],
  );

  const selectedAuthoredAnimationTarget = useMemo(
    () =>
      authoredAnimationTargets.find(
        (target) => target.targetId === selectedAnimationTargetId,
      ) ?? null,
    [authoredAnimationTargets, selectedAnimationTargetId],
  );
  const selectedAuthoredProceduralTarget = useMemo(
    () =>
      authoredProceduralTargets.find(
        (target) => target.targetId === selectedProceduralTargetId,
      ) ?? null,
    [authoredProceduralTargets, selectedProceduralTargetId],
  );
  const selectedBundleProceduralMetrics = useMemo(() => {
    if (
      !selectedProceduralTargetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)
    ) {
      return null;
    }
    const rawIndex = selectedProceduralTargetId.slice(
      BUNDLE_PROCEDURAL_TARGET_PREFIX.length,
    );
    const index = Number.parseInt(rawIndex, 10);
    if (!Number.isFinite(index) || index < 0) {
      return null;
    }
    const entry = bundleProceduralEntries[index];
    if (!entry?.spec || typeof entry.spec !== "object") {
      return null;
    }
    const parsed = specToEditorState(entry.spec as Record<string, unknown>);
    return {
      nodes: parsed.nodes.length,
      edges: parsed.edges.length,
      inputs: parsed.enabledInputs.size,
      outputs: parsed.enabledOutputs.size,
    };
  }, [bundleProceduralEntries, selectedProceduralTargetId]);
  const selectedProceduralMetrics = useMemo(() => {
    const isAuthored = Boolean(
      parseAuthoredProceduralTargetValue(selectedProceduralTargetId),
    );
    if (isAuthored) {
      return {
        nodes: proceduralEditorNodes.length,
        edges: proceduralEditorEdges.length,
        inputs: proceduralEditorEnabledInputs.size,
        outputs: proceduralEditorEnabledOutputs.size,
      };
    }
    return (
      selectedBundleProceduralMetrics ?? {
        nodes: proceduralEditorNodes.length,
        edges: proceduralEditorEdges.length,
        inputs: proceduralEditorEnabledInputs.size,
        outputs: proceduralEditorEnabledOutputs.size,
      }
    );
  }, [
    proceduralEditorEdges.length,
    proceduralEditorEnabledInputs.size,
    proceduralEditorEnabledOutputs.size,
    proceduralEditorNodes.length,
    selectedBundleProceduralMetrics,
    selectedProceduralTargetId,
  ]);

  const handleSelectAnimationTarget = useCallback(
    (targetId: string) => {
      if (targetId === selectedAnimationTargetId) {
        return;
      }
      const currentAuthoredClipId = parseAuthoredAnimationTargetValue(
        selectedAnimationTargetId,
      );
      if (currentAuthoredClipId) {
        saveAuthoredAnimationTarget(selectedAnimationTargetId);
      }
      setSelectedAnimationTargetId(targetId);

      const authoredClipId = parseAuthoredAnimationTargetValue(targetId);
      if (authoredClipId) {
        const target = authoredAnimationTargets.find(
          (entry) =>
            entry.targetId === targetId || entry.clipId === authoredClipId,
        );
        if (target) {
          importAnimationClipIr(target.clip);
        }
        return;
      }
      if (!targetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
        return;
      }
      const rawIndex = targetId.slice(BUNDLE_ANIMATION_TARGET_PREFIX.length);
      const index = Number.parseInt(rawIndex, 10);
      if (!Number.isFinite(index) || index < 0) {
        return;
      }
      const entry = loadedBundle?.animations?.[index];
      if (!entry) {
        return;
      }
      const clip = bundleAnimationEntryToClipIr(entry, {
        standardInputsById: mainFaceInputsById,
      });
      if (clip) {
        importAnimationClipIr(clip);
        const overriddenDuration = bundleAnimationDurationOverrides[targetId];
        if (Number.isFinite(overriddenDuration)) {
          setAnimationDuration(overriddenDuration);
        }
      }
    },
    [
      authoredAnimationTargets,
      bundleAnimationDurationOverrides,
      importAnimationClipIr,
      loadedBundle?.animations,
      mainFaceInputsById,
      saveAuthoredAnimationTarget,
      selectedAnimationTargetId,
      setAnimationDuration,
    ],
  );

  const handleCreateAnimationTarget = useCallback(() => {
    const currentAuthoredClipId = parseAuthoredAnimationTargetValue(
      selectedAnimationTargetId,
    );
    if (currentAuthoredClipId) {
      saveAuthoredAnimationTarget(selectedAnimationTargetId);
    }

    const nextOrdinal = nextAuthoredAnimationClipOrdinal(
      authoredAnimationTargets,
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
    importAnimationClipIr(nextTarget.clip);
  }, [
    animationDuration,
    authoredAnimationTargets,
    importAnimationClipIr,
    saveAuthoredAnimationTarget,
    selectedAnimationTargetId,
  ]);

  const handleRenameAnimationTarget = useCallback(
    (nextName: string) => {
      const normalizedName =
        nextName.trim().length > 0 ? nextName.trim() : "Untitled Clip";
      const authoredClipId = parseAuthoredAnimationTargetValue(
        selectedAnimationTargetId,
      );
      if (!authoredClipId) {
        if (
          selectedAnimationTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)
        ) {
          setBundleAnimationNameOverrides((previous) => ({
            ...previous,
            [selectedAnimationTargetId]: normalizedName,
          }));
        }
        return;
      }
      setAuthoredAnimationTargets((previous) =>
        previous.map((target) =>
          target.targetId === selectedAnimationTargetId
            ? {
                ...target,
                name: normalizedName,
                clip: {
                  ...target.clip,
                  name: normalizedName,
                },
              }
            : target,
        ),
      );
    },
    [selectedAnimationTargetId],
  );

  const handleUpdateSelectedAnimationDuration = useCallback(
    (nextDuration: number) => {
      if (!Number.isFinite(nextDuration)) {
        return;
      }
      const normalizedDuration = Math.max(0, nextDuration);
      setAnimationDuration(normalizedDuration);
      const authoredClipId = parseAuthoredAnimationTargetValue(
        selectedAnimationTargetId,
      );
      if (!authoredClipId) {
        if (
          selectedAnimationTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)
        ) {
          setBundleAnimationDurationOverrides((previous) => ({
            ...previous,
            [selectedAnimationTargetId]: normalizedDuration,
          }));
        }
        return;
      }
      setAuthoredAnimationTargets((previous) =>
        previous.map((target) =>
          target.targetId === selectedAnimationTargetId
            ? {
                ...target,
                clip: {
                  ...target.clip,
                  duration: normalizedDuration,
                },
              }
            : target,
        ),
      );
    },
    [selectedAnimationTargetId, setAnimationDuration],
  );

  const handleDeleteAnimationTarget = useCallback(() => {
    const deletingTargetId = selectedAnimationTargetId;
    const authoredClipId = parseAuthoredAnimationTargetValue(deletingTargetId);
    const activeTarget = authoredAnimationTargets.find(
      (target) => target.targetId === deletingTargetId,
    );
    const activeOptionLabel =
      animationTargetOptions.find((option) => option.value === deletingTargetId)
        ?.label ?? activeTarget?.name;
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
    }

    const remainingBundleTargets = bundleAnimationTargetOptions.filter(
      (option) => option.value !== deletingTargetId,
    );

    if (
      nextAuthoredTargets.length === 0 &&
      remainingBundleTargets.length === 0
    ) {
      const fallbackTarget = createAuthoredAnimationTarget(
        AUTHORED_TIMELINE_CLIP_ID,
        DEFAULT_NEW_ANIMATION_CLIP_NAME,
      );
      setAuthoredAnimationTargets([fallbackTarget]);
      setSelectedAnimationTargetId(fallbackTarget.targetId);
      importAnimationClipIr(fallbackTarget.clip);
      return;
    }

    setAuthoredAnimationTargets(nextAuthoredTargets);
    const nextTargetId =
      nextAuthoredTargets[0]?.targetId ?? remainingBundleTargets[0]!.value;
    setSelectedAnimationTargetId(nextTargetId);
    const nextAuthoredTarget = nextAuthoredTargets.find(
      (target) => target.targetId === nextTargetId,
    );
    if (nextAuthoredTarget) {
      importAnimationClipIr(nextAuthoredTarget.clip);
      return;
    }
    if (nextTargetId.startsWith(BUNDLE_ANIMATION_TARGET_PREFIX)) {
      const rawIndex = nextTargetId.slice(
        BUNDLE_ANIMATION_TARGET_PREFIX.length,
      );
      const index = Number.parseInt(rawIndex, 10);
      if (!Number.isFinite(index) || index < 0) {
        return;
      }
      const entry = loadedBundle?.animations?.[index];
      if (!entry) {
        return;
      }
      const clip = bundleAnimationEntryToClipIr(entry, {
        standardInputsById: mainFaceInputsById,
      });
      if (!clip) {
        return;
      }
      importAnimationClipIr(clip);
      const overriddenDuration = bundleAnimationDurationOverrides[nextTargetId];
      if (Number.isFinite(overriddenDuration)) {
        setAnimationDuration(overriddenDuration);
      }
    }
  }, [
    animationTargetOptions,
    authoredAnimationTargets,
    bundleAnimationDurationOverrides,
    bundleAnimationTargetOptions,
    importAnimationClipIr,
    loadedBundle?.animations,
    mainFaceInputsById,
    selectedAnimationTargetId,
    setHiddenBundleAnimationTargetIds,
    setAnimationDuration,
  ]);

  const authoredAnimationClipsForExport = useMemo(() => {
    const authoredClipId = parseAuthoredAnimationTargetValue(
      selectedAnimationTargetId,
    );
    const liveActiveClip =
      authoredClipId && selectedAuthoredAnimationTarget
        ? exportAnimationClipIr({
            id: selectedAuthoredAnimationTarget.clipId,
            name: selectedAuthoredAnimationTarget.name,
          })
        : null;
    return authoredAnimationTargets.map((target) => {
      if (
        liveActiveClip &&
        target.targetId === selectedAuthoredAnimationTarget?.targetId
      ) {
        return liveActiveClip;
      }
      return target.clip;
    });
  }, [
    animationDuration,
    animationTracks,
    authoredAnimationTargets,
    exportAnimationClipIr,
    selectedAnimationTargetId,
    selectedAuthoredAnimationTarget,
  ]);

  const handleSelectProceduralTarget = useCallback(
    (targetId: string) => {
      if (targetId === selectedProceduralTargetId) {
        return;
      }
      const currentAuthoredProgramId = parseAuthoredProceduralTargetValue(
        selectedProceduralTargetId,
      );
      if (currentAuthoredProgramId) {
        setAuthoredProceduralTargets((previous) => {
          const index = previous.findIndex(
            (target) =>
              target.targetId === selectedProceduralTargetId ||
              target.programId === currentAuthoredProgramId,
          );
          if (index < 0) {
            return previous;
          }
          const next = [...previous];
          next[index] = {
            ...next[index]!,
            snapshot: snapshotProceduralEditorState(),
          };
          return next;
        });
      }

      setSelectedProceduralTargetId(targetId);
      const authoredProgramId = parseAuthoredProceduralTargetValue(targetId);
      if (authoredProgramId) {
        const authoredTarget = authoredProceduralTargets.find(
          (target) =>
            target.targetId === targetId ||
            target.programId === authoredProgramId,
        );
        if (authoredTarget) {
          hydrateProceduralEditorState(authoredTarget.snapshot);
        }
        return;
      }
      if (!targetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
        return;
      }
      const rawIndex = targetId.slice(BUNDLE_PROCEDURAL_TARGET_PREFIX.length);
      const index = Number.parseInt(rawIndex, 10);
      if (!Number.isFinite(index) || index < 0) {
        return;
      }
      const entry = bundleProceduralEntries[index];
      if (!entry) {
        return;
      }
      importMotionGraph(
        entry.spec ? (entry.spec as Record<string, unknown>) : null,
      );
    },
    [
      authoredProceduralTargets,
      bundleProceduralEntries,
      importMotionGraph,
      selectedProceduralTargetId,
    ],
  );

  const handleCreateProceduralTarget = useCallback(() => {
    const currentAuthoredProgramId = parseAuthoredProceduralTargetValue(
      selectedProceduralTargetId,
    );
    if (currentAuthoredProgramId) {
      setAuthoredProceduralTargets((previous) => {
        const index = previous.findIndex(
          (target) =>
            target.targetId === selectedProceduralTargetId ||
            target.programId === currentAuthoredProgramId,
        );
        if (index < 0) {
          return previous;
        }
        const next = [...previous];
        next[index] = {
          ...next[index]!,
          snapshot: snapshotProceduralEditorState(),
        };
        return next;
      });
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
    hydrateProceduralEditorState(nextTarget.snapshot);
  }, [authoredProceduralTargets, selectedProceduralTargetId]);

  const handleRenameProceduralTarget = useCallback(
    (nextName: string) => {
      const normalizedName =
        nextName.trim().length > 0 ? nextName.trim() : "Untitled Program";
      const authoredProgramId = parseAuthoredProceduralTargetValue(
        selectedProceduralTargetId,
      );
      if (!authoredProgramId) {
        if (
          selectedProceduralTargetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)
        ) {
          setBundleProceduralNameOverrides((previous) => ({
            ...previous,
            [selectedProceduralTargetId]: normalizedName,
          }));
        }
        return;
      }
      setAuthoredProceduralTargets((previous) =>
        previous.map((target) =>
          target.targetId === selectedProceduralTargetId
            ? {
                ...target,
                name: normalizedName,
              }
            : target,
        ),
      );
    },
    [selectedProceduralTargetId],
  );

  const handleDeleteProceduralTarget = useCallback(() => {
    const deletingTargetId = selectedProceduralTargetId;
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
    }

    const remainingBundleTargets = bundleProceduralTargetOptions.filter(
      (option) => option.value !== deletingTargetId,
    );

    if (
      nextAuthoredTargets.length === 0 &&
      remainingBundleTargets.length === 0
    ) {
      const fallbackTarget = createAuthoredProceduralTarget(
        AUTHORED_PROCEDURAL_MAIN_PROGRAM_ID,
        DEFAULT_NEW_PROCEDURAL_PROGRAM_NAME,
      );
      setAuthoredProceduralTargets([fallbackTarget]);
      setSelectedProceduralTargetId(fallbackTarget.targetId);
      hydrateProceduralEditorState(fallbackTarget.snapshot);
      return;
    }

    setAuthoredProceduralTargets(nextAuthoredTargets);
    const nextTargetId =
      nextAuthoredTargets[0]?.targetId ?? remainingBundleTargets[0]!.value;
    setSelectedProceduralTargetId(nextTargetId);
    const nextAuthoredTarget = nextAuthoredTargets.find(
      (target) => target.targetId === nextTargetId,
    );
    if (nextAuthoredTarget) {
      hydrateProceduralEditorState(nextAuthoredTarget.snapshot);
      return;
    }
    if (nextTargetId.startsWith(BUNDLE_PROCEDURAL_TARGET_PREFIX)) {
      const rawIndex = nextTargetId.slice(
        BUNDLE_PROCEDURAL_TARGET_PREFIX.length,
      );
      const index = Number.parseInt(rawIndex, 10);
      if (!Number.isFinite(index) || index < 0) {
        return;
      }
      const entry = bundleProceduralEntries[index];
      if (!entry) {
        return;
      }
      importMotionGraph(
        entry.spec ? (entry.spec as Record<string, unknown>) : null,
      );
    }
  }, [
    authoredProceduralTargets,
    bundleProceduralEntries,
    bundleProceduralTargetOptions,
    importMotionGraph,
    proceduralTargetOptions,
    selectedProceduralTargetId,
    setHiddenBundleProceduralTargetIds,
  ]);

  const authoredProceduralProgramsForExport = useMemo(() => {
    const activeAuthoredProgramId = parseAuthoredProceduralTargetValue(
      selectedProceduralTargetId,
    );
    const liveActiveSnapshot = activeAuthoredProgramId
      ? {
          nodes: structuredClone(proceduralEditorNodes),
          edges: structuredClone(proceduralEditorEdges),
          enabledOutputs: Array.from(proceduralEditorEnabledOutputs),
          enabledInputs: Array.from(proceduralEditorEnabledInputs),
          customInputPaths: [...proceduralEditorCustomInputPaths],
        }
      : null;
    return authoredProceduralTargets
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
  }, [
    authoredProceduralTargets,
    proceduralEditorCustomInputPaths,
    proceduralEditorEdges,
    proceduralEditorEnabledInputs,
    proceduralEditorEnabledOutputs,
    proceduralEditorNodes,
    selectedAuthoredProceduralTarget,
    selectedProceduralTargetId,
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
      }),
    [
      animatableComponents,
      animatables,
      authoredAnimationClipsForExport,
      authoredProceduralProgramsForExport,
      bindings,
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
      animationTargetOptions.some(
        (option) => option.value === selectedAnimationTargetId,
      )
    ) {
      return;
    }
    setSelectedAnimationTargetId(
      authoredAnimationTargets[0]?.targetId ??
        authoredAnimationTargetValue(AUTHORED_TIMELINE_CLIP_ID),
    );
  }, [
    animationTargetOptions,
    authoredAnimationTargets,
    selectedAnimationTargetId,
  ]);

  useEffect(() => {
    if (
      proceduralTargetOptions.some(
        (option) => option.value === selectedProceduralTargetId,
      )
    ) {
      return;
    }
    setSelectedProceduralTargetId(
      authoredProceduralTargets[0]?.targetId ??
        authoredProceduralTargetValue(AUTHORED_PROCEDURAL_MAIN_PROGRAM_ID),
    );
  }, [
    authoredProceduralTargets,
    proceduralTargetOptions,
    selectedProceduralTargetId,
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
    importMotionGraph,
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
  const runtimeControlsPanelVisible = useWorkspaceStore(
    (state) => state.panels.toolbar.isVisible,
  );
  const setWorkspacePanelVisibility = useWorkspaceStore(
    (state) => state.setPanelVisibility,
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
  const runtimeSourceOptions = RUNTIME_SOURCE_OPTIONS;
  const runtimeTargetConfig = useMemo(() => {
    if (activeRuntimeSource === "animation") {
      const selectedTargetLabel =
        animationTargetOptions.find(
          (option) => option.value === selectedAnimationTargetId,
        )?.label ?? selectedAnimationTargetId;
      return {
        targetLabel: "Animation Clip",
        targetValue: selectedAnimationTargetId,
        targetOptions: animationTargetOptions,
        onTargetChange: handleSelectAnimationTarget,
        targetTypeLabel: "Animation Clip",
        targetName:
          selectedAuthoredAnimationTarget?.name ?? selectedTargetLabel,
        onTargetNameChange: handleRenameAnimationTarget,
        targetNumericLabel: "Duration (seconds)",
        targetNumericValue: animationDuration,
        targetNumericStep: 0.1,
        targetNumericMin: 0,
        onTargetNumericValueChange: handleUpdateSelectedAnimationDuration,
        targetStats: [
          { label: "Tracks", value: animationTracks.length.toString() },
          { label: "Duration", value: `${animationDuration.toFixed(2)}s` },
        ],
        onDeleteTarget: handleDeleteAnimationTarget,
        deleteTargetLabel: "Delete Clip",
        onCreateTarget: handleCreateAnimationTarget,
        createTargetLabel: "New Clip",
      };
    }
    if (activeRuntimeSource === "procedural-animation-programming") {
      const selectedTargetLabel =
        proceduralTargetOptions.find(
          (option) => option.value === selectedProceduralTargetId,
        )?.label ?? selectedProceduralTargetId;
      return {
        targetLabel: "Procedural Program",
        targetValue: selectedProceduralTargetId,
        targetOptions: proceduralTargetOptions,
        onTargetChange: handleSelectProceduralTarget,
        targetTypeLabel: "Procedural Program",
        targetName:
          selectedAuthoredProceduralTarget?.name ?? selectedTargetLabel,
        onTargetNameChange: handleRenameProceduralTarget,
        targetStats: [
          { label: "Nodes", value: selectedProceduralMetrics.nodes.toString() },
          { label: "Edges", value: selectedProceduralMetrics.edges.toString() },
          {
            label: "Inputs",
            value: selectedProceduralMetrics.inputs.toString(),
          },
          {
            label: "Outputs",
            value: selectedProceduralMetrics.outputs.toString(),
          },
        ],
        onDeleteTarget: handleDeleteProceduralTarget,
        deleteTargetLabel: "Delete Program",
        onCreateTarget: handleCreateProceduralTarget,
        createTargetLabel: "New Program",
      };
    }
    return null;
  }, [
    activeRuntimeSource,
    animationDuration,
    animationTracks.length,
    animationTargetOptions,
    handleCreateAnimationTarget,
    handleCreateProceduralTarget,
    handleDeleteAnimationTarget,
    handleDeleteProceduralTarget,
    handleRenameAnimationTarget,
    handleRenameProceduralTarget,
    handleSelectAnimationTarget,
    handleSelectProceduralTarget,
    handleUpdateSelectedAnimationDuration,
    proceduralTargetOptions,
    selectedProceduralMetrics.edges,
    selectedProceduralMetrics.inputs,
    selectedProceduralMetrics.nodes,
    selectedProceduralMetrics.outputs,
    selectedAuthoredAnimationTarget,
    selectedAuthoredProceduralTarget,
    selectedAnimationTargetId,
    selectedProceduralTargetId,
  ]);
  const runtimePlaybackConfig = useMemo(() => {
    if (activeRuntimeSource === "animation") {
      return {
        playbackState: animationPlaybackState,
        playbackDisabled:
          !animationTransportActive || !animationTransportEnabled,
        onPlay: playAnimationTransport,
        onPause: pauseAnimationTransport,
        onStop: stopAnimationTransport,
      };
    }
    if (activeRuntimeSource === "procedural-animation-programming") {
      const papTransportState =
        papPlaybackState === "playing"
          ? ("playing" as const)
          : papTimeSeconds > 0
            ? ("paused" as const)
            : ("stopped" as const);
      return {
        playbackState: papTransportState,
        playbackDisabled: !papPlaybackAvailable,
        onPlay: playPapGraph,
        onPause: pausePapGraph,
        onStop: stopPapGraph,
      };
    }
    return {
      playbackState: "stopped" as const,
      playbackDisabled: true,
      onPlay: undefined,
      onPause: undefined,
      onStop: undefined,
    };
  }, [
    activeRuntimeSource,
    animationTransportActive,
    animationPlaybackState,
    animationTransportEnabled,
    pauseAnimationTransport,
    pausePapGraph,
    papPlaybackAvailable,
    papPlaybackState,
    papTimeSeconds,
    playAnimationTransport,
    playPapGraph,
    stopAnimationTransport,
    stopPapGraph,
  ]);
  const papPlaybackActive = papPlaybackState === "playing";
  const animationSourceActive = activeRuntimeSource === "animation";
  const motionGraphSourceActive =
    activeRuntimeSource === "procedural-animation-programming";
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
  const controlAuthoringSurfaces = useMemo(
    () => visibleVariablesSurfaces.filter((surface) => surface !== "inputs"),
    [visibleVariablesSurfaces],
  );
  const inputControlsPanelVisible = inputControlSurfaces.length > 0;
  const controlAuthoringPanelVisible = controlAuthoringSurfaces.length > 0;
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
  const handleHideRuntimeSourcePanel = useCallback(() => {
    setWorkspacePanelVisibility("toolbar", false);
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
  const handleSelectObjectWithInspectorSync = useCallback(
    (id: string, options?: { additive?: boolean }) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectObject(id, options);
    },
    [clearPoseGraphInspectorSelection, handleSelectObject],
  );
  const handleSelectRigWithInspectorSync = useCallback(
    (id: string | null) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectRig(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectRig],
  );
  const handleClearSelectionWithInspectorSync = useCallback(() => {
    clearPoseGraphInspectorSelection();
    handleClearSelection();
  }, [clearPoseGraphInspectorSelection, handleClearSelection]);
  const handleSelectPoseWithInspectorSync = useCallback(
    (id: string) => {
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectPose(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectPose],
  );
  const handleSelectPoseGroupWithInspectorSync = useCallback(
    (selection: PoseGroupInspectorSelection | null) => {
      if (selection) {
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
      if (id) {
        clearPoseGraphInspectorSelection();
      }
      handleSelectMotionGraphNode(id);
    },
    [clearPoseGraphInspectorSelection, handleSelectMotionGraphNode],
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
    loader.reset();
  }, [loader]);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        skipNextDiscrepancyCheck.current = false;
        return;
      }
      const skipChecks = skipNextDiscrepancyCheck.current;
      beginImportFlow(skipChecks ? "File import (skip checks)" : "File import");
      markImportFileSelected();

      if (skipChecks) {
        uiActions.setSkipDiscrepancyCheck(true);
      } else {
        uiActions.setSkipDiscrepancyCheck(false);
      }
      skipNextDiscrepancyCheck.current = false;

      await loadFromFile(file, () =>
        loadGLTFFromBlobWithBundle(file, [DEFAULT_NAMESPACE], true),
      );
      event.target.value = "";
    },
    [beginImportFlow, loadFromFile, markImportFileSelected, uiActions],
  );

  const handleImportClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = false;
    fileInputRef.current?.click();
  }, []);

  const handleImportSkipChecksClick = useCallback(() => {
    skipNextDiscrepancyCheck.current = true;
    fileInputRef.current?.click();
  }, []);

  const menuBar = (
    <AppMenuBar
      onNew={handleNewClick}
      onImport={handleImportClick}
      onImportSkipChecks={handleImportSkipChecksClick}
      onImportReferenceFace={handleImportReferenceFaceClick}
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
    typeof stageRuntimeInput === "function" && graphStatus === "ready";
  const runtimeVisibleReady =
    runtimeViewReady &&
    !runtimeViewLoading &&
    runtimeViewRootId !== null &&
    runtimeViewRootId === rootId;
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

  const viewerContent = (
    <div
      className={
        activeWorkbench === "std-feature-spaces"
          ? `viewer-split ${viewerSplitVertical ? "viewer-split--vertical" : ""}`
          : "viewer-wrapper relative w-full h-full"
      }
      style={{ height: "100%", width: "100%" }}
    >
      {referenceFacePanelVisible ? (
        <PanelGroup
          orientation={viewerSplitVertical ? "horizontal" : "vertical"}
        >
          <ResizablePanel defaultSize={70} minSize={20}>
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
                animationSourceActive={animationSourceActive}
                motionGraphSourceActive={
                  motionGraphSourceActive && papPlaybackActive
                }
                selectedSceneId={selectedSceneId}
                onSelectScene={handleSelectObjectWithInspectorSync}
                onRuntimeInputsReady={handleMainRuntimeInputsReady}
                onRuntimeExportBodiesChange={handleRuntimeExportBodiesChange}
                onClearSelection={handleClearSelectionWithInspectorSync}
                showSelectionGlow={showSelectionGlow}
                onImportClick={handleImportClick}
                onLoadQuori={handleLoadQuori}
                onLoadHugo={handleLoadHugo}
                presetLoadOptions={FACE_PRESET_GRID_OPTIONS}
                onLoadPresetAsset={handleLoadPresetAsset}
              />
            </div>
          </ResizablePanel>
          <PanelResizeHandle
            className={
              viewerSplitVertical
                ? "w-1 bg-border-default hover:bg-border-hover transition-colors"
                : "h-1 bg-border-default hover:bg-border-hover transition-colors"
            }
          />
          <ResizablePanel defaultSize={30} minSize={20}>
            <ReferenceFacePanel
              splitVertical={viewerSplitVertical}
              onToggleSplit={() => setViewerSplitVertical((prev) => !prev)}
            />
          </ResizablePanel>
        </PanelGroup>
      ) : (
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
            animationSourceActive={animationSourceActive}
            motionGraphSourceActive={
              motionGraphSourceActive && papPlaybackActive
            }
            selectedSceneId={selectedSceneId}
            onSelectScene={handleSelectObjectWithInspectorSync}
            onRuntimeInputsReady={handleMainRuntimeInputsReady}
            onRuntimeExportBodiesChange={handleRuntimeExportBodiesChange}
            onClearSelection={handleClearSelectionWithInspectorSync}
            showSelectionGlow={showSelectionGlow}
            onImportClick={handleImportClick}
            onLoadQuori={handleLoadQuori}
            onLoadHugo={handleLoadHugo}
            presetLoadOptions={FACE_PRESET_GRID_OPTIONS}
            onLoadPresetAsset={handleLoadPresetAsset}
          />
        </div>
      )}

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
  const viewportContent = motionGraphPanelVisible ? (
    <PanelGroup
      orientation={motionGraphSplitVertical ? "horizontal" : "vertical"}
    >
      <ResizablePanel defaultSize={58} minSize={20}>
        {viewerContent}
      </ResizablePanel>
      <PanelResizeHandle
        className={
          motionGraphSplitVertical
            ? "w-1 bg-border-default hover:bg-border-hover transition-colors"
            : "h-1 bg-border-default hover:bg-border-hover transition-colors"
        }
      />
      <ResizablePanel defaultSize={42} minSize={20}>
        <MotionGraphPanel
          onSelectNode={handleSelectMotionGraphNodeWithInspectorSync}
          splitVertical={motionGraphSplitVertical}
          onToggleSplit={() => setMotionGraphSplitVertical((prev) => !prev)}
        />
      </ResizablePanel>
    </PanelGroup>
  ) : (
    viewerContent
  );

  return (
    <ReferenceFaceProvider value={referenceFaceContextValue}>
      <SharedVariableSyncProvider value={sharedVariableSync}>
        <WorkspaceLayout
          menuBar={menuBar}
          // Left
          leftTopVisible={hierarchyPanelVisible}
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
              availableSurfaces={controlAuthoringSurfaces}
              selectedPoseGroup={selectedPoseGroup}
              onSelectPoseGroup={handleSelectPoseGroupWithInspectorSync}
              selectedBlendStage={selectedBlendStage}
              onSelectBlendStage={handleSelectBlendStageWithInspectorSync}
              panelTitle="Control Authoring"
              panelDescription="Author and organize variables, poses, and pose groups."
              onClosePanel={handleHideControlAuthoringPanel}
              animationActive={animationPanelVisible}
              centerAuthoringMode={centerAuthoringMode}
              runtimeFaceId={faceId}
              enableMotionGraphPruning={false}
            />
          }
          leftBottomVisible2={false}
          leftBottomVisible3={
            motionGraphPanelVisible && motionGraphPalettePanelVisible
          }
          leftBottomPanel3={<MotionGraphPalettePanel />}
          leftMiddleVisible={inputControlsPanelVisible}
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
              motionGraphActive={motionGraphPanelVisible}
              animationActive={animationPanelVisible}
              centerAuthoringMode={centerAuthoringMode}
              runtimeFaceId={faceId}
              enableMotionGraphPruning
              onSelectMotionGraphNode={
                handleSelectMotionGraphNodeWithInspectorSync
              }
            />
          }
          leftBottomVisible={controlAuthoringPanelVisible}
          viewport={viewportContent}
          bottomVisible={animationPanelVisible}
          bottomPanel={<AnimationPanel />}
          centerPanelDefaultSize={centerPanelDefaultSize}
          // Right
          rightTopVisible={runtimeControlsPanelVisible}
          rightTopPanel={
            <RuntimeSourceToolbar
              layout="panel"
              mode={centerAuthoringMode}
              activeSource={activeRuntimeSource}
              options={runtimeSourceOptions}
              onChange={uiActions.setActiveRuntimeSource}
              playbackState={runtimePlaybackConfig.playbackState}
              playbackDisabled={runtimePlaybackConfig.playbackDisabled}
              onPlay={runtimePlaybackConfig.onPlay}
              onPause={runtimePlaybackConfig.onPause}
              onStop={runtimePlaybackConfig.onStop}
              targetLabel={runtimeTargetConfig?.targetLabel}
              targetValue={runtimeTargetConfig?.targetValue}
              targetOptions={runtimeTargetConfig?.targetOptions}
              onTargetChange={runtimeTargetConfig?.onTargetChange}
              targetTypeLabel={runtimeTargetConfig?.targetTypeLabel}
              targetName={runtimeTargetConfig?.targetName}
              onTargetNameChange={runtimeTargetConfig?.onTargetNameChange}
              targetStats={runtimeTargetConfig?.targetStats}
              targetNumericLabel={runtimeTargetConfig?.targetNumericLabel}
              targetNumericValue={runtimeTargetConfig?.targetNumericValue}
              targetNumericStep={runtimeTargetConfig?.targetNumericStep}
              targetNumericMin={runtimeTargetConfig?.targetNumericMin}
              onTargetNumericValueChange={
                runtimeTargetConfig?.onTargetNumericValueChange
              }
              onDeleteTarget={runtimeTargetConfig?.onDeleteTarget}
              deleteTargetLabel={runtimeTargetConfig?.deleteTargetLabel}
              onCreateTarget={runtimeTargetConfig?.onCreateTarget}
              createTargetLabel={runtimeTargetConfig?.createTargetLabel}
              onClosePanel={handleHideRuntimeSourcePanel}
            />
          }
          rightBottomVisible={
            inspectorPanelVisible || speechPanelVisible || debugPanelVisible
          }
          rightSidebarDefaultSize={rightSidebarDefaultSize}
          rightSidebarResetKey={rightSidebarResetKey}
          rightBottomPanel={
            <div
              className={`h-full min-h-0 ${
                (inspectorPanelVisible &&
                  (debugPanelVisible || speechPanelVisible)) ||
                (debugPanelVisible && speechPanelVisible)
                  ? "grid grid-rows-2"
                  : "flex flex-col"
              }`}
            >
              {inspectorPanelVisible ? (
                <div className="min-h-0 overflow-y-auto">
                  <InspectorPanel
                    selectedPoseGroup={selectedPoseGroup}
                    onSelectPoseGroup={handleSelectPoseGroupWithInspectorSync}
                    selectedBlendStage={selectedBlendStage}
                    onSelectBlendStage={handleSelectBlendStageWithInspectorSync}
                    hasReferenceFaceFile={Boolean(
                      referenceFaceContextValue.file,
                    )}
                    onClosePanel={handleHideInspectorPanel}
                  />
                </div>
              ) : null}
              {speechPanelVisible ? (
                <div className="min-h-0 overflow-y-auto border-t border-border-default/70">
                  <SpeechPanel onClosePanel={handleHideSpeechPanel} />
                </div>
              ) : null}
              {debugPanelVisible ? (
                <div className="min-h-0 overflow-y-auto border-t border-border-default/70">
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
        onChange={(e) => void handleFileChange(e)}
      />
    </ReferenceFaceProvider>
  );
}
