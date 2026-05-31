import {
  createStandardRigInputFromPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";

export interface RuntimeInputConstraint {
  min?: number;
  max?: number;
  defaultValue?: number;
}

export interface RuntimeInputCatalog {
  inputs: StandardRigInput[];
  byId: Map<string, StandardRigInput>;
  byPath: Map<string, StandardRigInput>;
}

export interface BuildRuntimeInputCatalogOptions {
  namespace?: string;
}

export interface RuntimeInputWritePathMapOptions {
  inputConstraints: Record<string, unknown> | null | undefined;
  namespace: string;
  graphSpec?: unknown;
}

export function stripRuntimeNamespacePrefix(
  path: string,
  namespace?: string,
): string {
  const trimmed = path.trim();
  if (!trimmed || !namespace) {
    return trimmed;
  }
  const namespacePrefix = `${namespace}/`;
  if (trimmed.startsWith(namespacePrefix)) {
    return trimmed.slice(namespacePrefix.length);
  }
  const debugPrefix = `debug/${namespacePrefix}`;
  if (trimmed.startsWith(debugPrefix)) {
    return trimmed.slice(debugPrefix.length);
  }
  return trimmed;
}

function normalizeGraphInputPath(path: string): string {
  return path.trim().replace(/^\/+/, "");
}

function runtimePathCandidateScore(path: string): number {
  if (/^rig\/[^/]+\/.+/.test(path)) {
    return 3;
  }
  if (path.startsWith("rig/")) {
    return 2;
  }
  return 1;
}

export function buildRuntimeInputWritePathMap({
  inputConstraints,
  namespace,
  graphSpec,
}: RuntimeInputWritePathMapOptions): Map<string, string> {
  const bestByNormalized = new Map<string, { path: string; score: number }>();
  const registerPath = (rawPath: string, source: "constraints" | "graph") => {
    if (!rawPath || rawPath.trim().length === 0) {
      return;
    }
    const namespacedPath = stripRuntimeNamespacePrefix(rawPath, namespace);
    const candidatePath = normalizeGraphInputPath(namespacedPath);
    if (!candidatePath) {
      return;
    }
    const normalizedInputPath = normalizeStandardRigInputPath(candidatePath);
    if (!normalizedInputPath || normalizedInputPath === "/custom/input") {
      return;
    }
    const score =
      runtimePathCandidateScore(candidatePath) + (source === "graph" ? 2 : 0);
    if (score <= 0) {
      return;
    }
    const existing = bestByNormalized.get(normalizedInputPath);
    if (!existing || score > existing.score) {
      bestByNormalized.set(normalizedInputPath, {
        path: candidatePath,
        score,
      });
    }
  };

  if (inputConstraints) {
    Object.keys(inputConstraints).forEach((rawPath) => {
      registerPath(rawPath, "constraints");
    });
  }

  const specRecord =
    graphSpec && typeof graphSpec === "object"
      ? (graphSpec as {
          nodes?: unknown;
        })
      : null;
  const nodes = Array.isArray(specRecord?.nodes) ? specRecord.nodes : [];
  nodes.forEach((nodeEntry) => {
    const node =
      nodeEntry && typeof nodeEntry === "object"
        ? (nodeEntry as {
            type?: unknown;
            params?: { path?: unknown };
          })
        : null;
    if (!node || node.type !== "input") {
      return;
    }
    const rawPath = node.params?.path;
    if (typeof rawPath !== "string") {
      return;
    }
    registerPath(rawPath, "graph");
  });

  const byNormalized = new Map<string, string>();
  bestByNormalized.forEach((entry, normalizedPath) => {
    byNormalized.set(normalizedPath, entry.path);
  });
  return byNormalized;
}

export function resolveRuntimeInputWritePath({
  inputPath,
  writePathByNormalizedInputPath,
  faceId,
}: {
  inputPath: string;
  writePathByNormalizedInputPath: ReadonlyMap<string, string>;
  faceId: string | null | undefined;
}): string | null {
  const normalizedPath = normalizeStandardRigInputPath(inputPath);
  if (!normalizedPath || normalizedPath === "/custom/input") {
    return null;
  }
  const mappedPath = writePathByNormalizedInputPath.get(normalizedPath);
  if (mappedPath) {
    return mappedPath;
  }
  return faceId
    ? `rig/${faceId}${normalizedPath}`
    : `rig/face${normalizedPath}`;
}

export function buildRuntimeInputCatalogFromConstraints(
  inputConstraints: Record<string, RuntimeInputConstraint> | null | undefined,
  options: BuildRuntimeInputCatalogOptions = {},
): RuntimeInputCatalog {
  if (!inputConstraints) {
    return {
      inputs: [],
      byId: new Map(),
      byPath: new Map(),
    };
  }

  const byId = new Map<string, StandardRigInput>();
  const byPath = new Map<string, StandardRigInput>();

  for (const [fullPath, constraint] of Object.entries(inputConstraints)) {
    if (!fullPath || fullPath.trim().length === 0) {
      continue;
    }

    const canonicalPath = stripRuntimeNamespacePrefix(
      fullPath,
      options.namespace,
    );
    const normalizedPath = normalizeStandardRigInputPath(canonicalPath);
    if (!normalizedPath || normalizedPath === "/custom/input") {
      continue;
    }
    if (byPath.has(normalizedPath)) {
      continue;
    }

    const input = createStandardRigInputFromPath(normalizedPath);
    if (constraint.min !== undefined || constraint.max !== undefined) {
      input.range = {
        min: constraint.min ?? input.range.min,
        max: constraint.max ?? input.range.max,
      };
    }
    if (constraint.defaultValue !== undefined) {
      input.defaultValue = constraint.defaultValue;
    }

    byPath.set(input.path, input);
    byId.set(input.id, input);
  }

  const inputs = Array.from(byId.values()).sort((a, b) => {
    const groupCompare = a.group.localeCompare(b.group);
    if (groupCompare !== 0) {
      return groupCompare;
    }
    return a.label.localeCompare(b.label);
  });

  return {
    inputs,
    byId,
    byPath,
  };
}
