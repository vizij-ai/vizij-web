import type { NodeType } from "@vizij/node-graph-wasm";
import { findNodeSignature } from "@vizij/node-graph-wasm/metadata";
import type { RemapSettings, RigBindingMetadata } from "@vizij/utils";

import type { BuildGraphResult, GraphBindingSummary } from "../graphBuilder";
import type {
  IrBindingSummary,
  IrConstant,
  IrEdge,
  IrGraph,
  IrGraphMetadata,
  IrGraphSummary,
  IrIssue,
  IrNode,
} from "./types";

export const MACHINE_REPORT_VERSION = 1;

export interface MachineReport {
  reportVersion: number;
  faceId: string;
  summary: MachineSummary;
  issues: MachineIssues;
  irGraph?: NormalizedIrGraph;
}

export interface MachineSummary {
  faceId: string;
  inputs: string[];
  outputs: string[];
  bindings: MachineBindingSummary[];
}

export interface MachineBindingSummary {
  targetId: string;
  animatableId: string;
  component?: string;
  slotId: string;
  slotAlias: string;
  inputId: string | null;
  remap: RemapSettings;
  expression: string;
  valueType: "scalar" | "vector";
  nodeId: string;
  expressionNodeId: string;
  issues?: string[];
  metadata?: RigBindingMetadata;
}

export interface MachineIssues {
  fatal: string[];
  byTarget: Record<string, string[]>;
}

export interface NormalizedIrGraph {
  id: string;
  faceId: string;
  nodes: NormalizedIrNode[];
  edges: NormalizedIrEdge[];
  constants: NormalizedIrConstant[];
  issues: NormalizedIrIssue[];
  summary: NormalizedIrGraphSummary;
  metadata: NormalizedIrGraphMetadata;
}

export interface NormalizedIrNode extends IrNode {
  annotations?: NodeInspectionAnnotations;
}

export type NormalizedIrEdge = IrEdge;

export type NormalizedIrConstant = IrConstant;

export type NormalizedIrIssue = IrIssue & { tags?: string[] };

export interface NormalizedIrGraphSummary extends IrGraphSummary {
  bindings: NormalizedIrBindingSummary[];
}

export type NormalizedIrBindingSummary = IrBindingSummary & {
  issues?: string[];
};

export interface NormalizedIrGraphMetadata {
  source: string;
  registryVersion?: string;
  annotations?: Record<string, unknown>;
}

export interface NodeInspectionAnnotations {
  registry?: NormalizedRegistrySignature;
}

export interface NormalizedRegistrySignature {
  typeId: NodeType;
  name: string;
  category: string;
  doc?: string;
  inputs: NormalizedRegistryPortSpec[];
  variadicInputs?: NormalizedRegistryVariadicSpec;
  outputs: NormalizedRegistryPortSpec[];
  variadicOutputs?: NormalizedRegistryVariadicSpec;
  params: NormalizedRegistryParamSpec[];
}

export interface NormalizedRegistryPortSpec {
  id: string;
  label: string;
  doc?: string;
  optional?: boolean;
  type: string;
}

export interface NormalizedRegistryVariadicSpec {
  id: string;
  label: string;
  doc?: string;
  type: string;
  min: number;
  max?: number;
}

export interface NormalizedRegistryParamSpec {
  id: string;
  label: string;
  doc?: string;
  type: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
}

interface RegistryPortSpec {
  id: string;
  label: string;
  doc?: string;
  optional?: boolean;
  ty?: string;
}

interface RegistryVariadicSpec {
  id: string;
  label: string;
  doc?: string;
  ty?: string;
  min: number;
  max?: number;
}

interface RegistryParamSpec {
  id: string;
  label: string;
  doc?: string;
  ty?: string;
  default_json?: unknown;
  min?: number;
  max?: number;
}

interface RegistrySignature {
  type_id: NodeType;
  name: string;
  category: string;
  doc?: string;
  inputs: RegistryPortSpec[];
  variadic_inputs?: RegistryVariadicSpec;
  outputs: RegistryPortSpec[];
  variadic_outputs?: RegistryVariadicSpec;
  params: RegistryParamSpec[];
}

export type DiffKind = "mismatch" | "missing" | "unexpected";

export interface MachineDiffEntry {
  kind: DiffKind;
  path: string;
  actual?: unknown;
  expected?: unknown;
}

export interface MachineDiffResult {
  equal: boolean;
  differences: MachineDiffEntry[];
  limitReached: boolean;
}

export interface MachineDiffOptions {
  limit?: number;
}

