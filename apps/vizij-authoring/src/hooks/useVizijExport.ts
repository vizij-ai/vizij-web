import { useCallback } from "react";
import {
  exportScene,
  type VizijBundleExtension,
  type VizijPoseRigConfig,
  type VizijData,
} from "@vizij/render";
import {
  buildRigGraphSpec,
  type BindingMap,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import type {
  AnimatableComponent,
  AnimatableValue,
  RawValue,
  StandardRigInput,
} from "@vizij/utils";
import { downloadJsonFile, ensureExtension } from "@vizij/authoring-shared";
import { getLookup, cloneRawValue } from "@vizij/utils";
import { faceSlug } from "../utils/faceId";
import { waitForNextFrame } from "../utils/frame";
import { applyDefaultsToRobotData } from "../utils/robotData";
import { cloneSerializable } from "../utils/serialization";
import type { BundleGraphWithIr } from "../types/bundle";
import type {
  PoseDiagnostic,
  PoseRigConfigFile,
  PoseRigIrFile,
} from "../poseRig/types";
import { PoseGraphService } from "../poseRig/services/poseGraphService";
import { PoseIrService } from "../poseRig/services/poseIrService";
import { auditBundleGraphs } from "../utils/bundleAudit";

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

function isTraversableBody(value: unknown): value is TraversableBody {
  return (
    typeof value === "object" &&
    value !== null &&
    "traverse" in value &&
    typeof (value as { traverse?: unknown }).traverse === "function"
  );
}

async function resolveTraversableBodies(
  getExportableBodies: (rootIds?: string[]) => unknown[],
  rootId: string | null,
): Promise<TraversableBody[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bodies = getExportableBodies(rootId ? [rootId] : undefined);
    const traversable = bodies.filter(isTraversableBody);
    if (traversable.length > 0) {
      return traversable;
    }
    if (attempt < 2) {
      await waitForNextFrame();
    }
  }
  return [];
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
  featureLabelOverrides: Record<string, string>;
  collectAnimatableExportState: () => CollectAnimatableExportStateResult;
  setStoreState: (updater: (state: VizijData) => VizijData) => void;
  getExportableBodies: (rootIds?: string[]) => unknown[];
  alertDialog: (message: string) => Promise<void> | void;
  confirmDialog?: (message: string) => Promise<boolean> | boolean;
  poseRig: PoseRigExportState;
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

function resolveBundleContractViolationMessage(
  audits: Awaited<ReturnType<typeof auditBundleGraphs>>,
): string | null {
  const contractAudits = audits.filter((entry) => entry.kind === "rig");
  if (!contractAudits.length) {
    return null;
  }
  const mismatchEntry = contractAudits.find(
    (entry) => entry.status !== "match",
  );
  if (mismatchEntry) {
    if (mismatchEntry.status === "missing-ir") {
      return `Export blocked: graph "${mismatchEntry.label ?? mismatchEntry.id}" is missing IR metadata required for runtime compatibility checks.`;
    }
    if (mismatchEntry.status === "diff") {
      return `Export blocked: graph "${mismatchEntry.label ?? mismatchEntry.id}" does not match compiled IR (${mismatchEntry.diffCount} diff${mismatchEntry.diffCount === 1 ? "" : "s"}).`;
    }
    return `Export blocked: graph "${mismatchEntry.label ?? mismatchEntry.id}" failed runtime compatibility checks (${mismatchEntry.error ?? "unknown error"}).`;
  }
  const outputMismatch = contractAudits.find((entry) =>
    entry.outputs.some((output) => output.status === "missing-target"),
  );
  if (outputMismatch) {
    const missingOutput = outputMismatch.outputs.find(
      (output) => output.status === "missing-target",
    );
    return `Export blocked: graph "${outputMismatch.label ?? outputMismatch.id}" has output path "${missingOutput?.path ?? "(missing path)"}" that does not map to a runtime target.`;
  }
  return null;
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
    animatableComponents,
    animatables,
    values,
    bindings,
    inputBindings,
    standardInputsById,
    validOutputTargets,
    standardInputMetadataById,
    featureLabelOverrides,
    collectAnimatableExportState,
    setStoreState,
    getExportableBodies,
    alertDialog,
    confirmDialog,
    poseRig,
  } = options;

  const exportGraph = useCallback(() => {
    const slug = faceSlug(faceId);
    const animatablesForExport = Object.fromEntries(
      Object.entries(animatables).map(([id, anim]) => {
        const lookup = getLookup(faceId ?? slug, id);
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
    const resolvedFaceId = faceId ?? slug;

    const graphResult = buildRigGraphSpec({
      faceId: resolvedFaceId,
      animatables: animatablesForExport,
      components: animatableComponents,
      bindings,
      inputsById: standardInputsById,
      inputBindings,
      inputMetadata: standardInputMetadataById,
    });

    const specPayload = cloneSerializable(graphResult.spec);
    downloadJsonFile(specPayload, `${base}.json`);

    if (graphResult.ir?.graph) {
      const irPayload = cloneSerializable(graphResult.ir.graph);
      downloadJsonFile(irPayload, `${base}.ir.json`);
    }
  }, [
    animatableComponents,
    bindings,
    collectAnimatableExportState,
    faceId,
    graphFileName,
    inputBindings,
    standardInputsById,
    standardInputMetadataById,
  ]);

  const exportGlb = useCallback(async () => {
    const slug = faceSlug(faceId);
    const downloadName = ensureExtension(
      exportFileName,
      `${slug}_vizij`,
      "glb",
    );

    const originalAnimatables = animatables;
    const originalValues = values;
    const { effectiveAnimatables } = collectAnimatableExportState();
    const animatablesForExport = Object.fromEntries(
      Object.entries(effectiveAnimatables).map(([id, anim]) => {
        const lookup = getLookup(faceId ?? slug, id);
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
      await waitForNextFrame();

      const traversableBodies = await resolveTraversableBodies(
        getExportableBodies,
        rootId,
      );
      if (!traversableBodies.length) {
        await alertDialog("Load a Vizij asset before exporting.");
        return;
      }

      const primaryBody = traversableBodies[0] as Parameters<
        typeof exportScene
      >[0];
      applyDefaultsToRobotData(
        traversableBodies,
        animatablesForExport,
        featureLabelOverrides,
      );

      const standardInputs = Array.from(standardInputsById.values());
      let poseGraphSpecForExport: GraphSpec | null | undefined = undefined;
      const poseConfigForExport = resolvePoseConfigFromIr(poseRig);
      if (poseConfigForExport) {
        if ((poseConfigForExport.poses ?? []).length > 0) {
          try {
            const { spec } = PoseGraphService.buildSpec(
              poseConfigForExport,
              standardInputs,
              {
                defaultGroupBlendMode: poseRig.blendMode ?? "average",
                crossGroupBlendMode: poseRig.crossGroupBlendMode ?? "additive",
              },
            );
            poseGraphSpecForExport = spec;
          } catch (error) {
            await alertDialog(
              `Failed to build pose graph for export: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return;
          }
        } else {
          // No authored poses: export the rig/bundle without a pose-driver graph.
          poseGraphSpecForExport = null;
        }
      } else {
        poseGraphSpecForExport = poseRig.poseGraphSpec;
      }

      const bundle = buildVizijBundle({
        includeVizijBundle,
        includeImportedAnimations,
        faceId,
        sourceName,
        loadedBundle,
        poseRig,
        animatablesForExport,
        animatableComponents,
        bindings,
        inputBindings,
        standardInputsById,
        featureLabelOverrides,
        inputMetadata: standardInputMetadataById,
        poseGraphSpecForExport,
      });

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
        if (poseGraphSpecForExport) {
          const poseWarnings = PoseGraphService.validate(
            poseGraphSpecForExport,
            standardInputs,
          );
          if (poseWarnings.length > 0) {
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
          if (confirmDialog) {
            const shouldContinue = await confirmDialog(
              `${contractViolationMessage}\n\nContinue export anyway?`,
            );
            if (!shouldContinue) {
              return;
            }
          } else {
            await alertDialog(contractViolationMessage);
            return;
          }
        }
      }

      try {
        await exportScene(
          primaryBody,
          bundle
            ? {
                fileName: downloadName,
                bundle,
              }
            : { fileName: downloadName },
        );
      } catch (error) {
        await alertDialog(
          `Failed to export scene: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } finally {
      restoreOverrides();
    }
  }, [
    alertDialog,
    animatableComponents,
    animatables,
    bindings,
    collectAnimatableExportState,
    exportFileName,
    faceId,
    featureLabelOverrides,
    getExportableBodies,
    confirmDialog,
    includeImportedAnimations,
    includeVizijBundle,
    inputBindings,
    loadedBundle,
    poseRig,
    rootId,
    setStoreState,
    sourceName,
    standardInputsById,
    validOutputTargets,
    values,
  ]);

  const exportPoseGraphFile = useCallback(async () => {
    const poseConfigForExport = resolvePoseConfigFromIr(poseRig);
    if (!poseConfigForExport) {
      await alertDialog(
        "Capture a neutral pose or add pose data before exporting.",
      );
      return;
    }
    try {
      const inputs = Array.from(standardInputsById.values());
      const { spec } = PoseGraphService.buildSpec(poseConfigForExport, inputs, {
        defaultGroupBlendMode: poseRig.blendMode ?? "average",
        crossGroupBlendMode: poseRig.crossGroupBlendMode ?? "additive",
      });
      const warnings = PoseGraphService.validate(spec, inputs);
      if (warnings.length > 0) {
        await alertDialog(`Pose graph is invalid:\n${warnings.join("\n")}`);
        return;
      }
      const slug = faceSlug(faceId);
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
    standardInputsById,
  ]);

  const exportPoseConfigFile = useCallback(async () => {
    const config = resolvePoseConfigFromIr(poseRig);
    if (!config) {
      await alertDialog(
        "Capture a neutral pose or add pose data before exporting.",
      );
      return;
    }
    const slug = faceSlug(faceId);
    const fileName = ensureExtension(
      poseRig.poseConfigFileName,
      `${slug}_pose_config`,
      "json",
    );
    downloadJsonFile(cloneSerializable(config), fileName);
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

    const slug = faceSlug(faceId);
    const fileName = ensureExtension(
      poseRig.poseIrFileName ?? "",
      `${slug}_pose_ir`,
      "json",
    );
    downloadJsonFile(cloneSerializable(poseIrPayload), fileName);
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

interface BuildVizijBundleOptions {
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  faceId: string | null;
  sourceName: string | null;
  loadedBundle: VizijBundleExtension | null;
  poseRig: PoseRigExportState;
  animatablesForExport: Record<string, AnimatableValue>;
  animatableComponents: AnimatableComponent[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  standardInputsById: Map<string, StandardRigInput>;
  featureLabelOverrides: Record<string, string>;
  inputMetadata?: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  poseGraphSpecForExport?: GraphSpec | null;
}

function clonePoseIrForBundle(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return cloneSerializable(value as Record<string, unknown>) as Record<
    string,
    unknown
  >;
}

function buildVizijBundle(
  options: BuildVizijBundleOptions,
): VizijBundleExtension | null {
  if (!options.includeVizijBundle) {
    return null;
  }
  const {
    includeImportedAnimations,
    faceId,
    sourceName,
    loadedBundle,
    poseRig,
    animatablesForExport,
    animatableComponents,
    bindings,
    inputBindings,
    standardInputsById,
    featureLabelOverrides,
    inputMetadata,
  } = options;

  const exportTimestamp = new Date().toISOString();
  const rigGraphResult = buildRigGraphSpec({
    faceId: faceId ?? faceSlug(faceId),
    animatables: animatablesForExport,
    components: animatableComponents,
    bindings,
    inputsById: standardInputsById,
    inputBindings,
    inputMetadata,
  });

  const rigIrGraph = rigGraphResult.ir?.graph
    ? (cloneSerializable(rigGraphResult.ir.graph) as unknown as Record<
        string,
        unknown
      >)
    : undefined;
  const rigSpec = cloneSerializable(rigGraphResult.spec);
  const slug = faceSlug(faceId);
  const poseGraphSpec =
    options.poseGraphSpecForExport !== undefined
      ? options.poseGraphSpecForExport
      : poseRig.poseGraphSpec;

  const graphs: BundleGraphWithIr[] = [
    {
      id: rigGraphResult.summary.faceId ?? slug,
      kind: "rig",
      label: `${slug} rig`,
      spec: rigSpec,
      ir: rigIrGraph ?? null,
      metadata: {
        exportedAt: exportTimestamp,
        faceId: faceId ?? undefined,
        featureLabelOverrides:
          featureLabelOverrides && Object.keys(featureLabelOverrides).length > 0
            ? featureLabelOverrides
            : undefined,
        issues:
          rigGraphResult.issues.fatal.length > 0
            ? rigGraphResult.issues
            : undefined,
      },
    },
  ];

  if (poseGraphSpec) {
    graphs.push({
      id: poseRig.poseGraphFileName || `${slug}_pose_graph`,
      kind: "pose-driver",
      label: poseRig.poseGraphFileName || "pose graph",
      spec: cloneSerializable(poseGraphSpec) as unknown as Record<
        string,
        unknown
      >,
      metadata: { exportedAt: exportTimestamp },
    });
  }

  const poseConfigForBundle = resolvePoseConfigFromIr(poseRig);
  const poseConfig: VizijPoseRigConfig | null = poseConfigForBundle
    ? (cloneSerializable(poseConfigForBundle) as unknown as VizijPoseRigConfig)
    : null;
  const poseIrForBundle = clonePoseIrForBundle(poseRig.poseIrDraft);
  const poseDiagnostics = cloneSerializable(
    poseRig.poseDiagnostics ?? [],
  ) as PoseDiagnostic[];
  const diagnosticSummary = {
    errors: poseDiagnostics.filter((entry) => entry.severity === "error")
      .length,
    warnings: poseDiagnostics.filter((entry) => entry.severity === "warning")
      .length,
    info: poseDiagnostics.filter((entry) => entry.severity === "info").length,
  };

  const inheritedAnimations =
    includeImportedAnimations && Array.isArray(loadedBundle?.animations)
      ? (cloneSerializable(
          loadedBundle.animations,
        ) as VizijBundleExtension["animations"])
      : [];

  const bundleMetadata: Record<string, unknown> = {
    faceId: faceId ?? null,
    source: sourceName ?? null,
    exporter: "vizij-authoring",
  };

  if (loadedBundle) {
    bundleMetadata.previousBundleVersion = loadedBundle.version;
    if (loadedBundle.exportedAt) {
      bundleMetadata.previousExportedAt = loadedBundle.exportedAt;
    }
  }

  if (!includeImportedAnimations) {
    bundleMetadata.inheritedAnimations = false;
  }

  return {
    version: 1,
    exportedAt: exportTimestamp,
    graphs,
    poses: poseConfig
      ? {
          config: poseConfig,
          metadata: {
            exportedAt: exportTimestamp,
            poseIr: poseIrForBundle,
            diagnostics: poseDiagnostics,
            diagnosticSummary,
          },
        }
      : null,
    animations: inheritedAnimations,
    metadata: bundleMetadata,
  };
}
