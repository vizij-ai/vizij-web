import { useCallback } from "react";
import {
  exportScene,
  type VizijBundleAnimationEntry,
  type VizijBundleExtension,
  type VizijPoseRigConfig,
  type VizijSpeechConfig,
  type VizijStarredItem,
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
import {
  buildRigPipelineV1LinkId,
  getLookup,
  cloneRawValue,
} from "@vizij/utils";
import { faceSlug } from "../utils/faceId";
import { waitForNextFrame } from "../utils/frame";
import { type VizijPipelineMetadataV1 } from "../utils/graphImport";
import { applyDefaultsToRobotData } from "../utils/robotData";
import { cloneSerializable } from "../utils/serialization";
import type { BundleGraphWithIr } from "../types/bundle";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  type AnimationClipIR,
} from "../types/animationClipIr";
import type {
  PoseDiagnostic,
  PoseRigConfigFile,
  PoseRigIrFile,
} from "../poseRig/types";
import { useAnimationStore } from "../state/animationStore";
import { getStarredForFace, useStarredStore } from "../state/starredStore";
import { PoseGraphService } from "../poseRig/services/poseGraphService";
import { PoseIrService } from "../poseRig/services/poseIrService";
import { auditBundleGraphs } from "../utils/bundleAudit";
import {
  clipIrToBundleAnimationEntry,
  findCanonicalAuthoredTimelineConflict,
} from "../utils/animationClipCompiler";
import {
  buildPoseComposeModeByInputId,
  withPipelineConfigBuildOptions,
  type PipelineConfigByInputId,
} from "./rigController/rigGraphCompiler";

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
  authoredMotionGraphs?: MotionGraphExportEntry[];
  getMotionGraphSpec?: () => { nodes: unknown[]; edges: unknown[] } | null;
  activeMotionGraphId?: string | null;
  onExportGlbComplete?: () => void;
}

