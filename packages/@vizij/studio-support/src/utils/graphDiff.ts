export type GraphDiffCategory =
  | "identifiers"
  | "inputs"
  | "bindings"
  | "expressions"
  | "values"
  | "metadata"
  | "structure"
  | "other";

export type GraphDiffKind = "missing" | "unexpected" | "mismatch";

export type GraphDiffEntityType =
  | "node"
  | "edge"
  | "input"
  | "binding"
  | "expression"
  | "metadata"
  | "other";

export interface GraphDiffContext {
  entityType: GraphDiffEntityType;
  entityId?: string;
  scopePath: string;
  fieldPath: string;
  fieldName: string;
  importedType: string;
  rebuiltType: string;
  connection?: GraphDiffConnectionContext;
}

export interface GraphDiffConnectionEndpoint {
  fromNodeId?: string;
  fromNodeType?: string;
  fromPort?: string;
  toNodeId?: string;
  toNodeType?: string;
  toPort?: string;
}

export interface GraphDiffConnectionContext {
  imported: GraphDiffConnectionEndpoint;
  rebuilt: GraphDiffConnectionEndpoint;
  sameNodePair: boolean;
  slotOnlyChange: boolean;
  commutativeTarget: boolean;
  likelyNormalizationOnly: boolean;
  likelySemanticRisk: boolean;
  guidance: string;
}

export interface GraphDiffEntry {
  id: string;
  path: string;
  kind: GraphDiffKind;
  category: GraphDiffCategory;
  importedValue?: unknown;
  rebuiltValue?: unknown;
  context?: GraphDiffContext;
}

export interface GraphDiffResult {
  entries: GraphDiffEntry[];
  limitReached: boolean;
}

const DEFAULT_DIFF_LIMIT = 200;
const GENERATED_NODE_ID_PREFIXES = [
  "join_",
  "out_",
  "const_",
  "input_",
  "derived_default_",
  "reserved_",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isPrimitive(
  value: unknown,
): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isGeneratedNodeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    GENERATED_NODE_ID_PREFIXES.some((prefix) => value.startsWith(prefix))
  );
}

function isNodeIdDiffPath(path: string): boolean {
  return (
    /\.node_id$/i.test(path) ||
    /\.nodeId$/i.test(path) ||
    (/\.id$/i.test(path) && path.includes("nodes["))
  );
}

export function isBenignGeneratedNodeIdDiff(entry: GraphDiffEntry): boolean {
  if (entry.kind !== "mismatch") {
    return false;
  }
  if (!isNodeIdDiffPath(entry.path)) {
    return false;
  }
  if (entry.context?.entityType === "edge" && entry.context.connection) {
    return (
      entry.context.connection.likelyNormalizationOnly &&
      !entry.context.connection.likelySemanticRisk
    );
  }
  return (
    isGeneratedNodeId(entry.importedValue) &&
    isGeneratedNodeId(entry.rebuiltValue)
  );
}

export function filterBenignGeneratedNodeIdDiffs(diff: GraphDiffResult): {
  filteredDiff: GraphDiffResult;
  ignoredCount: number;
} {
  const filteredEntries = diff.entries.filter(
    (entry) => !isBenignGeneratedNodeIdDiff(entry),
  );
  return {
    filteredDiff: {
      entries: filteredEntries,
      limitReached: diff.limitReached,
    },
    ignoredCount: diff.entries.length - filteredEntries.length,
  };
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
      return nested;
    }
    return Object.fromEntries(
      Object.entries(nested as Record<string, unknown>).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  });
}

function isEdgeLikeEntry(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false;
  }
  const from = value.from;
  const to = value.to;
  return (
    isPlainObject(from) &&
    typeof from.node_id === "string" &&
    isPlainObject(to) &&
    typeof to.node_id === "string"
  );
}

function isOrderInsensitiveArray(value: unknown[]): boolean {
  if (value.length === 0) {
    return false;
  }
  return value.every(
    (entry) =>
      (isPlainObject(entry) && typeof entry.id === "string") ||
      isEdgeLikeEntry(entry),
  );
}

export function canonicalizeGraphComparable(value: unknown): unknown {
  if (isPrimitive(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    const canonicalItems = value.map((entry) =>
      canonicalizeGraphComparable(entry),
    );
    if (isOrderInsensitiveArray(canonicalItems)) {
      return [...canonicalItems].sort((a, b) =>
        stableStringify(a).localeCompare(stableStringify(b)),
      );
    }
    return canonicalItems;
  }

  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .forEach((key) => {
        next[key] = canonicalizeGraphComparable(value[key]);
      });
    return next;
  }

  return value;
}

