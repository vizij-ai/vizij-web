import {
  normalizeStandardRigInputPath,
  resolveStandardRigInputId,
  stripStandardInputPathPrefix,
  type StandardRigInput,
} from "@vizij/utils";

export interface StandardInputResolutionMetrics {
  canonicalResolutionCalls: number;
  canonicalResolutionMisses: number;
}

export interface StandardInputResolutionIndex {
  resolveCanonicalId: (
    inputId: string,
    metrics?: StandardInputResolutionMetrics,
  ) => string;
  resolveUniqueAliasId: (inputId: string) => string | null;
  getEquivalentInputIds: (
    inputId: string,
    metrics?: StandardInputResolutionMetrics,
  ) => readonly string[];
}

function normalizeInputIdentifier(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+/g, "_").toLowerCase();
}

function toComparableInputPath(path: string | null | undefined): string | null {
  const normalized = stripStandardInputPathPrefix(
    normalizeStandardRigInputPath(path ?? ""),
  );
  if (!normalized || normalized === "/custom/input") {
    return null;
  }
  return normalized;
}

function pushUnique(
  map: Map<string, string[]>,
  key: string,
  inputId: string,
): void {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, [inputId]);
    return;
  }
  if (!existing.includes(inputId)) {
    existing.push(inputId);
  }
}

const standardInputResolutionIndexCache = new WeakMap<
  Map<string, StandardRigInput>,
  StandardInputResolutionIndex
>();
const standardInputArrayAliasLookupCache = new WeakMap<
  readonly StandardRigInput[],
  Map<string, string[]>
>();

export function getStandardInputResolutionIndex(
  standardInputsById: Map<string, StandardRigInput>,
): StandardInputResolutionIndex {
  const cached = standardInputResolutionIndexCache.get(standardInputsById);
  if (cached) {
    return cached;
  }

  const idsByNormalizedIdentifier = new Map<string, string[]>();
  const idsByComparablePath = new Map<string, string[]>();
  standardInputsById.forEach((input, inputId) => {
    pushUnique(
      idsByNormalizedIdentifier,
      normalizeInputIdentifier(inputId),
      inputId,
    );
    pushUnique(
      idsByNormalizedIdentifier,
      normalizeInputIdentifier(input.path),
      inputId,
    );
    const comparablePath = toComparableInputPath(input.path);
    if (comparablePath) {
      pushUnique(idsByComparablePath, comparablePath, inputId);
    }
  });

  const canonicalIdCache = new Map<string, string>();
  const index: StandardInputResolutionIndex = {
    resolveCanonicalId: (inputId, metrics) => {
      const trimmed = inputId.trim();
      if (!trimmed) {
        return inputId;
      }
      if (metrics) {
        metrics.canonicalResolutionCalls += 1;
      }
      const cachedId = canonicalIdCache.get(trimmed);
      if (cachedId) {
        return cachedId;
      }
      if (metrics) {
        metrics.canonicalResolutionMisses += 1;
      }
      const resolved = resolveStandardRigInputId(trimmed, standardInputsById);
      canonicalIdCache.set(trimmed, resolved);
      return resolved;
    },
    resolveUniqueAliasId: (inputId) => {
      const normalized = normalizeInputIdentifier(inputId);
      if (!normalized) {
        return null;
      }
      const matches = idsByNormalizedIdentifier.get(normalized) ?? [];
      return matches.length === 1 ? (matches[0] ?? null) : null;
    },
    getEquivalentInputIds: (inputId, metrics) => {
      const resolvedInputId = index.resolveCanonicalId(inputId, metrics);
      const input = standardInputsById.get(resolvedInputId);
      if (!input) {
        return [resolvedInputId];
      }
      const comparablePath = toComparableInputPath(input.path);
      if (!comparablePath) {
        return [resolvedInputId];
      }
      const matches = idsByComparablePath.get(comparablePath);
      if (!matches || matches.length === 0) {
        return [resolvedInputId];
      }
      return [
        resolvedInputId,
        ...matches.filter((candidateId) => candidateId !== resolvedInputId),
      ];
    },
  };

  standardInputResolutionIndexCache.set(standardInputsById, index);
  return index;
}

export function resolveUniqueAliasIdFromStandardInputs(
  inputId: string,
  standardInputs: readonly StandardRigInput[],
): string | null {
  const normalized = normalizeInputIdentifier(inputId);
  if (!normalized) {
    return null;
  }

  let lookup = standardInputArrayAliasLookupCache.get(standardInputs);
  if (!lookup) {
    lookup = new Map<string, string[]>();
    standardInputs.forEach((input) => {
      pushUnique(lookup, normalizeInputIdentifier(input.id), input.id);
      pushUnique(lookup, normalizeInputIdentifier(input.path), input.id);
    });
    standardInputArrayAliasLookupCache.set(standardInputs, lookup);
  }

  const matches = lookup.get(normalized) ?? [];
  return matches.length === 1 ? (matches[0] ?? null) : null;
}
