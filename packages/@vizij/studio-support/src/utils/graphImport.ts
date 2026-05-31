import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import { cloneDeepSafe } from "@vizij/utils";
import type { VizijBundleExtension } from "../types";
import type {
  VizijPipelineConfigMap,
  VizijPipelineLinkMap,
  VizijPipelineMetadataV1,
} from "./standardInputRemap";

function cloneSerializable<T>(value: T): T {
  return cloneDeepSafe(value);
}

/**
 * Extracts the Vizij metadata section from a graph payload and guarantees
 * a deep clone so downstream transformations can mutate safely.
 */
function extractVizijMetadataSection(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const metadata = (payload as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const vizij = (metadata as { vizij?: unknown }).vizij;
  if (!vizij || typeof vizij !== "object") {
    return null;
  }
  return cloneSerializable(vizij as Record<string, unknown>);
}

function ensureVizijMetadataSection(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const metadata = (payload.metadata ??= {});
  if (typeof metadata !== "object" || metadata === null) {
    payload.metadata = {};
  }
  const container = payload.metadata as Record<string, unknown>;
  if (!container.vizij || typeof container.vizij !== "object") {
    container.vizij = {};
  }
  return container.vizij as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeIdentifiedRecords(
  payloadValue: unknown,
  compiledValue: unknown,
  keyField: string,
): unknown {
  if (!Array.isArray(payloadValue) || !Array.isArray(compiledValue)) {
    return compiledValue;
  }

  const next = new Map<string, Record<string, unknown>>();

  payloadValue.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }
    const key = entry[keyField];
    if (typeof key !== "string" || key.trim().length === 0) {
      return;
    }
    next.set(key, cloneSerializable(entry));
  });

  compiledValue.forEach((entry) => {
    if (!isRecord(entry)) {
      return;
    }
    const key = entry[keyField];
    if (typeof key !== "string" || key.trim().length === 0) {
      return;
    }
    const previous = next.get(key);
    next.set(
      key,
      previous
        ? {
            ...previous,
            ...cloneSerializable(entry),
          }
        : cloneSerializable(entry),
    );
  });

  return Array.from(next.values());
}

function mergeVizijMetadata(
  payloadVizijMetadata: Record<string, unknown>,
  compiledVizijMetadata: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!compiledVizijMetadata) {
    return payloadVizijMetadata;
  }

  const merged: Record<string, unknown> = {
    ...payloadVizijMetadata,
    ...compiledVizijMetadata,
  };

  if ("inputs" in payloadVizijMetadata || "inputs" in compiledVizijMetadata) {
    merged.inputs = mergeIdentifiedRecords(
      payloadVizijMetadata.inputs,
      compiledVizijMetadata.inputs,
      "id",
    );
  }

  if (
    "bindings" in payloadVizijMetadata ||
    "bindings" in compiledVizijMetadata
  ) {
    merged.bindings = mergeIdentifiedRecords(
      payloadVizijMetadata.bindings,
      compiledVizijMetadata.bindings,
      "targetId",
    );
  }

  return merged;
}

function extractIrGraphFromPayload(payload: unknown): IrGraph | null {
  const vizijMetadata = extractVizijMetadataSection(payload);
  if (
    vizijMetadata &&
    "irGraph" in vizijMetadata &&
    vizijMetadata.irGraph &&
    typeof vizijMetadata.irGraph === "object"
  ) {
    return cloneSerializable(vizijMetadata.irGraph as IrGraph);
  }
  if (payload && typeof payload === "object") {
    const direct = (payload as { irGraph?: unknown }).irGraph;
    if (direct && typeof direct === "object") {
      return cloneSerializable(direct as IrGraph);
    }
  }
  return null;
}

/**
 * Prepares an incoming spec payload for import by merging any embedded IR
 * metadata with a freshly compiled graph, ensuring downstream node-graph
 * tooling always sees a normalized structure.
 */
export function prepareSpecForImport(
  payload: unknown,
  irGraphPayload?: unknown,
): unknown {
  const irGraph = irGraphPayload
    ? cloneSerializable(irGraphPayload as IrGraph)
    : extractIrGraphFromPayload(payload);
  if (!irGraph) {
    return payload;
  }
  const compiled = compileIrGraph(irGraph, { preferLegacySpec: false });
  const enriched = cloneSerializable(compiled.spec) as Record<string, unknown>;
  const metadata =
    enriched.metadata && typeof enriched.metadata === "object"
      ? { ...(enriched.metadata as Record<string, unknown>) }
      : {};
  const payloadVizijMetadata = extractVizijMetadataSection(payload);
  if (!payloadVizijMetadata) {
    enriched.metadata = metadata;
    return enriched;
  }
  const compiledVizijMetadata = extractVizijMetadataSection(compiled.spec);
  metadata.vizij = mergeVizijMetadata(
    payloadVizijMetadata,
    compiledVizijMetadata,
  );
  enriched.metadata = metadata;
  return enriched;
}