function rewriteFaceString(
  value: string,
  fromFaceId: string,
  toFaceId: string,
): string {
  if (!value || fromFaceId === toFaceId) {
    return value;
  }
  let rewritten = value;
  rewritten = rewritten.split(`rig/${fromFaceId}/`).join(`rig/${toFaceId}/`);
  rewritten = rewritten.split(`/rig/${fromFaceId}/`).join(`/rig/${toFaceId}/`);
  if (rewritten === fromFaceId) {
    return toFaceId;
  }
  return rewritten;
}

export function rewriteGraphFaceNamespace(
  value: unknown,
  fromFaceId: string,
  toFaceId: string,
): unknown {
  if (fromFaceId === toFaceId) {
    return value;
  }
  if (typeof value === "string") {
    return rewriteFaceString(value, fromFaceId, toFaceId);
  }
  if (isPrimitive(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) =>
      rewriteGraphFaceNamespace(entry, fromFaceId, toFaceId),
    );
  }
  if (isPlainObject(value)) {
    const next: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, nested]) => {
      next[key] = rewriteGraphFaceNamespace(nested, fromFaceId, toFaceId);
    });
    return next;
  }
  return value;
}

function isIdentifiedList(value: unknown): value is Array<{
  id: string;
  [key: string]: unknown;
}> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "string",
    )
  );
}