const REMAP_KEYS: (keyof RemapSettings)[] = [
  "inLow",
  "inAnchor",
  "inHigh",
  "outLow",
  "outAnchor",
  "outHigh",
];

const DEFAULT_DIFF_LIMIT = 50;

export function buildMachineReport(result: BuildGraphResult): MachineReport {
  return {
    reportVersion: MACHINE_REPORT_VERSION,
    faceId: result.summary.faceId,
    summary: normalizeSummary(result.summary),
    issues: normalizeIssues(result.issues),
    irGraph: result.ir?.graph ? normalizeIrGraph(result.ir.graph) : undefined,
  };
}

export function diffMachineReports(
  actual: MachineReport,
  expected: MachineReport,
  options?: MachineDiffOptions,
): MachineDiffResult {
  const limit = normalizeDiffLimit(options?.limit);
  const ctx: {
    differences: MachineDiffEntry[];
    limit: number;
    limitReached: boolean;
  } = {
    differences: [],
    limit,
    limitReached: false,
  };
  diffValues(actual, expected, "$", ctx);
  return {
    equal: ctx.differences.length === 0,
    differences: ctx.differences,
    limitReached: ctx.limitReached,
  };
}

function normalizeSummary(
  summary: BuildGraphResult["summary"],
): MachineSummary {
  return {
    faceId: summary.faceId,
    inputs: [...summary.inputs].sort(),
    outputs: [...summary.outputs].sort(),
    bindings: normalizeGraphBindingSummaries(summary.bindings),
  };
}

function normalizeGraphBindingSummaries(
  bindings: GraphBindingSummary[],
): MachineBindingSummary[] {
  const normalized = bindings.map((binding) => ({
    targetId: binding.targetId,
    animatableId: binding.animatableId,
    component: binding.component ?? undefined,
    slotId: binding.slotId,
    slotAlias: binding.slotAlias,
    inputId: binding.inputId ?? null,
    remap: normalizeRemap(binding.remap),
    expression: binding.expression,
    valueType: binding.valueType,
    nodeId: binding.nodeId,
    expressionNodeId: binding.expressionNodeId,
    issues: normalizeStringArray(binding.issues),
    metadata: cloneBindingMetadata(binding.metadata),
  }));
  normalized.sort((a, b) => bindingSortKey(a).localeCompare(bindingSortKey(b)));
  return normalized;
}

function cloneBindingMetadata(
  metadata: RigBindingMetadata | undefined,
): RigBindingMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(metadata)) as RigBindingMetadata;
}

function normalizeIssues(issues: BuildGraphResult["issues"]): MachineIssues {
  const byTargetEntries = Object.entries(issues.byTarget ?? {}).map(
    ([targetId, messages]) => [targetId, [...messages].sort()] as const,
  );
  byTargetEntries.sort(([a], [b]) => a.localeCompare(b));
  const byTarget: Record<string, string[]> = {};
  byTargetEntries.forEach(([targetId, messages]) => {
    byTarget[targetId] = messages;
  });
  return {
    fatal: [...issues.fatal].sort(),
    byTarget,
  };
}

function normalizeIrGraph(graph: IrGraph): NormalizedIrGraph {
  return {
    id: graph.id,
    faceId: graph.faceId,
    nodes: normalizeIrNodes(graph.nodes),
    edges: normalizeIrEdges(graph.edges),
    constants: normalizeIrConstants(graph.constants),
    issues: normalizeIrIssues(graph.issues),
    summary: normalizeIrGraphSummary(graph.summary),
    metadata: normalizeIrMetadata(graph.metadata),
  };
}