export async function prepareBundleGraphSpecForImport(
  payload: unknown,
  irGraphPayload?: unknown,
): Promise<GraphSpec> {
  return normalizeRuntimeGraphSpec(
    prepareSpecForImport(payload, irGraphPayload) as GraphSpec,
  );
}

export async function normalizeRuntimeGraphSpec(
  spec: GraphSpec,
): Promise<GraphSpec> {
  return normalizeGraphSpec(spec);
}

export type BundleGraphSpecReplacementErrorKind =
  | "missing-audit"
  | "missing-audit-entry"
  | "missing-compiled-spec"
  | "missing-bundle"
  | "missing-graph";

export interface BundleGraphSpecReplacementAuditEntry {
  id: string;
  compiledSpec?: GraphSpec | null;
}

export interface PlanBundleGraphSpecReplacementOptions {
  bundle: VizijBundleExtension | null | undefined;
  audits: readonly BundleGraphSpecReplacementAuditEntry[] | null | undefined;
  graphId: string;
  reconciledAt: string;
}

export interface PlanBundleGraphSpecReplacementResult {
  bundle: VizijBundleExtension | null;
  error: { kind: BundleGraphSpecReplacementErrorKind } | null;
}

export function planBundleGraphSpecReplacement({
  bundle,
  audits,
  graphId,
  reconciledAt,
}: PlanBundleGraphSpecReplacementOptions): PlanBundleGraphSpecReplacementResult {
  if (!audits) {
    return {
      bundle: bundle ?? null,
      error: { kind: "missing-audit" },
    };
  }
  const target = audits.find((entry) => entry.id === graphId);
  if (!target) {
    return {
      bundle: bundle ?? null,
      error: { kind: "missing-audit-entry" },
    };
  }
  if (!target.compiledSpec) {
    return {
      bundle: bundle ?? null,
      error: { kind: "missing-compiled-spec" },
    };
  }
  if (!bundle?.graphs?.length) {
    return {
      bundle: bundle ?? null,
      error: { kind: "missing-bundle" },
    };
  }

  let replaced = false;
  const graphs = bundle.graphs.map((graph) => {
    if (graph.id !== graphId) {
      return graph;
    }
    replaced = true;
    return {
      ...graph,
      spec: cloneSerializable(target.compiledSpec as GraphSpec) as Record<
        string,
        unknown
      >,
      metadata: {
        ...(graph.metadata ?? {}),
        reconciledAt,
      },
    };
  });

  if (!replaced) {
    return {
      bundle,
      error: { kind: "missing-graph" },
    };
  }

  return {
    bundle: {
      ...bundle,
      graphs,
    },
    error: null,
  };
}

export type RenameBundleGraphOutputPathErrorKind =
  | "missing-bundle"
  | "missing-graph"
  | "missing-ir"
  | "invalid-ir"
  | "missing-node"
  | "empty-path";

export interface RenameBundleGraphOutputPathResult {
  bundle: VizijBundleExtension | null;
  error: { kind: RenameBundleGraphOutputPathErrorKind } | null;
}

export function renameBundleGraphOutputPath(
  bundle: VizijBundleExtension | null | undefined,
  graphId: string,
  nodeId: string,
  outputPath: string,
): RenameBundleGraphOutputPathResult {
  const trimmedPath = outputPath.trim();
  if (!trimmedPath) {
    return {
      bundle: bundle ?? null,
      error: { kind: "empty-path" },
    };
  }
  if (!bundle?.graphs?.length) {
    return {
      bundle: bundle ?? null,
      error: { kind: "missing-bundle" },
    };
  }
  const targetGraph = bundle.graphs.find((graph) => graph.id === graphId);
  if (!targetGraph) {
    return {
      bundle,
      error: { kind: "missing-graph" },
    };
  }
  if (!targetGraph.ir) {
    return {
      bundle,
      error: { kind: "missing-ir" },
    };
  }

  const nextIr = cloneSerializable(targetGraph.ir) as unknown as IrGraph;
  if (!Array.isArray(nextIr.nodes)) {
    return {
      bundle,
      error: { kind: "invalid-ir" },
    };
  }
  const targetNode = nextIr.nodes.find((node) => node.id === nodeId);
  if (!targetNode) {
    return {
      bundle,
      error: { kind: "missing-node" },
    };
  }

  targetNode.params = { ...(targetNode.params ?? {}), path: trimmedPath };
  const compiled = compileIrGraph(nextIr, { preferLegacySpec: false });
  const graphs = bundle.graphs.map((graph) => {
    if (graph.id !== graphId) {
      return graph;
    }
    return {
      ...graph,
      spec: cloneSerializable(compiled.spec) as Record<string, unknown>,
      ir: cloneSerializable(nextIr) as unknown as Record<string, unknown>,
    };
  });

  return {
    bundle: {
      ...bundle,
      graphs,
    },
    error: null,
  };
}

