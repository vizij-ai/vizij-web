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
import type { PoseRigConfigFile } from "../poseRig/types";
import { PoseGraphService } from "../poseRig/services/poseGraphService";

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
  importPoseConfig: (file: File) => Promise<void>;
  blendMode?: "average" | "additive";
  crossGroupBlendMode?: "average" | "additive";
}

type TraversableBody = {
  traverse: (callback: (object: Record<string, any>) => void) => void;
};

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
  standardInputMetadataById?: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  featureLabelOverrides: Record<string, string>;
  collectAnimatableExportState: () => CollectAnimatableExportStateResult;
  setStoreState: (updater: (state: VizijData) => VizijData) => void;
  getExportableBodies: (rootIds?: string[]) => unknown[];
  alertDialog: (message: string) => Promise<void> | void;
  poseRig: PoseRigExportState;
}

interface VizijExportHandlers {
  exportGraph: () => void;
  exportGlb: () => Promise<void>;
  exportPoseGraphFile: () => void;
  exportPoseConfigFile: () => void;
  importPoseConfigFile: (file: File) => Promise<void>;
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
    standardInputMetadataById,
    featureLabelOverrides,
    collectAnimatableExportState,
    setStoreState,
    getExportableBodies,
    alertDialog,
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

      const bodies = getExportableBodies(rootId ? [rootId] : undefined);
      if (!bodies.length) {
        await alertDialog("Load a Vizij asset before exporting.");
        return;
      }

      const primaryBody = bodies[0] as Parameters<typeof exportScene>[0];
      const traversableBodies = bodies as TraversableBody[];
      applyDefaultsToRobotData(
        traversableBodies,
        animatablesForExport,
        featureLabelOverrides,
      );

      const standardInputs = Array.from(standardInputsById.values());
      let poseGraphSpecForExport = poseRig.poseGraphSpec;
      if (poseRig.poseConfigDraft) {
        try {
          const { spec } = PoseGraphService.buildSpec(
            poseRig.poseConfigDraft,
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
      }

      exportScene(
        primaryBody,
        bundle
          ? {
              fileName: downloadName,
              bundle,
            }
          : { fileName: downloadName },
      );
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
    includeImportedAnimations,
    includeVizijBundle,
    inputBindings,
    loadedBundle,
    poseRig,
    rootId,
    setStoreState,
    sourceName,
    standardInputsById,
    values,
  ]);

  const exportPoseGraphFile = useCallback(async () => {
    if (!poseRig.poseConfigDraft) {
      await alertDialog(
        "Capture a neutral pose or add pose data before exporting.",
      );
      return;
    }
    try {
      const inputs = Array.from(standardInputsById.values());
      const { spec } = PoseGraphService.buildSpec(
        poseRig.poseConfigDraft,
        inputs,
        {
          defaultGroupBlendMode: poseRig.blendMode ?? "average",
          crossGroupBlendMode: poseRig.crossGroupBlendMode ?? "additive",
        },
      );
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
    poseRig.poseConfigDraft,
    poseRig.poseGraphFileName,
    standardInputsById,
  ]);

  const exportPoseConfigFile = useCallback(async () => {
    const config = poseRig.poseConfigDraft;
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

  return {
    exportGraph,
    exportGlb,
    exportPoseGraphFile,
    exportPoseConfigFile,
    importPoseConfigFile,
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
  const poseGraphSpec = options.poseGraphSpecForExport ?? poseRig.poseGraphSpec;

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

  const poseConfig: VizijPoseRigConfig | null = poseRig.poseConfigDraft
    ? (cloneSerializable(
        poseRig.poseConfigDraft,
      ) as unknown as VizijPoseRigConfig)
    : null;

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
          metadata: { exportedAt: exportTimestamp },
        }
      : null,
    animations: inheritedAnimations,
    metadata: bundleMetadata,
  };
}
