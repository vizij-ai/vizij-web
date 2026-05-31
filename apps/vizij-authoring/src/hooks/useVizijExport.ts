import { useCallback } from "react";
import {
  exportScene,
  type VizijBundleExtension,
  type VizijSpeechConfig,
  type VizijData,
} from "@vizij/render";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import type {
  AnimatableComponent,
  AnimatableValue,
  RawValue,
  StandardRigInput,
} from "@vizij/utils";
import { downloadJsonFile, ensureExtension } from "@vizij/authoring-shared";
import { getLookup, cloneRawValue } from "@vizij/utils";
import {
  auditBundleGraphs,
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  buildAuthoringRigGraphArtifacts,
  buildAuthoringVizijBundle,
  resolveBundleContractViolationMessage,
  type AnimationClipIR,
  type MotionGraphBundleEntry,
  type PipelineConfigByInputId,
  type VizijPipelineMetadataV1,
} from "@vizij/studio-support";
import { faceSlug } from "../utils/faceId";
import { waitForNextFrame } from "../utils/frame";
import { applyDefaultsToRobotData } from "../utils/robotData";
import { cloneSerializable } from "../utils/serialization";
import type {
  PoseDiagnostic,
  PoseRigConfigFile,
  PoseRigIrFile,
} from "../poseRig/types";
import { useAnimationStore } from "../state/animationStore";
import { PoseGraphService } from "../poseRig/services/poseGraphService";
import { PoseIrService } from "../poseRig/services/poseIrService";
import { logAuthoringDebug } from "../utils/debug";

interface CollectAnimatableExportStateResult {
  appliedOverrides: boolean;
  nextAnimatables: Record<string, AnimatableValue>;
  nextValues: Map<string, RawValue | undefined>;
  effectiveAnimatables: Record<string, AnimatableValue>;
}

interface PoseRigExportState {
  poseGraphSpec: GraphSpec | null;
  poseGraphFileName: string;
  poseConfigDraft: PoseRigConfigFile | null;
  poseConfigFileName: string;
  poseDiagnostics?: PoseDiagnostic[];
  importPoseConfig: (file: File) => Promise<void>;
  poseIrDraft?: unknown | null;
  poseIrFileName?: string;
  importPoseIr?: (file: File) => Promise<void> | void;
  exportPoseIrData?: () => Promise<unknown> | unknown;
  blendMode?: "average" | "additive";
  crossGroupBlendMode?: "average" | "additive";
}

type TraversableBody = {
  traverse: (callback: (object: Record<string, any>) => void) => void;
};

type ExportBodySource = "mounted-root" | "mounted-any" | "fallback" | "none";

function isTraversableBody(value: unknown): value is TraversableBody {
  return (
    Boolean(value) && typeof (value as TraversableBody).traverse === "function"
  );
}

function asExportableBody(
  value: unknown,
): (Parameters<typeof exportScene>[0] & TraversableBody) | null {
  if (!isTraversableBody(value)) {
    return null;
  }
  return value as Parameters<typeof exportScene>[0] & TraversableBody;
}

function countRobotDataNodes(body: TraversableBody): number {
  let count = 0;
  body.traverse((object) => {
    const robotData = object?.userData?.gltfExtensions?.RobotData;
    if (robotData && typeof robotData === "object") {
      count += 1;
    }
  });
  return count;
}

interface UseVizijExportOptions {
  faceId: string | null;
  graphFileName: string;
  exportFileName: string;
  rootId: string | null;
  sourceName: string | null;
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  loadedBundle: VizijBundleExtension | null;
  authoredAnimationClips?: AnimationClipIR[];
  animatableComponents: AnimatableComponent[];
  animatables: Record<string, AnimatableValue>;
  values: VizijData["values"];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  standardInputsById: Map<string, StandardRigInput>;
  validOutputTargets?: Set<string>;
  standardInputMetadataById?: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  pipelineMetadataV1?: VizijPipelineMetadataV1 | null;
  pipelineConfigByInputId?: PipelineConfigByInputId;
  featureLabelOverrides: Record<string, string>;
  collectAnimatableExportState: () => CollectAnimatableExportStateResult;
  setStoreState: (updater: (state: VizijData) => VizijData) => void;
  getExportableBodies: (rootIds?: string[]) => unknown[];
  fallbackExportBody?: unknown;
  alertDialog: (message: string) => Promise<void> | void;
  poseRig: PoseRigExportState;
  authoredMotionGraphs?: MotionGraphBundleEntry[];
  getMotionGraphSpec?: () => { nodes: unknown[]; edges: unknown[] } | null;
  activeMotionGraphId?: string | null;
  onExportGlbComplete?: () => void;
}