export function extractGraphFaceId(payload: unknown): string | null {
  const vizij = extractVizijMetadataSection(payload);
  if (!vizij) {
    return null;
  }
  const faceId = (vizij.faceId as string | undefined)?.trim();
  return faceId && faceId.length > 0 ? faceId : null;
}

export type {
  VizijPipelineConfigMap,
  VizijPipelineLinkMap,
  VizijPipelineMetadataV1,
} from "./standardInputRemap";

export function normalizeVizijPipelineConfigMap(
  value: unknown,
): VizijPipelineConfigMap {
  if (!isRecord(value)) {
    return {};
  }
  const next: VizijPipelineConfigMap = {};
  Object.entries(value).forEach(([inputId, config]) => {
    if (!isRecord(config)) {
      return;
    }
    next[inputId] = cloneSerializable(config);
  });
  return next;
}

export function normalizeVizijPipelineLinkMap(
  value: unknown,
): VizijPipelineLinkMap {
  if (!isRecord(value)) {
    return {};
  }
  const next: VizijPipelineLinkMap = {};
  Object.entries(value).forEach(([linkId, config]) => {
    if (!isRecord(config)) {
      return;
    }
    next[linkId] = cloneSerializable(config);
  });
  return next;
}

export function extractVizijPipelineConfigMapFromMetadata(
  pipelineMetadataV1: unknown,
): VizijPipelineConfigMap {
  if (!isRecord(pipelineMetadataV1)) {
    return {};
  }
  return normalizeVizijPipelineConfigMap(pipelineMetadataV1.byInputId);
}

export function extractVizijPipelineLinksMapFromMetadata(
  pipelineMetadataV1: unknown,
): VizijPipelineLinkMap {
  if (!isRecord(pipelineMetadataV1)) {
    return {};
  }
  return normalizeVizijPipelineLinkMap(pipelineMetadataV1.links);
}

export function extractVizijPipelineMetadataV1(
  payload: unknown,
): VizijPipelineMetadataV1 | null {
  const vizij = extractVizijMetadataSection(payload);
  if (!vizij || !isRecord(vizij.pipelineV1)) {
    return null;
  }
  return cloneSerializable(vizij.pipelineV1) as VizijPipelineMetadataV1;
}

export function extractVizijPipelineConfigMap(
  payload: unknown,
): VizijPipelineConfigMap {
  return extractVizijPipelineConfigMapFromMetadata(
    extractVizijPipelineMetadataV1(payload),
  );
}

export function withVizijPipelineMetadataV1(
  payload: unknown,
  pipelineMetadataV1: VizijPipelineMetadataV1 | null | undefined,
): unknown {
  if (!isRecord(payload)) {
    return payload;
  }
  const cloned = cloneSerializable(payload);
  const vizij = ensureVizijMetadataSection(cloned);
  if (pipelineMetadataV1 === undefined) {
    return cloned;
  }
  if (pipelineMetadataV1 === null) {
    delete vizij.pipelineV1;
    return cloned;
  }
  vizij.pipelineV1 = cloneSerializable(pipelineMetadataV1);
  return cloned;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceRigFaceSegments(
  value: string,
  from: string,
  to: string,
): string {
  if (!from || from === to) {
    return value;
  }
  const pattern = new RegExp(`rig/${escapeRegex(from)}(?=/)`, "gi");
  return value.replace(pattern, `rig/${to}`);
}

function remapFaceSegmentsDeep(
  value: unknown,
  from: string,
  to: string,
): unknown {
  if (typeof value === "string") {
    return replaceRigFaceSegments(value, from, to);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => remapFaceSegmentsDeep(entry, from, to));
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      next[key] = remapFaceSegmentsDeep(entry, from, to);
    });
    return next;
  }
  return value;
}

export function remapGraphSpecFace(
  payload: unknown,
  nextFaceId: string,
  options?: { previousFaceId?: string | null },
): unknown {
  if (!payload || typeof payload !== "object") {
    return payload;
  }
  const cloned = cloneSerializable(payload as Record<string, unknown>);
  const vizij = ensureVizijMetadataSection(cloned);
  vizij.faceId = nextFaceId;
  const previous = options?.previousFaceId;
  if (previous && previous !== nextFaceId) {
    return remapFaceSegmentsDeep(cloned, previous, nextFaceId);
  }
  return cloned;
}