interface MotionGraphExportEntry {
  id: string;
  label?: string;
  spec: { nodes: unknown[]; edges: unknown[] };
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
  // eslint-disable-next-line no-console -- local export smoke-test diagnostics
  console.log("[vizij-export]", { event, ...(payload ?? {}) });
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

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFiniteValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolvePipelineMetadataForExport(
  pipelineMetadataV1: VizijPipelineMetadataV1 | null | undefined,
  pipelineConfigByInputId: PipelineConfigByInputId | null | undefined,
  availableInputIds: ReadonlySet<string>,
): VizijPipelineMetadataV1 | null {
  const hasAvailableInputIds = availableInputIds.size > 0;
  const hasConfigMap =
    Boolean(pipelineConfigByInputId) &&
    Object.keys(pipelineConfigByInputId ?? {}).length > 0;
  const hasMetadataBase =
    Boolean(pipelineMetadataV1) &&
    typeof pipelineMetadataV1 === "object" &&
    !Array.isArray(pipelineMetadataV1);
  if (!hasMetadataBase && !hasConfigMap) {
    return null;
  }

  const base = hasMetadataBase
    ? (cloneSerializable(pipelineMetadataV1) as VizijPipelineMetadataV1)
    : ({} as VizijPipelineMetadataV1);
  const nextByInputId: PipelineConfigByInputId = {};
  const seededByConfigInputIds = new Set<string>();
  const synthesizedLinkParentInputIds = new Set<string>();
  const rawByInputId = hasConfigMap
    ? (pipelineConfigByInputId as PipelineConfigByInputId)
    : ((base.byInputId ?? {}) as PipelineConfigByInputId);

  Object.entries(rawByInputId).forEach(([rawInputId, rawConfig]) => {
    if (
      !rawConfig ||
      typeof rawConfig !== "object" ||
      Array.isArray(rawConfig)
    ) {
      return;
    }
    const configRecord = rawConfig as Record<string, unknown>;
    const inputId =
      normalizeStringValue(rawInputId) ??
      normalizeStringValue(configRecord.inputId);
    if (!inputId) {
      return;
    }
    if (hasAvailableInputIds && !availableInputIds.has(inputId)) {
      return;
    }
    nextByInputId[inputId] = {
      ...configRecord,
      inputId,
    };
    seededByConfigInputIds.add(inputId);
  });

  const nextLinks: Record<string, Record<string, unknown>> = {};
  const parentsByChild = new Map<string, Array<Record<string, unknown>>>();
  const childrenByParent = new Map<string, Set<string>>();
  const rawLinks =
    base.links && typeof base.links === "object" && !Array.isArray(base.links)
      ? (base.links as Record<string, unknown>)
      : {};

  Object.entries(rawLinks).forEach(([rawLinkId, rawLink]) => {
    if (!rawLink || typeof rawLink !== "object" || Array.isArray(rawLink)) {
      return;
    }
    const linkRecord = rawLink as Record<string, unknown>;
    const parentInputId = normalizeStringValue(linkRecord.parentInputId);
    const childInputId = normalizeStringValue(linkRecord.childInputId);
    if (!parentInputId || !childInputId) {
      return;
    }
    if (
      hasAvailableInputIds &&
      (!availableInputIds.has(parentInputId) ||
        !availableInputIds.has(childInputId))
    ) {
      return;
    }
    const linkId =
      normalizeStringValue(linkRecord.linkId) ??
      normalizeStringValue(rawLinkId) ??
      `link/${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`;
    const scale = normalizeFiniteValue(linkRecord.scale);
    const offset = normalizeFiniteValue(linkRecord.offset);
    const enabled = normalizeBooleanValue(linkRecord.enabled);
    const expression = normalizeStringValue(linkRecord.expression);
    const normalizedLink: Record<string, unknown> = {
      ...linkRecord,
      linkId,
      parentInputId,
      childInputId,
      ...(scale !== undefined ? { scale } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(expression ? { expression } : {}),
    };
    nextLinks[linkId] = normalizedLink;

    const parentEntry: Record<string, unknown> = {
      linkId,
      inputId: parentInputId,
      ...(scale !== undefined ? { scale } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(expression ? { expression } : {}),
    };
    const existingParents = parentsByChild.get(childInputId) ?? [];
    existingParents.push(parentEntry);
    parentsByChild.set(childInputId, existingParents);

    const existingChildren = childrenByParent.get(parentInputId) ?? new Set();
    existingChildren.add(childInputId);
    childrenByParent.set(parentInputId, existingChildren);
  });

  parentsByChild.forEach((parents, childInputId) => {
    if (!nextByInputId[childInputId]) {
      nextByInputId[childInputId] = { inputId: childInputId };
    }
    const existingParentEntries = Array.isArray(
      nextByInputId[childInputId]?.parents,
    )
      ? nextByInputId[childInputId].parents
      : [];
    const existingParentsByKey = new Map<string, Record<string, unknown>>();
    existingParentEntries.forEach((rawEntry) => {
      const entry = asRecord(rawEntry);
      if (!entry) {
        return;
      }
      const parentInputId = normalizeStringValue(entry.inputId);
      const linkId =
        normalizeStringValue(entry.linkId) ??
        (parentInputId
          ? buildRigPipelineV1LinkId(parentInputId, childInputId)
          : null);
      if (!parentInputId || !linkId) {
        return;
      }
      existingParentsByKey.set(`${parentInputId}::${linkId}`, entry);
    });
    const dedupedParents = new Map<string, Record<string, unknown>>();
    parents.forEach((parent) => {
      const parentInputId = normalizeStringValue(parent.inputId);
      const linkId = normalizeStringValue(parent.linkId);
      if (!parentInputId || !linkId) {
        return;
      }
      const key = `${parentInputId}::${linkId}`;
      dedupedParents.set(key, parent);
    });
    nextByInputId[childInputId].parents = Array.from(dedupedParents.values())
      .map((parent): Record<string, unknown> => {
        const parentInputId = normalizeStringValue(parent.inputId);
        const linkId = normalizeStringValue(parent.linkId);
        if (!parentInputId || !linkId) {
          return { ...parent };
        }
        const existing =
          existingParentsByKey.get(`${parentInputId}::${linkId}`) ?? null;
        if (!existing) {
          return { ...parent };
        }
        const alias = normalizeStringValue(existing.alias);
        const existingExpression = normalizeStringValue(existing.expression);
        const linkExpression = normalizeStringValue(parent.expression);
        return {
          ...existing,
          ...parent,
          ...(alias ? { alias } : {}),
          ...(linkExpression
            ? { expression: linkExpression }
            : existingExpression
              ? { expression: existingExpression }
              : {}),
        };
      })
      .sort((left, right) => {
        const leftParent = normalizeStringValue(left.inputId) ?? "";
        const rightParent = normalizeStringValue(right.inputId) ?? "";
        if (leftParent !== rightParent) {
          return leftParent.localeCompare(rightParent);
        }
        const leftLinkId = normalizeStringValue(left.linkId) ?? "";
        const rightLinkId = normalizeStringValue(right.linkId) ?? "";
        return leftLinkId.localeCompare(rightLinkId);
      })
      .map((parent) => ({ ...parent }));
  });

  childrenByParent.forEach((children, parentInputId) => {
    if (!nextByInputId[parentInputId]) {
      nextByInputId[parentInputId] = { inputId: parentInputId };
      synthesizedLinkParentInputIds.add(parentInputId);
    }
    nextByInputId[parentInputId].children = Array.from(children).sort((a, b) =>
      a.localeCompare(b),
    );
  });

  Object.keys(nextByInputId).forEach((inputId) => {
    const entry = nextByInputId[inputId];
    if (!entry) {
      return;
    }
    if (!Array.isArray(entry.parents)) {
      entry.parents = [];
    }
    if (!Array.isArray(entry.children)) {
      entry.children = [];
    }
    const directInput = asRecord(entry.directInput);
    const poseSource = asRecord(entry.poseSource);
    const poseTargets = Array.isArray(poseSource?.targetIds)
      ? poseSource.targetIds
      : [];
    const isPropsRigInput = /^propsrig_/i.test(inputId);
    const hasLinkedParents =
      parentsByChild.has(inputId) ||
      (Array.isArray(entry.parents) && entry.parents.length > 0);
    const hasExplicitDirectInput =
      directInput && typeof directInput.enabled === "boolean";
    const shouldRepairDeadRelayDriver =
      !isPropsRigInput &&
      (childrenByParent.has(inputId) ||
        (Array.isArray(entry.children) && entry.children.length > 0)) &&
      Array.isArray(entry.parents) &&
      entry.parents.length === 0 &&
      directInput?.enabled === false &&
      poseTargets.length === 0;
    if (
      synthesizedLinkParentInputIds.has(inputId) &&
      !seededByConfigInputIds.has(inputId) &&
      directInput?.enabled === undefined
    ) {
      entry.directInput = {
        ...(directInput ?? {}),
        enabled: true,
      };
      return;
    }
    if (isPropsRigInput && hasLinkedParents && !hasExplicitDirectInput) {
      entry.directInput = {
        ...(directInput ?? {}),
        enabled: true,
      };
      return;
    }
    if (shouldRepairDeadRelayDriver) {
      entry.directInput = {
        ...(directInput ?? {}),
        enabled: true,
      };
    }
  });

  if (Object.keys(nextByInputId).length > 0) {
    base.byInputId = cloneSerializable(
      nextByInputId,
    ) as PipelineConfigByInputId;
  } else {
    delete base.byInputId;
  }
  if (Object.keys(nextLinks).length > 0) {
    base.links = cloneSerializable(
      nextLinks,
    ) as VizijPipelineMetadataV1["links"];
  } else {
    delete base.links;
  }

  return Object.keys(base).length > 0 ? base : null;
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
    const pipelineMetadataForExport = resolvePipelineMetadataForExport(
      pipelineMetadataV1,
      pipelineConfigByInputId,
      new Set(standardInputsById.keys()),
    );
    const poseConfigForCompose = resolvePoseConfigFromIr(poseRig);
    const pipelineConfigByInputIdForExport =
      pipelineMetadataForExport &&
      typeof pipelineMetadataForExport.byInputId === "object" &&
      pipelineMetadataForExport.byInputId !== null &&
      !Array.isArray(pipelineMetadataForExport.byInputId)
        ? (pipelineMetadataForExport.byInputId as PipelineConfigByInputId)
        : pipelineConfigByInputId;

    const graphResult = buildRigGraphSpec(
      withPipelineConfigBuildOptions(
        {
          faceId: exportFaceId,
          animatables: animatablesForExport,
          components: animatableComponents,
          bindings,
          inputsById: standardInputsById,
          inputBindings,
          inputMetadata: standardInputMetadataById,
          inputComposeModesById:
            buildPoseComposeModeByInputId(poseConfigForCompose),
        },
        pipelineConfigByInputIdForExport,
        pipelineMetadataForExport,
      ),
    );

    const specPayload = cloneSerializable(graphResult.spec);
    downloadJsonFile(specPayload, `${base}.json`);

    if (graphResult.ir?.graph) {
      const irPayload = cloneSerializable(graphResult.ir.graph);
      downloadJsonFile(irPayload, `${base}.ir.json`);
    }
  }, [
    animatables,
    animatableComponents,
    bindings,
    faceId,
    graphFileName,
    inputBindings,
    pipelineConfigByInputId,
    pipelineMetadataV1,
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
        bundle = buildVizijBundle({
          includeVizijBundle,
          includeImportedAnimations,
          faceId: exportFaceId,
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
          pipelineMetadataV1,
          pipelineConfigByInputId,
          poseGraphSpecForExport,
          poseConfigForExport,
          authoredAnimationClips: normalizedAuthoredAnimationClips,
          speechConfig: collectSpeechConfigFromLocalStorage(),
          starredItems: getStarredForFace(
            useStarredStore.getState(),
            exportFaceId,
          ),
        });
      } catch (error) {
        await alertDialog(
          error instanceof Error ? error.message : String(error),
        );
        return;
      }

      if (bundle) {
        const authoredMotionGraphEntries = (authoredMotionGraphs ?? []).filter(
          (entry) =>
            entry &&
            typeof entry.id === "string" &&
            entry.id.trim().length > 0 &&
            entry.spec &&
            Array.isArray(entry.spec.nodes) &&
            Array.isArray(entry.spec.edges) &&
            entry.spec.nodes.length > 0,
        );
        if (authoredMotionGraphEntries.length > 0) {
          bundle = mergeMotionGraphsIntoBundle(
            bundle,
            authoredMotionGraphEntries,
          );
        } else if (getMotionGraphSpec) {
          const motionGraphSpec = getMotionGraphSpec();
          if (motionGraphSpec && motionGraphSpec.nodes.length > 0) {
            bundle = mergeMotionGraphsIntoBundle(bundle, [
              {
                id: "motiongraph",
                label: "motiongraph",
                spec: motionGraphSpec,
              },
            ]);
          }
        }

        if (
          bundle &&
          activeMotionGraphId &&
          bundle.graphs?.some(
            (g) => g.kind === "motiongraph" && g.id === activeMotionGraphId,
          )
        ) {
          bundle = {
            ...bundle,
            metadata: { ...bundle.metadata, activeMotionGraphId },
          };
        }
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

interface BuildVizijBundleOptions {
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  authoredAnimationClips?: AnimationClipIR[];
  faceId: string;
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
  pipelineMetadataV1?: VizijPipelineMetadataV1 | null;
  pipelineConfigByInputId?: PipelineConfigByInputId;
  poseGraphSpecForExport?: GraphSpec | null;
  poseConfigForExport?: PoseRigConfigFile | null;
  speechConfig?: VizijSpeechConfig | null;
  starredItems?: VizijStarredItem[];
}

function clonePoseIrForBundle(
  value: unknown,
  faceId: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const cloned = cloneSerializable(value as Record<string, unknown>) as Record<
    string,
    unknown
  >;
  cloned.faceId = faceId;
  return cloned;
}

function mergeMotionGraphsIntoBundle(
  bundle: VizijBundleExtension,
  motionGraphs: MotionGraphExportEntry[],
): VizijBundleExtension {
  const cloned = structuredClone(bundle);
  if (!cloned.graphs) {
    cloned.graphs = [];
  }
  cloned.graphs = cloned.graphs.filter((graph) => graph.kind !== "motiongraph");
  motionGraphs.forEach((motionGraph) => {
    cloned.graphs!.push({
      id: motionGraph.id,
      kind: "motiongraph",
      label: motionGraph.label ?? motionGraph.id,
      spec: motionGraph.spec as Record<string, unknown>,
      metadata: {
        exportedAt: new Date().toISOString(),
        source: "vizij-motiongraph",
        nodeCount: motionGraph.spec.nodes.length,
        edgeCount: motionGraph.spec.edges.length,
      },
    });
  });
  return cloned;
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

function buildVizijBundle(
  options: BuildVizijBundleOptions,
): VizijBundleExtension | null {
  if (!options.includeVizijBundle) {
    return null;
  }
  const {
    includeImportedAnimations,
    authoredAnimationClips,
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
    pipelineMetadataV1,
    pipelineConfigByInputId,
  } = options;
  const exportFaceId = resolveExportFaceId(faceId);
  const exportFaceSlug = faceSlug(exportFaceId);
  const poseConfigForCompose =
    options.poseConfigForExport !== undefined
      ? options.poseConfigForExport
      : resolvePoseConfigFromIr(poseRig);
  const pipelineMetadataForExport = resolvePipelineMetadataForExport(
    pipelineMetadataV1,
    pipelineConfigByInputId,
    new Set(standardInputsById.keys()),
  );
  const pipelineConfigByInputIdForExport =
    pipelineMetadataForExport &&
    typeof pipelineMetadataForExport.byInputId === "object" &&
    pipelineMetadataForExport.byInputId !== null &&
    !Array.isArray(pipelineMetadataForExport.byInputId)
      ? (pipelineMetadataForExport.byInputId as PipelineConfigByInputId)
      : pipelineConfigByInputId;

  const exportTimestamp = new Date().toISOString();
  const rigGraphResult = buildRigGraphSpec(
    withPipelineConfigBuildOptions(
      {
        faceId: exportFaceId,
        animatables: animatablesForExport,
        components: animatableComponents,
        bindings,
        inputsById: standardInputsById,
        inputBindings,
        inputMetadata,
        inputComposeModesById:
          buildPoseComposeModeByInputId(poseConfigForCompose),
      },
      pipelineConfigByInputIdForExport,
      pipelineMetadataForExport,
    ),
  );

  const rigIrGraph = rigGraphResult.ir?.graph
    ? (cloneSerializable(rigGraphResult.ir.graph) as unknown as Record<
        string,
        unknown
      >)
    : undefined;
  const rigSpec = cloneSerializable(rigGraphResult.spec) as Record<
    string,
    unknown
  >;
  const poseGraphSpec =
    options.poseGraphSpecForExport !== undefined
      ? options.poseGraphSpecForExport
      : poseRig.poseGraphSpec;

  const graphs: BundleGraphWithIr[] = [
    {
      id: exportFaceId,
      kind: "rig",
      label: `${exportFaceSlug} rig`,
      spec: rigSpec,
      ir: rigIrGraph ?? null,
      metadata: {
        exportedAt: exportTimestamp,
        faceId: exportFaceId,
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
      id: poseRig.poseGraphFileName || `${exportFaceSlug}_pose_graph`,
      kind: "pose-driver",
      label: poseRig.poseGraphFileName || "pose graph",
      spec: cloneSerializable(poseGraphSpec) as unknown as Record<
        string,
        unknown
      >,
      metadata: { exportedAt: exportTimestamp, faceId: exportFaceId },
    });
  }

  const poseConfigForBundle =
    options.poseConfigForExport !== undefined
      ? options.poseConfigForExport
      : (() => {
          const poseConfigFromIr = resolvePoseConfigFromIr(poseRig);
          return poseConfigFromIr
            ? withPoseConfigFaceId(poseConfigFromIr, exportFaceId)
            : null;
        })();
  const poseConfig: VizijPoseRigConfig | null = poseConfigForBundle
    ? (cloneSerializable(poseConfigForBundle) as unknown as VizijPoseRigConfig)
    : null;
  const poseIrForBundle = clonePoseIrForBundle(
    poseRig.poseIrDraft,
    exportFaceId,
  );
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

  const inheritedAnimations: VizijBundleAnimationEntry[] =
    includeImportedAnimations && Array.isArray(loadedBundle?.animations)
      ? (cloneSerializable(
          loadedBundle.animations,
        ) as VizijBundleAnimationEntry[])
      : [];
  const authoredAnimationEntries = (authoredAnimationClips ?? [])
    .map((clip) =>
      clipIrToBundleAnimationEntry(clip, {
        standardInputsById,
      }),
    )
    .filter(
      (entry) =>
        Boolean(entry) &&
        Boolean(entry.clip) &&
        Array.isArray(entry.clip.tracks) &&
        entry.clip.tracks.length > 0,
    );

  if (authoredAnimationEntries.length > 0 && includeImportedAnimations) {
    const conflictingCanonicalEntry =
      findCanonicalAuthoredTimelineConflict(inheritedAnimations);
    if (conflictingCanonicalEntry) {
      throw new Error(
        `Export blocked: imported animation "${AUTHORED_TIMELINE_CLIP_ID}" is not marked as authored timeline metadata.origin="${AUTHORED_TIMELINE_METADATA_ORIGIN}". Rename the imported clip or disable imported animation inheritance.`,
      );
    }
  }

  const mergedAnimationsById = new Map<string, VizijBundleAnimationEntry>();
  inheritedAnimations.forEach((entry) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      entry.id.trim().length === 0
    ) {
      return;
    }
    mergedAnimationsById.set(entry.id, entry);
  });
  authoredAnimationEntries.forEach((entry) => {
    mergedAnimationsById.set(entry.id, entry);
  });
  const mergedAnimations = Array.from(mergedAnimationsById.values()).sort(
    (left, right) => left.id.localeCompare(right.id),
  );

  const bundleMetadata: Record<string, unknown> = {
    faceId: exportFaceId,
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
  bundleMetadata.authoredAnimationClips = authoredAnimationEntries.length;
  bundleMetadata.animationPayloadCount = mergedAnimations.length;

  if (options.speechConfig) {
    bundleMetadata.speechConfig = options.speechConfig;
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
    animations: mergedAnimations,
    starred:
      options.starredItems && options.starredItems.length > 0
        ? { items: options.starredItems.map((item) => ({ ...item })) }
        : null,
    metadata: bundleMetadata,
  };
}