interface VizijExportHandlers {
  exportGraph: () => void;
  exportGlb: () => Promise<void>;
  exportPoseGraphFile: () => void;
  exportPoseConfigFile: () => void;
  exportPoseIrFile: () => Promise<void>;
  importPoseConfigFile: (file: File) => Promise<void>;
  importPoseIrFile: (file: File) => Promise<void>;
  canExportPoseIr: boolean;
  canImportPoseIr: boolean;
  poseIrSupportHint: string;
}

const POSE_IR_SUPPORT_HINT =
  "Pose IR hooks unavailable. Expected core poseRig hooks: exportPoseIrData() and importPoseIr(file).";

function logVizijExportDebug(
  event: string,
  payload?: Record<string, unknown>,
): void {
  logAuthoringDebug("export", "[vizij-export]", { event, ...(payload ?? {}) });
}

function resolveExportFaceId(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : faceSlug(value);
}

function withPoseConfigFaceId(
  config: PoseRigConfigFile,
  faceId: string,
): PoseRigConfigFile {
  if (config.faceId === faceId) {
    return config;
  }
  return {
    ...config,
    faceId,
  };
}

function isPoseRigIrFile(value: unknown): value is PoseRigIrFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<PoseRigIrFile>;
  return (
    candidate.version === 1 &&
    Array.isArray(candidate.poses) &&
    Array.isArray(candidate.groups) &&
    typeof candidate.neutral === "object" &&
    candidate.neutral !== null
  );
}

function resolvePoseConfigFromIr(
  poseRig: Pick<PoseRigExportState, "poseIrDraft" | "poseConfigDraft">,
): PoseRigConfigFile | null {
  if (isPoseRigIrFile(poseRig.poseIrDraft)) {
    return PoseIrService.toConfig(poseRig.poseIrDraft);
  }
  return poseRig.poseConfigDraft;
}

function hasAuthoredPoseData(config: PoseRigConfigFile | null): boolean {
  return Boolean(config && Array.isArray(config.poses) && config.poses.length);
}

function hasPoseConstantNodes(spec: GraphSpec | null | undefined): boolean {
  if (!spec || !Array.isArray(spec.nodes)) {
    return false;
  }
  return spec.nodes.some((node: { id?: unknown } | null | undefined) => {
    if (!node || typeof node.id !== "string") {
      return false;
    }
    return node.id.startsWith("pose_record_");
  });
}