function normalizeIrNodes(nodes: IrNode[]): NormalizedIrNode[] {
  return [...nodes]
    .map((node) => ({
      ...node,
      inputDefaults: node.inputDefaults
        ? sortPlainObject(node.inputDefaults)
        : undefined,
      params: node.params ? sortPlainObject(node.params) : undefined,
      metadata: node.metadata ? sortPlainObject(node.metadata) : undefined,
      annotations: buildNodeAnnotations(node),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeIrEdges(edges: IrEdge[]): NormalizedIrEdge[] {
  return [...edges]
    .map((edge) => ({
      ...edge,
      from: normalizePortRef(edge.from),
      to: normalizePortRef(edge.to),
      metadata: edge.metadata ? sortPlainObject(edge.metadata) : undefined,
    }))
    .sort((a, b) => edgeSortKey(a).localeCompare(edgeSortKey(b)));
}

function normalizePortRef(edgeRef: IrEdge["from"]): IrEdge["from"] {
  return {
    nodeId: edgeRef.nodeId,
    portId: edgeRef.portId ?? undefined,
    component: edgeRef.component ?? undefined,
  };
}

function edgeSortKey(edge: IrEdge): string {
  if (edge.id) {
    return edge.id;
  }
  const fromPort = edge.from.portId ?? "";
  const toPort = edge.to.portId ?? "";
  return `${edge.from.nodeId}:${fromPort}->${edge.to.nodeId}:${toPort}`;
}

function normalizeIrConstants(constants: IrConstant[]): NormalizedIrConstant[] {
  return [...constants]
    .map((constant) => ({
      ...constant,
      metadata: constant.metadata
        ? sortPlainObject(constant.metadata)
        : undefined,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeIrIssues(issues: IrIssue[]): NormalizedIrIssue[] {
  return [...issues]
    .map((issue) => ({
      ...issue,
      tags: normalizeStringArray(issue.tags),
      details: issue.details ? sortPlainObject(issue.details) : undefined,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeIrGraphSummary(
  summary: IrGraphSummary,
): NormalizedIrGraphSummary {
  return {
    faceId: summary.faceId,
    inputs: [...summary.inputs].sort(),
    outputs: [...summary.outputs].sort(),
    bindings: normalizeIrBindingSummaries(summary.bindings),
  };
}

function normalizeIrBindingSummaries(
  bindings: IrBindingSummary[],
): NormalizedIrBindingSummary[] {
  const normalized = bindings.map((binding) => ({
    ...binding,
    remap: sortPlainObject(binding.remap),
    issues: normalizeStringArray(binding.issues),
  }));
  normalized.sort((a, b) => bindingSortKey(a).localeCompare(bindingSortKey(b)));
  return normalized;
}

function normalizeIrMetadata(
  metadata: IrGraphMetadata,
): NormalizedIrGraphMetadata {
  const normalized: NormalizedIrGraphMetadata = {
    source: metadata.source ?? "unknown",
  };
  if (metadata.registryVersion) {
    normalized.registryVersion = metadata.registryVersion;
  }
  if (metadata.annotations) {
    const sorted = sortPlainObject(metadata.annotations);
    if (Object.keys(sorted).length > 0) {
      normalized.annotations = sorted;
    }
  }
  return normalized;
}

function buildNodeAnnotations(
  node: IrNode,
): NodeInspectionAnnotations | undefined {
  const signature = findRegistrySignature(node.type);
  if (!signature) {
    return undefined;
  }
  return {
    registry: normalizeRegistrySignature(signature),
  };
}

function findRegistrySignature(typeId: string): RegistrySignature | undefined {
  try {
    const signature = findNodeSignature(typeId);
    if (!signature) {
      return undefined;
    }
    return signature as RegistrySignature;
  } catch {
    return undefined;
  }
}

function normalizeRegistrySignature(
  signature: RegistrySignature,
): NormalizedRegistrySignature {
  return {
    typeId: signature.type_id,
    name: signature.name,
    category: signature.category,
    doc: signature.doc,
    inputs: signature.inputs.map(normalizeRegistryPortSpec),
    variadicInputs: signature.variadic_inputs
      ? normalizeRegistryVariadicSpec(signature.variadic_inputs)
      : undefined,
    outputs: signature.outputs.map(normalizeRegistryPortSpec),
    variadicOutputs: signature.variadic_outputs
      ? normalizeRegistryVariadicSpec(signature.variadic_outputs)
      : undefined,
    params: signature.params.map(normalizeRegistryParamSpec),
  };
}

function normalizeRegistryPortSpec(
  port: RegistryPortSpec,
): NormalizedRegistryPortSpec {
  const normalized: NormalizedRegistryPortSpec = {
    id: port.id,
    label: port.label,
    type: port.ty ?? "unknown",
  };
  if (port.doc) {
    normalized.doc = port.doc;
  }
  if (port.optional) {
    normalized.optional = true;
  }
  return normalized;
}

function normalizeRegistryVariadicSpec(
  spec: RegistryVariadicSpec,
): NormalizedRegistryVariadicSpec {
  const normalized: NormalizedRegistryVariadicSpec = {
    id: spec.id,
    label: spec.label,
    type: spec.ty ?? "unknown",
    min: spec.min,
  };
  if (spec.doc) {
    normalized.doc = spec.doc;
  }
  if (typeof spec.max === "number") {
    normalized.max = spec.max;
  }
  return normalized;
}

function normalizeRegistryParamSpec(
  param: RegistryParamSpec,
): NormalizedRegistryParamSpec {
  const normalized: NormalizedRegistryParamSpec = {
    id: param.id,
    label: param.label,
    type: param.ty ?? "unknown",
  };
  if (param.doc) {
    normalized.doc = param.doc;
  }
  if (param.default_json !== undefined) {
    normalized.defaultValue = normalizePlainValue(param.default_json);
  }
  if (typeof param.min === "number") {
    normalized.min = param.min;
  }
  if (typeof param.max === "number") {
    normalized.max = param.max;
  }
  return normalized;
}

function normalizeRemap(remap: RemapSettings): RemapSettings {
  const normalized = {} as RemapSettings;
  REMAP_KEYS.forEach((key) => {
    normalized[key] = remap[key];
  });
  return normalized;
}

function normalizeStringArray(values?: string[]): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const unique = Array.from(new Set(values));
  unique.sort();
  return unique;
}

function bindingSortKey(binding: {
  targetId: string;
  slotId: string;
  slotAlias: string;
  component?: string;
  animatableId: string;
}): string {
  const component = binding.component ?? "";
  return `${binding.targetId}::${component}::${binding.slotId}::${binding.slotAlias}::${binding.animatableId}`;
}

function sortPlainObject(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  Object.keys(record)
    .sort()
    .forEach((key) => {
      sorted[key] = normalizePlainValue(record[key]);
    });
  return sorted;
}

function normalizePlainValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePlainValue(entry));
  }
  if (isPlainObject(value)) {
    return sortPlainObject(value as Record<string, unknown>);
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValues(
  actual: unknown,
  expected: unknown,
  path: string,
  ctx: {
    differences: MachineDiffEntry[];
    limit: number;
    limitReached: boolean;
  },
): void {
  if (ctx.differences.length >= ctx.limit) {
    ctx.limitReached = true;
    return;
  }
  if (Object.is(actual, expected)) {
    return;
  }
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const compareLength = Math.min(actual.length, expected.length);
    for (let index = 0; index < compareLength; index += 1) {
      diffValues(actual[index], expected[index], pathIndex(path, index), ctx);
      if (ctx.differences.length >= ctx.limit) {
        ctx.limitReached = true;
        return;
      }
    }
    if (actual.length > expected.length) {
      for (let index = compareLength; index < actual.length; index += 1) {
        pushDifference(ctx, {
          kind: "unexpected",
          path: pathIndex(path, index),
          actual: actual[index],
        });
        if (ctx.differences.length >= ctx.limit) {
          ctx.limitReached = true;
          return;
        }
      }
    } else if (expected.length > actual.length) {
      for (let index = compareLength; index < expected.length; index += 1) {
        pushDifference(ctx, {
          kind: "missing",
          path: pathIndex(path, index),
          expected: expected[index],
        });
        if (ctx.differences.length >= ctx.limit) {
          ctx.limitReached = true;
          return;
        }
      }
    }
    return;
  }
  if (isPlainObject(actual) && isPlainObject(expected)) {
    const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
    const sortedKeys = Array.from(keys).sort();
    for (const key of sortedKeys) {
      if (!(key in actual)) {
        pushDifference(ctx, {
          kind: "missing",
          path: pathKey(path, key),
          expected: expected[key],
        });
      } else if (!(key in expected)) {
        pushDifference(ctx, {
          kind: "unexpected",
          path: pathKey(path, key),
          actual: actual[key],
        });
      } else {
        diffValues(actual[key], expected[key], pathKey(path, key), ctx);
      }
      if (ctx.differences.length >= ctx.limit) {
        ctx.limitReached = true;
        return;
      }
    }
    return;
  }
  pushDifference(ctx, {
    kind: "mismatch",
    path,
    actual,
    expected,
  });
}

function pathKey(base: string, key: string): string {
  if (base === "") {
    return key;
  }
  if (base.endsWith("]")) {
    return `${base}.${key}`;
  }
  return `${base}.${key}`;
}

function pathIndex(base: string, index: number): string {
  return `${base}[${index}]`;
}

function pushDifference(
  ctx: {
    differences: MachineDiffEntry[];
    limit: number;
    limitReached: boolean;
  },
  entry: MachineDiffEntry,
): void {
  if (ctx.differences.length < ctx.limit) {
    ctx.differences.push(entry);
    if (ctx.differences.length === ctx.limit) {
      ctx.limitReached = true;
    }
  } else {
    ctx.limitReached = true;
  }
}

function normalizeDiffLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_DIFF_LIMIT;
  }
  return Math.floor(limit);
}