function categorizePath(path: string): GraphDiffCategory {
  if (/nodes\[\d+\]\.(id|name)/i.test(path)) {
    return "identifiers";
  }
  if (/inputs\[/i.test(path) || /standardInputs/i.test(path)) {
    return "inputs";
  }
  if (/bindings/i.test(path) || /slots/i.test(path)) {
    return "bindings";
  }
  if (/expression/i.test(path)) {
    return "expressions";
  }
  if (/remap|range|min|max|defaultValue/i.test(path)) {
    return "values";
  }
  if (/metadata|vizij|labels?/i.test(path)) {
    return "metadata";
  }
  if (/graph|spec|nodes|edges/i.test(path)) {
    return "structure";
  }
  return "other";
}

const ENTITY_ROOTS: Record<string, GraphDiffEntityType> = {
  nodes: "node",
  edges: "edge",
  inputs: "input",
  standardInputs: "input",
  bindings: "binding",
  inputBindings: "binding",
  slots: "binding",
  expressions: "expression",
  metadata: "metadata",
};

const ROOTS_WITH_ENTITY_IDS = new Set<string>([
  "nodes",
  "edges",
  "inputs",
  "standardInputs",
  "bindings",
  "inputBindings",
  "slots",
  "expressions",
]);

const COMMUTATIVE_NODE_TYPES = new Set<string>([
  "add",
  "multiply",
  "min",
  "max",
  "equal",
  "not_equal",
  "and",
  "or",
  "join",
]);

const NON_COMMUTATIVE_NODE_TYPES = new Set<string>([
  "subtract",
  "divide",
  "modulo",
  "power",
  "case",
]);

function toArrayIndex(token: string): number | null {
  if (!/^\d+$/.test(token)) {
    return null;
  }
  const parsed = Number.parseInt(token, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenizePath(path: string): string[] {
  const tokens: string[] = [];
  const matcher = /([^[.\]]+)|\[([^[\]]+)\]/g;
  let match = matcher.exec(path);
  while (match) {
    const token = (match[1] ?? match[2] ?? "").trim();
    if (token.length > 0) {
      tokens.push(token);
    }
    match = matcher.exec(path);
  }
  return tokens;
}

function getValueAtPath(root: unknown, tokens: readonly string[]): unknown {
  let cursor: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(cursor)) {
      const index = toArrayIndex(token);
      if (index === null) {
        return undefined;
      }
      cursor = cursor[index];
      continue;
    }
    if (isPlainObject(cursor)) {
      cursor = (cursor as Record<string, unknown>)[token];
      continue;
    }
    return undefined;
  }
  return cursor;
}

function getValueAtPathFlexible(
  root: unknown,
  tokens: readonly string[],
): unknown {
  const direct = getValueAtPath(root, tokens);
  if (direct !== undefined) {
    return direct;
  }
  if (tokens.length > 1 && tokens[0] === "spec") {
    const withoutSyntheticRoot = getValueAtPath(root, tokens.slice(1));
    if (withoutSyntheticRoot !== undefined) {
      return withoutSyntheticRoot;
    }
  }
  return direct;
}

function readNodeType(
  root: unknown,
  graphPrefixTokens: readonly string[],
  nodeId: string | undefined,
): string | undefined {
  if (!nodeId) {
    return undefined;
  }
  const rawNodes = getValueAtPathFlexible(root, [
    ...graphPrefixTokens,
    "nodes",
  ]);
  if (!Array.isArray(rawNodes)) {
    return undefined;
  }
  const node = rawNodes.find(
    (candidate) =>
      isPlainObject(candidate) &&
      typeof candidate.id === "string" &&
      candidate.id === nodeId,
  );
  if (!node || !isPlainObject(node) || typeof node.type !== "string") {
    return undefined;
  }
  return node.type;
}

function toConnectionEndpoint(
  edgeValue: unknown,
  root: unknown,
  graphPrefixTokens: readonly string[],
): GraphDiffConnectionEndpoint {
  if (!isPlainObject(edgeValue)) {
    return {};
  }
  const from = isPlainObject(edgeValue.from) ? edgeValue.from : undefined;
  const to = isPlainObject(edgeValue.to) ? edgeValue.to : undefined;
  const fromNodeId =
    typeof from?.node_id === "string" ? from.node_id : undefined;
  const toNodeId = typeof to?.node_id === "string" ? to.node_id : undefined;
  const fromPort = typeof from?.output === "string" ? from.output : undefined;
  const toPort = typeof to?.input === "string" ? to.input : undefined;
  return {
    fromNodeId,
    fromPort,
    fromNodeType: readNodeType(root, graphPrefixTokens, fromNodeId),
    toNodeId,
    toPort,
    toNodeType: readNodeType(root, graphPrefixTokens, toNodeId),
  };
}

function analyzeEdgeConnection(
  imported: GraphDiffConnectionEndpoint,
  rebuilt: GraphDiffConnectionEndpoint,
): GraphDiffConnectionContext {
  const sameNodePair =
    imported.fromNodeId === rebuilt.fromNodeId &&
    imported.toNodeId === rebuilt.toNodeId;
  const slotOnlyChange =
    sameNodePair &&
    imported.fromPort === rebuilt.fromPort &&
    imported.toPort !== rebuilt.toPort;

  const targetType =
    (rebuilt.toNodeType ?? imported.toNodeType)?.toLowerCase() ?? "";
  const commutativeTarget = COMMUTATIVE_NODE_TYPES.has(targetType);
  const nonCommutativeTarget = NON_COMMUTATIVE_NODE_TYPES.has(targetType);
  const likelyNormalizationOnly = slotOnlyChange && commutativeTarget;
  const likelySemanticRisk = slotOnlyChange && !commutativeTarget;

  let guidance =
    "Edge endpoints changed between imported and rebuilt graphs. Verify the data-flow intent.";
  if (likelyNormalizationOnly) {
    guidance =
      "Only the target input slot changed and the target node is commutative. This is often a normalization-only difference.";
  } else if (likelySemanticRisk && nonCommutativeTarget) {
    guidance =
      "Only the target input slot changed on a non-commutative node (e.g. subtract/divide). This can change runtime behavior.";
  } else if (slotOnlyChange) {
    guidance =
      "Only the target input slot changed, but target node commutativity is unknown. Review before accepting rebuilt value.";
  }

  return {
    imported,
    rebuilt,
    sameNodePair,
    slotOnlyChange,
    commutativeTarget,
    likelyNormalizationOnly,
    likelySemanticRisk,
    guidance,
  };
}

function describeValueType(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  const valueType = typeof value;
  if (valueType === "number" && Number.isNaN(value)) {
    return "nan";
  }
  return valueType;
}

function mapCategoryToEntityType(
  category: GraphDiffCategory,
): GraphDiffEntityType {
  if (category === "inputs") {
    return "input";
  }
  if (category === "bindings") {
    return "binding";
  }
  if (category === "expressions") {
    return "expression";
  }
  if (category === "metadata") {
    return "metadata";
  }
  return "other";
}

function deriveDiffContext(
  path: string,
  category: GraphDiffCategory,
  importedValue: unknown,
  rebuiltValue: unknown,
  importedRoot: unknown,
  rebuiltRoot: unknown,
): GraphDiffContext {
  const tokens = tokenizePath(path);
  const normalizedTokens =
    tokens.length > 1 && tokens[0] === "spec" && tokens[1] === "spec"
      ? tokens.slice(1)
      : tokens;
  const rootIndex = normalizedTokens.findIndex(
    (token) => token in ENTITY_ROOTS,
  );

  if (rootIndex >= 0) {
    const rootToken = normalizedTokens[rootIndex];
    const candidateEntityId = normalizedTokens[rootIndex + 1];
    const shouldCaptureEntityId =
      ROOTS_WITH_ENTITY_IDS.has(rootToken) &&
      typeof candidateEntityId === "string" &&
      candidateEntityId.length > 0;
    const fieldTokens = normalizedTokens.slice(
      rootIndex + (shouldCaptureEntityId ? 2 : 1),
    );
    const scopePrefix = normalizedTokens.slice(0, rootIndex + 1).join(".");
    const fieldPath =
      fieldTokens.length > 0 ? fieldTokens.join(".") : "(entry)";
    let connection: GraphDiffConnectionContext | undefined;
    if (rootToken === "edges") {
      const graphPrefixTokens = normalizedTokens.slice(0, rootIndex);
      const scopeTokens = normalizedTokens.slice(
        0,
        rootIndex + (shouldCaptureEntityId ? 2 : 1),
      );
      const importedEdge = getValueAtPathFlexible(importedRoot, scopeTokens);
      const rebuiltEdge = getValueAtPathFlexible(rebuiltRoot, scopeTokens);
      const importedEndpoint = toConnectionEndpoint(
        importedEdge,
        importedRoot,
        graphPrefixTokens,
      );
      const rebuiltEndpoint = toConnectionEndpoint(
        rebuiltEdge,
        rebuiltRoot,
        graphPrefixTokens,
      );
      connection = analyzeEdgeConnection(importedEndpoint, rebuiltEndpoint);
    }

    return {
      entityType: ENTITY_ROOTS[rootToken] ?? mapCategoryToEntityType(category),
      entityId: shouldCaptureEntityId ? candidateEntityId : undefined,
      scopePath: shouldCaptureEntityId
        ? `${scopePrefix}[${candidateEntityId}]`
        : scopePrefix,
      fieldPath,
      fieldName: fieldTokens.at(-1) ?? "(entry)",
      importedType: describeValueType(importedValue),
      rebuiltType: describeValueType(rebuiltValue),
      connection,
    };
  }

  const scopeTokens = normalizedTokens.slice(0, -1);
  return {
    entityType: mapCategoryToEntityType(category),
    scopePath: scopeTokens.length > 0 ? scopeTokens.join(".") : path,
    fieldPath:
      normalizedTokens.length > 1 ? normalizedTokens.slice(1).join(".") : path,
    fieldName: normalizedTokens.at(-1) ?? "(value)",
    importedType: describeValueType(importedValue),
    rebuiltType: describeValueType(rebuiltValue),
  };
}

function createEntry(
  kind: GraphDiffKind,
  path: string,
  importedValue: unknown,
  rebuiltValue: unknown,
  id: string,
  importedRoot: unknown,
  rebuiltRoot: unknown,
): GraphDiffEntry {
  const category = categorizePath(path);
  return {
    id,
    kind,
    path,
    category,
    importedValue,
    rebuiltValue,
    context: deriveDiffContext(
      path,
      category,
      importedValue,
      rebuiltValue,
      importedRoot,
      rebuiltRoot,
    ),
  };
}

interface DiffOptions {
  limit?: number;
}

export function diffGraphSpecs(
  importedSpec: unknown,
  rebuiltSpec: unknown,
  options?: DiffOptions,
): GraphDiffResult {
  const limit = Math.max(options?.limit ?? DEFAULT_DIFF_LIMIT, 1);
  const entries: GraphDiffEntry[] = [];
  let limitReached = false;
  let counter = 0;

  const pushEntry = (
    kind: GraphDiffKind,
    path: string,
    importedValue: unknown,
    rebuiltValue: unknown,
  ): boolean => {
    if (entries.length >= limit) {
      limitReached = true;
      return false;
    }
    counter += 1;
    entries.push(
      createEntry(
        kind,
        path,
        importedValue,
        rebuiltValue,
        `${kind}:${counter}:${path}`,
        importedSpec,
        rebuiltSpec,
      ),
    );
    return entries.length < limit;
  };

  const walk = (
    importedValue: unknown,
    rebuiltValue: unknown,
    path: string,
  ): boolean => {
    if (entries.length >= limit) {
      limitReached = true;
      return false;
    }

    if (Array.isArray(importedValue) && Array.isArray(rebuiltValue)) {
      if (isIdentifiedList(importedValue) && isIdentifiedList(rebuiltValue)) {
        const importedMap = new Map(
          importedValue.map((entry) => [entry.id, entry]),
        );
        const rebuiltMap = new Map(
          rebuiltValue.map((entry) => [entry.id, entry]),
        );
        const ids = new Set<string>([
          ...importedMap.keys(),
          ...rebuiltMap.keys(),
        ]);
        for (const id of ids) {
          const expectedEntry = importedMap.get(id);
          const actualEntry = rebuiltMap.get(id);
          const nextPath = `${path}[${id}]`;
          if (!expectedEntry) {
            if (!pushEntry("unexpected", nextPath, undefined, actualEntry)) {
              return false;
            }
            continue;
          }
          if (!actualEntry) {
            if (!pushEntry("missing", nextPath, expectedEntry, undefined)) {
              return false;
            }
            continue;
          }
          if (!walk(expectedEntry, actualEntry, nextPath)) {
            return false;
          }
        }
        return true;
      }
      const maxLength = Math.max(importedValue.length, rebuiltValue.length);
      for (let index = 0; index < maxLength; index += 1) {
        const nextPath = `${path}[${index}]`;
        const expected = importedValue[index];
        const actual = rebuiltValue[index];
        if (index >= importedValue.length) {
          if (!pushEntry("unexpected", nextPath, undefined, actual)) {
            return false;
          }
          continue;
        }
        if (index >= rebuiltValue.length) {
          if (!pushEntry("missing", nextPath, expected, undefined)) {
            return false;
          }
          continue;
        }
        if (
          Array.isArray(expected) ||
          Array.isArray(actual) ||
          isPlainObject(expected) ||
          isPlainObject(actual)
        ) {
          if (!walk(expected, actual, nextPath)) {
            return false;
          }
        } else if (!Object.is(expected, actual)) {
          if (!pushEntry("mismatch", nextPath, expected, actual)) {
            return false;
          }
        }
      }
      return true;
    }

    const importedIsObject = isPlainObject(importedValue);
    const rebuiltIsObject = isPlainObject(rebuiltValue);
    if (importedIsObject && rebuiltIsObject) {
      const importedKeys = new Set(Object.keys(importedValue));
      const rebuiltKeys = new Set(Object.keys(rebuiltValue));
      for (const key of importedKeys) {
        if (!rebuiltKeys.has(key)) {
          const nextPath = `${path}.${key}`;
          if (
            !pushEntry(
              "missing",
              nextPath,
              (importedValue as Record<string, unknown>)[key],
              undefined,
            )
          ) {
            return false;
          }
        }
      }
      for (const key of rebuiltKeys) {
        if (!importedKeys.has(key)) {
          const nextPath = `${path}.${key}`;
          if (
            !pushEntry(
              "unexpected",
              nextPath,
              undefined,
              (rebuiltValue as Record<string, unknown>)[key],
            )
          ) {
            return false;
          }
        }
      }
      for (const key of importedKeys) {
        if (!rebuiltKeys.has(key)) {
          continue;
        }
        const nextPath = `${path}.${key}`;
        const expected = (importedValue as Record<string, unknown>)[key];
        const actual = (rebuiltValue as Record<string, unknown>)[key];
        const expectedIsComposite =
          Array.isArray(expected) || isPlainObject(expected);
        const actualIsComposite =
          Array.isArray(actual) || isPlainObject(actual);
        if (expectedIsComposite || actualIsComposite) {
          if (!walk(expected, actual, nextPath)) {
            return false;
          }
        } else if (!Object.is(expected, actual)) {
          if (!pushEntry("mismatch", nextPath, expected, actual)) {
            return false;
          }
        }
      }
      return true;
    }

    if (importedValue === undefined && rebuiltValue !== undefined) {
      return pushEntry("unexpected", path, undefined, rebuiltValue);
    }
    if (importedValue !== undefined && rebuiltValue === undefined) {
      return pushEntry("missing", path, importedValue, undefined);
    }
    if (!Object.is(importedValue, rebuiltValue)) {
      return pushEntry("mismatch", path, importedValue, rebuiltValue);
    }
    return true;
  };

  walk(importedSpec, rebuiltSpec, "spec");

  return {
    entries,
    limitReached,
  };
}
