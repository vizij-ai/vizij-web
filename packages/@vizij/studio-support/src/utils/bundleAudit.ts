import type { VizijBundleExtension } from "@vizij/render";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";
import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import { cloneDeepSafe } from "@vizij/utils";
import type { GraphDiffResult } from "./graphDiff";
import { diffGraphSpecs } from "./graphDiff";

export type BundleGraphAuditStatus = "match" | "diff" | "missing-ir" | "error";

export interface BundleGraphAuditEntry {
  id: string;
  label?: string;
  kind: string;
  faceId: string | null;
  status: BundleGraphAuditStatus;
  diff?: GraphDiffResult;
  diffCount: number;
  diffLimitReached: boolean;
  issues: string[];
  error?: string;
  compiledSpec?: GraphSpec;
  outputs: BundleGraphOutputAudit[];
}

export interface BundleGraphOutputAudit {
  nodeId: string;
  path: string | null;
  status: "ok" | "missing-target";
}

interface BundleAuditOptions {
  validOutputTargets?: Set<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneSerializable<T>(value: T): T {
  return cloneDeepSafe(value);
}

function extractVizijMetadataSection(
  payload: unknown,
): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const metadata = payload.metadata;
  if (!isRecord(metadata)) {
    return null;
  }
  const vizij = metadata.vizij;
  if (!isRecord(vizij)) {
    return null;
  }
  return cloneSerializable(vizij);
}

function extractGraphFaceId(payload: unknown): string | null {
  const vizij = extractVizijMetadataSection(payload);
  if (!vizij) {
    return null;
  }
  const faceId = typeof vizij.faceId === "string" ? vizij.faceId.trim() : "";
  return faceId.length > 0 ? faceId : null;
}

function normalizeGraphPath(path: string | null | undefined): string | null {
  if (!path) {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase();
}

function normalizeMaybeSpec(
  spec?: Record<string, unknown>,
): Promise<GraphSpec> {
  const payload = (spec ?? {}) as GraphSpec;
  return normalizeGraphSpec(payload);
}

export async function auditBundleGraphs(
  bundle: VizijBundleExtension | null,
  options: BundleAuditOptions = {},
): Promise<BundleGraphAuditEntry[]> {
  if (!bundle?.graphs?.length) {
    return [];
  }

  const audits: BundleGraphAuditEntry[] = [];
  for (const entry of bundle.graphs) {
    const faceId = extractGraphFaceId(entry.spec) ?? null;
    if (!entry.ir) {
      audits.push({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        faceId,
        status: "missing-ir",
        diff: undefined,
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      });
      continue;
    }

    try {
      const normalizedSpec = await normalizeMaybeSpec(entry.spec);
      const irPayload = cloneSerializable(entry.ir) as unknown as IrGraph;
      const compiled = compileIrGraph(irPayload, {
        preferLegacySpec: false,
      });
      const normalizedCompiled = await normalizeGraphSpec(
        cloneSerializable(compiled.spec) as GraphSpec,
      );
      const diff = diffGraphSpecs(normalizedCompiled, normalizedSpec, {
        limit: 400,
      });
      const issueMessages = compiled.issues.map(
        (issue) => issue.message ?? issue.id,
      );
      const outputs = collectOutputCoverage(
        normalizedCompiled,
        options.validOutputTargets,
      );
      audits.push({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        faceId,
        status: diff.entries.length === 0 ? "match" : "diff",
        diff,
        diffCount: diff.entries.length,
        diffLimitReached: diff.limitReached,
        issues: issueMessages,
        compiledSpec: normalizedCompiled,
        outputs,
      });
    } catch (error) {
      audits.push({
        id: entry.id,
        label: entry.label,
        kind: entry.kind,
        faceId,
        status: "error",
        diff: undefined,
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        error: error instanceof Error ? error.message : String(error),
        outputs: [],
      });
    }
  }

  return audits;
}

function collectOutputCoverage(
  spec: GraphSpec,
  validTargets?: Set<string>,
): BundleGraphOutputAudit[] {
  type NodeSpecEntry = NonNullable<GraphSpec["nodes"]>[number];
  const nodes = (spec.nodes ?? []) as NodeSpecEntry[];
  return nodes
    .filter((node) => node.type === "output")
    .map((node) => {
      const params = node.params as { path?: string } | undefined;
      const path = typeof params?.path === "string" ? params.path : null;
      let status: BundleGraphOutputAudit["status"] = "ok";
      if (path && validTargets && validTargets.size > 0) {
        const normalized = normalizeGraphPath(path);
        if (!normalized || !validTargets.has(normalized)) {
          status = "missing-target";
        }
      }
      return {
        nodeId: node.id,
        path,
        status,
      };
    });
}