export function useVizijExport(
  options: UseVizijExportOptions,
): VizijExportHandlers {
  const {
    faceId,
    graphFileName,
    exportFileName,
    rootId,
    sourceName,
    includeVizijBundle,
    includeImportedAnimations,
    loadedBundle,
    authoredAnimationClips,
    animatableComponents,
    animatables,
    values,
    bindings,
    inputBindings,
    standardInputsById,
    validOutputTargets,
    standardInputMetadataById,
    pipelineMetadataV1,
    pipelineConfigByInputId,
    featureLabelOverrides,
    collectAnimatableExportState,
    setStoreState,
    getExportableBodies,
    fallbackExportBody,
    alertDialog,
    poseRig,
    authoredMotionGraphs,
    getMotionGraphSpec,
    activeMotionGraphId,
    onExportGlbComplete,
  } = options;

  const exportGraph = useCallback(() => {
    const exportFaceId = resolveExportFaceId(faceId);
    const slug = faceSlug(exportFaceId);
    const animatablesForExport = Object.fromEntries(
      Object.entries(animatables).map(([id, anim]) => {
        const lookup = getLookup(exportFaceId, id);
        const override = values.get(lookup);
        if (override === undefined) {
          return [id, anim];
        }
        return [
          id,
          {
            ...anim,
            default: cloneRawValue(override),
          } as AnimatableValue,
        ];
      }),
    );
    const normalizedName = ensureExtension(
      graphFileName,
      `${slug}_rig`,
      "json",
    );
    const base = normalizedName.replace(/\.json$/i, "");
    const poseConfigForCompose = resolvePoseConfigFromIr(poseRig);
    const graphArtifacts = buildAuthoringRigGraphArtifacts({
      faceId: exportFaceId,
      animatablesForExport,
      animatableComponents,
      bindings,
      inputBindings,
      standardInputsById,
      featureLabelOverrides,
      inputMetadata: standardInputMetadataById,
      pipelineMetadataV1,
      pipelineConfigByInputId,
      poseConfigForCompose,
    });

    const specPayload = cloneSerializable(graphArtifacts.spec);
    downloadJsonFile(specPayload, `${base}.json`);

    if (graphArtifacts.irGraph) {
      const irPayload = cloneSerializable(graphArtifacts.irGraph);
      downloadJsonFile(irPayload, `${base}.ir.json`);
    }
  }, [
    animatables,
    animatableComponents,
    bindings,
    faceId,
    graphFileName,
    inputBindings,
    featureLabelOverrides,
    pipelineConfigByInputId,
    pipelineMetadataV1,
    poseRig.poseConfigDraft,
    poseRig.poseIrDraft,
    standardInputsById,
    standardInputMetadataById,
    values,
  ]);

  const exportGlb = useCallback(async () => {
    logVizijExportDebug("export-glb:invoked", {
      faceId,
      rootId,
      sourceName,
      includeVizijBundle,
      includeImportedAnimations,
    });

    const originalAnimatables = animatables;
    const originalValues = values;
    let overridesApplied = false;
    const restoreOverrides = () => {
      if (!overridesApplied) {
        return;
      }
      setStoreState((prev) => ({
        ...prev,
        animatables: originalAnimatables,
        values: originalValues,
      }));
      overridesApplied = false;
    };

    try {
      const exportFaceId = resolveExportFaceId(faceId);
      const slug = faceSlug(exportFaceId);
      const downloadName = ensureExtension(
        exportFileName,
        `${slug}_vizij`,
        "glb",
      );

      const { effectiveAnimatables } = collectAnimatableExportState();
      const animatablesForExport = Object.fromEntries(
        Object.entries(effectiveAnimatables).map(([id, anim]) => {
          const lookup = getLookup(exportFaceId, id);
          const override = values.get(lookup);
          if (override === undefined) {
            return [id, anim];
          }
          return [
            id,
            {
              ...anim,
              default: cloneRawValue(override),
            } as AnimatableValue,
          ];
        }),
      );

      await waitForNextFrame();

      const resolveExportableBodies = (filterIds?: string[]) =>
        getExportableBodies(filterIds).flatMap((body) => {
          const candidate = asExportableBody(body);
          return candidate ? [candidate] : [];
        });

      let maxRootCandidateCount = 0;
      let maxAnyCandidateCount = 0;
      let selectionAttempts = 0;
      let exportBodySource: ExportBodySource = "none";
      const resolveMountedCandidates = () => {
        const rootCandidates = resolveExportableBodies(
          rootId ? [rootId] : undefined,
        );
        const anyCandidates = rootId
          ? resolveExportableBodies()
          : rootCandidates;
        if (rootCandidates.length > maxRootCandidateCount) {
          maxRootCandidateCount = rootCandidates.length;
        }
        if (anyCandidates.length > maxAnyCandidateCount) {
          maxAnyCandidateCount = anyCandidates.length;
        }
        return { rootCandidates, anyCandidates };
      };

      const resolveExportBody = (): Array<
        Parameters<typeof exportScene>[0] & TraversableBody
      > => {
        const { rootCandidates, anyCandidates } = resolveMountedCandidates();
        if (rootCandidates.length > 0) {
          exportBodySource = "mounted-root";
          return rootCandidates;
        }
        if (anyCandidates.length > 0) {
          exportBodySource = "mounted-any";
          return anyCandidates;
        }
        exportBodySource = "none";
        return [];
      };

      let exportableBodies = resolveExportBody();
      for (
        let attempt = 0;
        attempt < 12 && !exportableBodies.length;
        attempt += 1
      ) {
        await waitForNextFrame();
        selectionAttempts = attempt + 1;
        exportableBodies = resolveExportBody();
      }
      let usingFallbackExportBody = false;
      const fallbackCandidate = asExportableBody(fallbackExportBody);
      if (!exportableBodies.length && fallbackCandidate) {
        exportableBodies = [fallbackCandidate];
        usingFallbackExportBody = true;
        exportBodySource = "fallback";
      }

      const selectedRobotDataNodeCount =
        exportableBodies.length > 0
          ? countRobotDataNodes(exportableBodies[0] as TraversableBody)
          : null;
      logVizijExportDebug("export-glb:body-selection", {
        rootId,
        source: exportBodySource,
        attempts: selectionAttempts,
        maxRootCandidateCount,
        maxAnyCandidateCount,
        selectedRobotDataNodeCount,
      });

      if (
        includeVizijBundle &&
        usingFallbackExportBody &&
        exportableBodies.length > 0 &&
        selectedRobotDataNodeCount === 0
      ) {
        const rootHint = rootId?.trim()
          ? ` for rootId=${rootId}`
          : " for the active face root";
        await alertDialog(
          `Bundled export is using fallback scene${rootHint} because no mounted runtime refs were found (max mounted-root candidates=${maxRootCandidateCount.toString(
            10,
          )}, mounted-any candidates=${maxAnyCandidateCount.toString(
            10,
          )}). Fallback scene has no RobotData nodes, so bundled export is blocked.`,
        );
        return;
      }
      if (!exportableBodies.length) {
        await alertDialog("Load a Vizij asset before exporting.");
        return;
      }

      const poseConfigDraftCount = Array.isArray(poseRig.poseConfigDraft?.poses)
        ? poseRig.poseConfigDraft?.poses.length
        : null;
      const poseIrDraftCount = isPoseRigIrFile(poseRig.poseIrDraft)
        ? poseRig.poseIrDraft.poses.length
        : null;
      const poseGraphNodeCount = Array.isArray(poseRig.poseGraphSpec?.nodes)
        ? poseRig.poseGraphSpec?.nodes.length
        : null;
      logVizijExportDebug("export-glb:start", {
        exportFaceId,
        rootId,
        sourceName,
        includeVizijBundle,
        includeImportedAnimations,
        loadedBundleGraphCount: loadedBundle?.graphs?.length ?? 0,
        loadedBundleHasPoseConfig: Boolean(loadedBundle?.poses?.config),
        poseConfigDraftCount,
        poseIrDraftCount,
        poseGraphNodeCount,
        poseGraphHasPoseConstants: hasPoseConstantNodes(poseRig.poseGraphSpec),
      });

      applyDefaultsToRobotData(
        exportableBodies,
        animatablesForExport,
        featureLabelOverrides,
      );

      const standardInputs = Array.from(standardInputsById.values());
      let poseGraphSpecForExport: GraphSpec | null = null;
      const poseConfigFromIr = resolvePoseConfigFromIr(poseRig);
      const poseConfigCandidate = poseConfigFromIr
        ? withPoseConfigFaceId(poseConfigFromIr, exportFaceId)
        : null;
      let poseConfigForExport = hasAuthoredPoseData(poseConfigCandidate)
        ? poseConfigCandidate
        : null;
      logVizijExportDebug("export-glb:pose-config", {
        poseConfigCandidateCount: Array.isArray(poseConfigCandidate?.poses)
          ? poseConfigCandidate.poses.length
          : null,
        hasAuthoredPoseData: Boolean(poseConfigForExport),
      });
      if (poseConfigForExport) {
        try {
          const { spec } = PoseGraphService.buildSpec(
            poseConfigForExport,
            standardInputs,
            {
              defaultGroupBlendMode: poseRig.blendMode ?? "average",
              crossGroupBlendMode: poseRig.crossGroupBlendMode ?? "additive",
            },
          );
          const hasConstants = hasPoseConstantNodes(spec);
          logVizijExportDebug("export-glb:pose-graph-built", {
            builtPoseGraphNodeCount: Array.isArray(spec.nodes)
              ? spec.nodes.length
              : null,
            hasPoseConstants: hasConstants,
          });
          if (hasConstants) {
            poseGraphSpecForExport = spec;
          } else {
            poseGraphSpecForExport = null;
            poseConfigForExport = null;
            logVizijExportDebug("export-glb:pose-graph-pruned", {
              reason: "no-pose-constant-nodes",
            });
          }
        } catch (error) {
          logVizijExportDebug("export-glb:pose-graph-build-failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          await alertDialog(
            `Failed to build pose graph for export: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return;
        }
      }

      const animationStore = useAnimationStore.getState();
      const fallbackAuthoredClip =
        animationStore.tracks.length > 0
          ? animationStore.exportClipIr({
              id: AUTHORED_TIMELINE_CLIP_ID,
              name: AUTHORED_TIMELINE_CLIP_NAME,
            })
          : null;
      const authoredClipCandidates =
        Array.isArray(authoredAnimationClips) &&
        authoredAnimationClips.length > 0
          ? authoredAnimationClips
          : fallbackAuthoredClip
            ? [fallbackAuthoredClip]
            : [];
      const normalizedAuthoredAnimationClips = authoredClipCandidates.filter(
        (clip) =>
          clip.tracks.some(
            (track) =>
              Array.isArray(track.keyframes) && track.keyframes.length > 0,
          ),
      );

      let bundle: VizijBundleExtension | null;
      try {
        const fallbackMotionGraph = getMotionGraphSpec
          ? (() => {
              const motionGraphSpec = getMotionGraphSpec();
              return motionGraphSpec && motionGraphSpec.nodes.length > 0
                ? {
                    id: "motiongraph",
                    label: "motiongraph",
                    spec: motionGraphSpec,
                  }
                : null;
            })()
          : null;
        bundle = buildAuthoringVizijBundle({
          includeVizijBundle,
          includeImportedAnimations,
          faceId: exportFaceId,
          sourceName,
          loadedBundle,
          pose: {
            poseGraphSpec: poseGraphSpecForExport,
            poseGraphFileName: poseRig.poseGraphFileName,
            poseConfig: poseConfigForExport,
            poseIr: poseRig.poseIrDraft,
            poseDiagnostics: poseRig.poseDiagnostics,
          },
          animatablesForExport,
          animatableComponents,
          bindings,
          inputBindings,
          standardInputsById,
          featureLabelOverrides,
          inputMetadata: standardInputMetadataById,
          pipelineMetadataV1,
          pipelineConfigByInputId,
          authoredAnimationClips: normalizedAuthoredAnimationClips,
          speechConfig: collectSpeechConfigFromLocalStorage(),
          motionGraphs: authoredMotionGraphs,
          fallbackMotionGraph,
          activeMotionGraphId,
        });
      } catch (error) {
        await alertDialog(
          error instanceof Error ? error.message : String(error),
        );
        return;
      }

      if (bundle?.graphs?.length) {
        const rigGraph = bundle.graphs.find((graph) => graph.kind === "rig");
        const fatalIssues = (
          rigGraph?.metadata as { issues?: { fatal?: unknown[] } } | undefined
        )?.issues?.fatal;
        if (Array.isArray(fatalIssues) && fatalIssues.length > 0) {
          await alertDialog(
            "Fix rig graph errors before exporting the bundled GLB.",
          );
          return;
        }
        if (rigGraph?.spec) {
          try {
            await normalizeGraphSpec(rigGraph.spec as GraphSpec);
          } catch (error) {
            await alertDialog(
              `Rig graph validation failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return;
          }
        }
        if (
          poseGraphSpecForExport &&
          hasPoseConstantNodes(poseGraphSpecForExport)
        ) {
          logVizijExportDebug("export-glb:pose-graph-validate", {
            poseGraphNodeCount: Array.isArray(poseGraphSpecForExport.nodes)
              ? poseGraphSpecForExport.nodes.length
              : null,
          });
          const poseWarnings = PoseGraphService.validate(
            poseGraphSpecForExport,
            standardInputs,
          );
          if (poseWarnings.length > 0) {
            logVizijExportDebug("export-glb:pose-graph-invalid", {
              poseWarnings,
            });
            await alertDialog(
              `Pose graph is invalid:\n${poseWarnings.join("\n")}`,
            );
            return;
          }
        }
        const bundleAudits = await auditBundleGraphs(bundle, {
          validOutputTargets,
        });
        const contractViolationMessage =
          resolveBundleContractViolationMessage(bundleAudits);
        if (contractViolationMessage) {
          await alertDialog(contractViolationMessage);
          return;
        }
      }

      logVizijExportDebug("export-glb:export-scene", {
        finalBundleGraphKinds: bundle?.graphs?.map((graph) => graph.kind) ?? [],
        finalBundleHasPosePayload: Boolean(bundle?.poses),
      });

      exportScene(
        exportableBodies[0],
        bundle
          ? {
              fileName: downloadName,
              bundle,
              onComplete: onExportGlbComplete,
              onError: (error: Error) => {
                void alertDialog(`GLB export failed: ${error.message}`);
              },
            }
          : {
              fileName: downloadName,
              onComplete: onExportGlbComplete,
              onError: (error: Error) => {
                void alertDialog(`GLB export failed: ${error.message}`);
              },
            },
      );
    } catch (error) {
      logVizijExportDebug("export-glb:unhandled-error", {
        error: error instanceof Error ? error.message : String(error),
      });
      await alertDialog(
        `GLB export failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      restoreOverrides();
    }
  }, [
    alertDialog,
    animatableComponents,
    animatables,
    activeMotionGraphId,
    authoredAnimationClips,
    authoredMotionGraphs,
    bindings,
    collectAnimatableExportState,
    exportFileName,
    faceId,
    featureLabelOverrides,
    fallbackExportBody,
    getExportableBodies,
    getMotionGraphSpec,
    includeImportedAnimations,
    includeVizijBundle,
    inputBindings,
    loadedBundle,
    onExportGlbComplete,
    pipelineConfigByInputId,
    pipelineMetadataV1,
    poseRig,
    rootId,
    setStoreState,
    sourceName,
    standardInputsById,
    validOutputTargets,
    values,
  ]);

  const exportPoseGraphFile = useCallback(async () => {
    try {
      const poseConfigFromIr = resolvePoseConfigFromIr(poseRig);
      const exportFaceId = resolveExportFaceId(faceId);
      const poseConfigForExport = poseConfigFromIr
        ? withPoseConfigFaceId(poseConfigFromIr, exportFaceId)
        : null;
      if (!poseConfigForExport) {
        await alertDialog(
          "Capture a neutral pose or add pose data before exporting.",
        );
        return;
      }
      const inputs = Array.from(standardInputsById.values());
      const { spec } = PoseGraphService.buildSpec(poseConfigForExport, inputs, {
        defaultGroupBlendMode: poseRig.blendMode ?? "average",
        crossGroupBlendMode: poseRig.crossGroupBlendMode ?? "additive",
      });
      const warnings = hasPoseConstantNodes(spec)
        ? PoseGraphService.validate(spec, inputs)
        : [];
      logVizijExportDebug("export-pose-graph:file", {
        poseGraphNodeCount: Array.isArray(spec.nodes)
          ? spec.nodes.length
          : null,
        hasPoseConstants: hasPoseConstantNodes(spec),
        warningCount: warnings.length,
      });
      if (warnings.length > 0) {
        await alertDialog(`Pose graph is invalid:\n${warnings.join("\n")}`);
        return;
      }
      const slug = faceSlug(exportFaceId);
      const fileName = ensureExtension(
        poseRig.poseGraphFileName,
        `${slug}_pose_graph`,
        "json",
      );
      downloadJsonFile(cloneSerializable(spec), fileName);
    } catch (error) {
      await alertDialog(
        `Failed to build pose graph for export: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [
    alertDialog,
    faceId,
    poseRig.poseIrDraft,
    poseRig.poseConfigDraft,
    poseRig.poseGraphFileName,
    poseRig.blendMode,
    poseRig.crossGroupBlendMode,
    standardInputsById,
  ]);

  const exportPoseConfigFile = useCallback(async () => {
    try {
      const configFromIr = resolvePoseConfigFromIr(poseRig);
      const exportFaceId = resolveExportFaceId(faceId);
      const config = configFromIr
        ? withPoseConfigFaceId(configFromIr, exportFaceId)
        : null;
      if (!config) {
        await alertDialog(
          "Capture a neutral pose or add pose data before exporting.",
        );
        return;
      }
      const slug = faceSlug(exportFaceId);
      const fileName = ensureExtension(
        poseRig.poseConfigFileName,
        `${slug}_pose_config`,
        "json",
      );
      downloadJsonFile(cloneSerializable(config), fileName);
    } catch (error) {
      await alertDialog(
        `Failed to build pose config for export: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }, [
    alertDialog,
    faceId,
    poseRig.poseIrDraft,
    poseRig.poseConfigDraft,
    poseRig.poseConfigFileName,
  ]);

  const importPoseConfigFile = useCallback(
    async (file: File) => {
      try {
        await poseRig.importPoseConfig(file);
      } catch (error) {
        await alertDialog(
          `Failed to import pose config: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [alertDialog, poseRig],
  );

  const canExportPoseIr =
    typeof poseRig.exportPoseIrData === "function" ||
    poseRig.poseIrDraft != null;
  const canImportPoseIr = typeof poseRig.importPoseIr === "function";

  const exportPoseIrFile = useCallback(async () => {
    let poseIrPayload: unknown = null;
    if (typeof poseRig.exportPoseIrData === "function") {
      try {
        poseIrPayload = await poseRig.exportPoseIrData();
      } catch (error) {
        await alertDialog(
          `Failed to build Pose IR for export: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
    } else {
      poseIrPayload = poseRig.poseIrDraft;
    }

    if (poseIrPayload == null) {
      await alertDialog(
        `Pose IR export is unavailable. ${POSE_IR_SUPPORT_HINT}`,
      );
      return;
    }

    const exportFaceId = resolveExportFaceId(faceId);
    const slug = faceSlug(exportFaceId);
    const fileName = ensureExtension(
      poseRig.poseIrFileName ?? "",
      `${slug}_pose_ir`,
      "json",
    );
    const payloadWithFaceId =
      poseIrPayload && typeof poseIrPayload === "object"
        ? {
            ...(cloneSerializable(
              poseIrPayload as Record<string, unknown>,
            ) as Record<string, unknown>),
            faceId: exportFaceId,
          }
        : poseIrPayload;
    downloadJsonFile(cloneSerializable(payloadWithFaceId), fileName);
  }, [
    alertDialog,
    faceId,
    poseRig.exportPoseIrData,
    poseRig.poseIrDraft,
    poseRig.poseIrFileName,
  ]);

  const importPoseIrFile = useCallback(
    async (file: File) => {
      if (typeof poseRig.importPoseIr !== "function") {
        await alertDialog(
          `Pose IR import is unavailable. ${POSE_IR_SUPPORT_HINT}`,
        );
        return;
      }
      try {
        await poseRig.importPoseIr(file);
      } catch (error) {
        await alertDialog(
          `Failed to import Pose IR: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [alertDialog, poseRig.importPoseIr],
  );

  return {
    exportGraph,
    exportGlb,
    exportPoseGraphFile,
    exportPoseConfigFile,
    exportPoseIrFile,
    importPoseConfigFile,
    importPoseIrFile,
    canExportPoseIr,
    canImportPoseIr,
    poseIrSupportHint: POSE_IR_SUPPORT_HINT,
  };
}

function collectSpeechConfigFromLocalStorage(): VizijSpeechConfig | null {
  try {
    const speakingInputPath = localStorage.getItem(
      "vizij_speech_speaking_path",
    );
    const userSpeakingInputPath = localStorage.getItem(
      "vizij_speech_user_speaking_path",
    );
    const thinkingInputPath = localStorage.getItem(
      "vizij_speech_thinking_path",
    );
    const agentName = localStorage.getItem("vizij_agent_name");
    const emotionGroupId = localStorage.getItem(
      "vizij_speech_emotion_group_id",
    );
    const visemeGroupId = localStorage.getItem("vizij_speech_viseme_group_id");
    const voice = localStorage.getItem("vizij_speech_voice");
    const mode = localStorage.getItem("vizij_speech_mode") as
      | "echo"
      | "conversation"
      | null;
    const systemPrompt = localStorage.getItem("vizij_speech_system_prompt");
    const autoActivateMic =
      localStorage.getItem("vizij_speech_auto_activate_mic") === "true";

    // Only create config if at least one setting has been configured
    const hasAnyValue =
      speakingInputPath ||
      userSpeakingInputPath ||
      thinkingInputPath ||
      agentName ||
      emotionGroupId ||
      visemeGroupId ||
      voice ||
      mode ||
      systemPrompt ||
      autoActivateMic;

    if (!hasAnyValue) return null;

    const config: VizijSpeechConfig = {};
    if (speakingInputPath) config.speakingInputPath = speakingInputPath;
    if (userSpeakingInputPath)
      config.userSpeakingInputPath = userSpeakingInputPath;
    if (thinkingInputPath) config.thinkingInputPath = thinkingInputPath;
    if (agentName) config.agentName = agentName;
    if (emotionGroupId) config.emotionGroupId = emotionGroupId;
    if (visemeGroupId) config.visemeGroupId = visemeGroupId;
    if (voice) config.voice = voice;
    if (mode) config.mode = mode;
    if (systemPrompt) config.systemPrompt = systemPrompt;
    if (autoActivateMic) config.autoActivateMic = true;
    return config;
  } catch {
    return null;
  }
}
