import {
  buildCanonicalBindingExpression,
  type AnimatableBinding,
} from "@vizij/node-graph-authoring";
import { buildRigPipelineV1LinkId, SELF_BINDING_ID } from "@vizij/utils";

type JsonObject = Record<string, unknown>;

interface PipelineV1Metadata {
  links?: Record<string, Record<string, unknown>>;
  parentBlend?: {
    mode?: unknown;
    expression?: unknown;
  };
  directInput?: {
    enabled?: unknown;
  };
  override?: {
    enabled?: unknown;
    value?: unknown;
  };
  clamp?: {
    enabled?: unknown;
  };
  migration?: {
    status?: unknown;
    source?: unknown;
    expression?: unknown;
  };
  legacy?: {
    readOnly?: unknown;
    reason?: unknown;
  };
}

export interface PipelineStageSettings {
  directInputEnabled: boolean;
  overrideEnabled: boolean;
  overrideValue: number;
  clampEnabled: boolean;
}

export interface PipelineDiagnosticsRow {
  parentContribution: number | null;
  poseContribution: number | null;
  directContribution: number | null;
  blendedResult: number;
  overrideSelectedResult: number;
  effectiveResult: number;
}

export interface PoseContributionSample {
  targetValue: number;
  neutralValue: number;
  weight: number;
}

export interface LegacyBindingMigrationAssessment {
  kind: "none" | "convertible" | "non-convertible" | "migrated";
  expression: string;
  canonicalExpression: string;
  reason: string | null;
  parentFactorsByInputId?: Record<string, number>;
}

type MigrationBindingLike = {
  inputId?: string | null;
  slots?: Array<{
    inputId?: string | null;
  }>;
};

type MigrationLinkUpsert = {
  parentInputId: string;
  childInputId: string;
  scale: number;
  offset: number;
  enabled: boolean;
};

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function asPipelineMetadata(value: unknown): PipelineV1Metadata | null {
  const objectValue = asObject(value);
  if (!objectValue) {
    return null;
  }
  return objectValue as PipelineV1Metadata;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeExpression(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function getSlotAlias(
  binding: AnimatableBinding,
  slot: { alias?: string; id?: string },
  index: number,
): string {
  const trimmedAlias = slot.alias?.trim();
  if (trimmedAlias) {
    return trimmedAlias;
  }
  const trimmedId = slot.id?.trim();
  if (trimmedId) {
    return trimmedId;
  }
  return index === 0 ? "s1" : `s${index + 1}`;
}

function hasSelfSource(binding: AnimatableBinding): boolean {
  if (binding.inputId === SELF_BINDING_ID) {
    return true;
  }
  return (binding.slots ?? []).some((slot) => slot.inputId === SELF_BINDING_ID);
}

function normalizeAliasToken(value: string): string {
  return value.trim().toLowerCase();
}

function isAliasToken(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function parsePositiveNumberToken(value: string): number | null {
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatExpressionNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (Object.is(rounded, -0)) {
    return "0";
  }
  return rounded.toString();
}

export function buildDefaultParentVariableFormula(variable: string): string {
  const trimmed = variable.trim();
  const token = trimmed.length > 0 ? trimmed : "P1";
  return `${token} = parent * scale + offset`;
}

export function buildDefaultParentContributionFormula(
  variables: readonly string[],
): string {
  const terms = variables
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return `parentContribution = normalizedAdditive([${terms.join(", ")}], baseline=default)`;
}

function normalizeMigrationInputId(
  rawInputId: string | null | undefined,
  resolveInputId: (inputId: string) => string,
): string | null {
  const trimmedInputId = rawInputId?.trim() ?? "";
  if (!trimmedInputId || trimmedInputId === SELF_BINDING_ID) {
    return null;
  }
  const resolvedInputId = resolveInputId(trimmedInputId);
  if (!resolvedInputId || resolvedInputId === SELF_BINDING_ID) {
    return null;
  }
  return resolvedInputId;
}

export function buildLegacyMigrationLinkUpserts(params: {
  binding: MigrationBindingLike | null | undefined;
  childInputId: string;
  factorsByInputId: Record<string, number>;
  defaultOffset: number;
  resolveInputId: (inputId: string) => string;
}): Record<string, MigrationLinkUpsert> {
  const canonicalFactorsByInputId: Record<string, number> = {};
  Object.entries(params.factorsByInputId).forEach(([rawInputId, factor]) => {
    if (!Number.isFinite(factor)) {
      return;
    }
    const resolvedInputId = normalizeMigrationInputId(
      rawInputId,
      params.resolveInputId,
    );
    if (!resolvedInputId) {
      return;
    }
    canonicalFactorsByInputId[resolvedInputId] =
      (canonicalFactorsByInputId[resolvedInputId] ?? 0) + factor;
  });

  const parentInputIds = new Set<string>();
  const addParentInputCandidate = (rawInputId: string | null | undefined) => {
    const resolvedInputId = normalizeMigrationInputId(
      rawInputId,
      params.resolveInputId,
    );
    if (!resolvedInputId) {
      return;
    }
    parentInputIds.add(resolvedInputId);
  };

  if (
    params.binding?.inputId &&
    params.binding.inputId !== SELF_BINDING_ID &&
    params.binding.inputId.trim().length > 0
  ) {
    addParentInputCandidate(params.binding.inputId);
  }
  (params.binding?.slots ?? []).forEach((slot) => {
    if (
      slot.inputId &&
      slot.inputId !== SELF_BINDING_ID &&
      slot.inputId.trim().length > 0
    ) {
      addParentInputCandidate(slot.inputId);
    }
  });

  const offset = Number.isFinite(params.defaultOffset)
    ? params.defaultOffset
    : 0;
  const upserts: Record<string, MigrationLinkUpsert> = {};
  parentInputIds.forEach((parentInputId) => {
    const linkId = buildRigPipelineV1LinkId(parentInputId, params.childInputId);
    const scale = canonicalFactorsByInputId[parentInputId] ?? 1;
    upserts[linkId] = {
      parentInputId,
      childInputId: params.childInputId,
      scale,
      offset,
      enabled: true,
    };
  });
  return upserts;
}

export function buildParentContributionDisplayExpression(params: {
  baseline: number;
  parents: readonly {
    label: string;
    scale: number;
    offset: number;
    enabled: boolean;
  }[];
}): string {
  const baseline = Number.isFinite(params.baseline) ? params.baseline : 0;
  const enabledParents = params.parents.filter((parent) => parent.enabled);
  if (enabledParents.length === 0) {
    return `parentContribution = baseline(${formatExpressionNumber(baseline)})`;
  }

  const terms = enabledParents.map((parent, index) => {
    const label =
      parent.label.trim().length > 0
        ? parent.label.trim()
        : `parent_${index + 1}`;
    const scale = Number.isFinite(parent.scale) ? parent.scale : 1;
    const offset = Number.isFinite(parent.offset) ? parent.offset : baseline;
    const offsetText =
      offset >= 0
        ? `+ ${formatExpressionNumber(offset)}`
        : `- ${formatExpressionNumber(Math.abs(offset))}`;
    return `(parent("${label.replace(/"/g, '\\"')}") * ${formatExpressionNumber(scale)} ${offsetText})`;
  });

  return `parentContribution = normalizedAdditive([${terms.join(", ")}], baseline=${formatExpressionNumber(baseline)})`;
}

function parseAliasFactorTerm(
  token: string,
): { alias: string; coefficient: number } | null {
  const trimmed = token.trim();
  if (!trimmed) {
    return null;
  }
  const stars = trimmed.split("*");
  if (stars.length === 1) {
    if (!isAliasToken(trimmed)) {
      return null;
    }
    return {
      alias: trimmed,
      coefficient: 1,
    };
  }
  if (stars.length !== 2) {
    return null;
  }
  const left = stars[0]?.trim() ?? "";
  const right = stars[1]?.trim() ?? "";
  if (!left || !right) {
    return null;
  }
  if (isAliasToken(left)) {
    const factor = parsePositiveNumberToken(right);
    if (factor === null) {
      return null;
    }
    return {
      alias: left,
      coefficient: factor,
    };
  }
  if (isAliasToken(right)) {
    const factor = parsePositiveNumberToken(left);
    if (factor === null) {
      return null;
    }
    return {
      alias: right,
      coefficient: factor,
    };
  }
  return null;
}

function parseAliasAdditiveFactors(
  expression: string,
  allowedAliases: Set<string>,
): Map<string, number> | null {
  const compact = expression.replace(/\s+/g, "");
  if (!compact) {
    return null;
  }
  const factors = new Map<string, number>();
  let cursor = 0;
  while (cursor < compact.length) {
    let sign = 1;
    const marker = compact[cursor];
    if (marker === "+" || marker === "-") {
      sign = marker === "-" ? -1 : 1;
      cursor += 1;
    } else if (cursor !== 0) {
      return null;
    }
    let nextCursor = cursor;
    while (
      nextCursor < compact.length &&
      compact[nextCursor] !== "+" &&
      compact[nextCursor] !== "-"
    ) {
      nextCursor += 1;
    }
    const termToken = compact.slice(cursor, nextCursor);
    const parsedTerm = parseAliasFactorTerm(termToken);
    if (!parsedTerm) {
      return null;
    }
    const aliasToken = normalizeAliasToken(parsedTerm.alias);
    if (!allowedAliases.has(aliasToken)) {
      return null;
    }
    factors.set(
      aliasToken,
      (factors.get(aliasToken) ?? 0) + sign * parsedTerm.coefficient,
    );
    cursor = nextCursor;
  }
  return factors.size > 0 ? factors : null;
}

function normalizedAdditive(values: number[], baseline: number): number {
  if (values.length === 0) {
    return baseline;
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum - (values.length - 1) * baseline;
}

function clampToRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return value;
  }
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

function readPipelineMetadata(
  binding: AnimatableBinding | null | undefined,
): PipelineV1Metadata | null {
  const metadata = binding?.metadata;
  const metadataObject = asObject(metadata);
  if (!metadataObject) {
    return null;
  }
  const vizij = asObject(metadataObject.vizij);
  if (!vizij) {
    return null;
  }
  return asPipelineMetadata(vizij.pipelineV1);
}

export function mergePipelineMetadata(
  metadata: JsonObject | undefined,
  patch: {
    directInputEnabled?: boolean;
    overrideEnabled?: boolean;
    overrideValue?: number;
    clampEnabled?: boolean;
    linkUpserts?: Record<
      string,
      {
        parentInputId?: string;
        childInputId?: string;
        scale?: number;
        offset?: number;
        enabled?: boolean;
        expression?: string | null;
      }
    >;
    parentBlendExpression?: string | null;
    migrationStatus?: "migrated";
    migrationSource?: string;
    migrationExpression?: string;
    legacyReadOnly?: boolean;
    legacyReadOnlyReason?: string;
  },
): JsonObject {
  const baseMetadata = asObject(metadata) ?? {};
  const vizij = asObject(baseMetadata.vizij) ?? {};
  const pipeline = asPipelineMetadata(vizij.pipelineV1) ?? {};

  const nextPipeline: PipelineV1Metadata = {
    ...pipeline,
    parentBlend: {
      ...(asObject(pipeline.parentBlend) ?? {}),
      ...(patch.parentBlendExpression !== undefined
        ? patch.parentBlendExpression === null
          ? {}
          : { expression: patch.parentBlendExpression }
        : {}),
    },
    directInput: {
      ...(asObject(pipeline.directInput) ?? {}),
      ...(patch.directInputEnabled !== undefined
        ? { enabled: patch.directInputEnabled }
        : {}),
    },
    override: {
      ...(asObject(pipeline.override) ?? {}),
      ...(patch.overrideEnabled !== undefined
        ? { enabled: patch.overrideEnabled }
        : {}),
      ...(patch.overrideValue !== undefined
        ? { value: patch.overrideValue }
        : {}),
    },
    clamp: {
      ...(asObject(pipeline.clamp) ?? {}),
      ...(patch.clampEnabled !== undefined
        ? { enabled: patch.clampEnabled }
        : {}),
    },
  };

  if (patch.linkUpserts && Object.keys(patch.linkUpserts).length > 0) {
    const existingLinksRaw = asObject(pipeline.links) ?? {};
    const existingLinks: Record<string, Record<string, unknown>> = {};
    Object.entries(existingLinksRaw).forEach(([key, value]) => {
      const normalized = asObject(value);
      if (normalized) {
        existingLinks[key] = normalized;
      }
    });
    const nextLinks: Record<string, Record<string, unknown>> = {
      ...existingLinks,
    };
    Object.entries(patch.linkUpserts).forEach(([key, linkPatch]) => {
      const linkId = key.trim();
      if (!linkId) {
        return;
      }
      const existingLink = existingLinks[linkId] ?? {};
      nextLinks[linkId] = {
        ...existingLink,
        linkId,
        ...(linkPatch.parentInputId
          ? { parentInputId: linkPatch.parentInputId }
          : {}),
        ...(linkPatch.childInputId
          ? { childInputId: linkPatch.childInputId }
          : {}),
        ...(linkPatch.scale !== undefined ? { scale: linkPatch.scale } : {}),
        ...(linkPatch.offset !== undefined ? { offset: linkPatch.offset } : {}),
        ...(linkPatch.enabled !== undefined
          ? { enabled: linkPatch.enabled }
          : {}),
        ...(linkPatch.expression !== undefined
          ? linkPatch.expression === null
            ? {}
            : { expression: linkPatch.expression }
          : {}),
      };
      if (linkPatch.expression === null) {
        delete nextLinks[linkId].expression;
      }
    });
    nextPipeline.links = nextLinks;
  }

  if (patch.parentBlendExpression === null) {
    const existingParentBlend = asObject(nextPipeline.parentBlend);
    if (existingParentBlend) {
      delete existingParentBlend.expression;
      nextPipeline.parentBlend = existingParentBlend;
    }
  }

  if (patch.migrationStatus === "migrated") {
    nextPipeline.migration = {
      ...(asObject(pipeline.migration) ?? {}),
      status: "migrated",
      ...(patch.migrationSource ? { source: patch.migrationSource } : {}),
      ...(patch.migrationExpression
        ? { expression: patch.migrationExpression }
        : {}),
    };
  }

  if (patch.legacyReadOnly !== undefined || patch.legacyReadOnlyReason) {
    nextPipeline.legacy = {
      ...(asObject(pipeline.legacy) ?? {}),
      ...(patch.legacyReadOnly !== undefined
        ? { readOnly: patch.legacyReadOnly }
        : {}),
      ...(patch.legacyReadOnlyReason
        ? { reason: patch.legacyReadOnlyReason }
        : {}),
    };
  }

  return {
    ...baseMetadata,
    vizij: {
      ...vizij,
      pipelineV1: nextPipeline,
    },
  };
}

export function resolvePipelineStageSettings(
  binding: AnimatableBinding | null | undefined,
  options: {
    defaultValue: number;
    fallbackDirectEnabled?: boolean;
  },
): PipelineStageSettings {
  const pipeline = readPipelineMetadata(binding);
  const fallbackDirect =
    options.fallbackDirectEnabled ?? (binding ? hasSelfSource(binding) : true);

  return {
    directInputEnabled: toBoolean(
      pipeline?.directInput?.enabled,
      fallbackDirect,
    ),
    overrideEnabled: toBoolean(pipeline?.override?.enabled, false),
    overrideValue: toFiniteNumber(
      pipeline?.override?.value,
      options.defaultValue,
    ),
    clampEnabled: toBoolean(pipeline?.clamp?.enabled, true),
  };
}

export function assessLegacyBindingMigration(
  binding: AnimatableBinding | null | undefined,
): LegacyBindingMigrationAssessment {
  if (!binding) {
    return {
      kind: "none",
      expression: "",
      canonicalExpression: "",
      reason: null,
    };
  }

  const expression = (binding.expression ?? "").trim();
  const canonicalExpression = buildCanonicalBindingExpression(binding).trim();
  const pipeline = readPipelineMetadata(binding);
  const migrationStatus = pipeline?.migration?.status;
  if (migrationStatus === "migrated") {
    return {
      kind: "migrated",
      expression,
      canonicalExpression,
      reason: null,
    };
  }

  const selfAliases: string[] = [];
  const parentAliases: string[] = [];
  const parentInputIdByAlias = new Map<string, string>();
  (binding.slots ?? []).forEach((slot, index) => {
    const alias = getSlotAlias(binding, slot, index);
    if (slot.inputId === SELF_BINDING_ID) {
      selfAliases.push(alias);
      return;
    }
    if (slot.inputId && slot.inputId.trim().length > 0) {
      parentAliases.push(alias);
      parentInputIdByAlias.set(normalizeAliasToken(alias), slot.inputId);
    }
  });

  if (selfAliases.length === 0 || parentAliases.length === 0) {
    return {
      kind: "none",
      expression,
      canonicalExpression,
      reason: null,
    };
  }

  if (pipeline?.legacy?.readOnly === true) {
    return {
      kind: "non-convertible",
      expression,
      canonicalExpression,
      reason:
        typeof pipeline.legacy.reason === "string"
          ? pipeline.legacy.reason
          : "Legacy expression marked read-only.",
    };
  }

  if (!expression) {
    return {
      kind: "non-convertible",
      expression,
      canonicalExpression,
      reason: "Legacy expression is empty.",
    };
  }

  const expressionNormalized = normalizeExpression(expression);
  const canonicalNormalized = normalizeExpression(canonicalExpression);
  const requiredAliases = [...selfAliases, ...parentAliases];
  const requiredAliasTokens = new Set(
    requiredAliases.map((alias) => normalizeAliasToken(alias)),
  );
  const defaultParentFactorsByInputId = Object.fromEntries(
    Array.from(parentInputIdByAlias.values()).map((parentInputId) => [
      parentInputId,
      1,
    ]),
  );

  if (expressionNormalized === canonicalNormalized) {
    return {
      kind: "convertible",
      expression,
      canonicalExpression,
      reason: null,
      parentFactorsByInputId: defaultParentFactorsByInputId,
    };
  }

  const parsedFactors = parseAliasAdditiveFactors(
    expression,
    requiredAliasTokens,
  );
  if (!parsedFactors) {
    return {
      kind: "non-convertible",
      expression,
      canonicalExpression,
      reason:
        "Expression is not a canonical additive self+parent form. Keep this binding legacy/read-only.",
    };
  }
  if (
    Array.from(requiredAliasTokens).some(
      (aliasToken) => !parsedFactors.has(aliasToken),
    )
  ) {
    return {
      kind: "non-convertible",
      expression,
      canonicalExpression,
      reason:
        "Expression is not a canonical additive self+parent form. Keep this binding legacy/read-only.",
    };
  }
  const hasUnsupportedSelfFactor = selfAliases.some((alias) => {
    const factor = parsedFactors.get(normalizeAliasToken(alias));
    return factor === undefined || !Object.is(factor, 1);
  });
  if (hasUnsupportedSelfFactor) {
    return {
      kind: "non-convertible",
      expression,
      canonicalExpression,
      reason:
        "Legacy migration only supports self with factor 1 in additive forms.",
    };
  }
  const parentFactorsByInputId: Record<string, number> = {};
  parentInputIdByAlias.forEach((parentInputId, aliasToken) => {
    const factor = parsedFactors.get(aliasToken);
    if (factor === undefined) {
      return;
    }
    parentFactorsByInputId[parentInputId] =
      (parentFactorsByInputId[parentInputId] ?? 0) + factor;
  });
  return {
    kind: "convertible",
    expression,
    canonicalExpression,
    reason: null,
    parentFactorsByInputId,
  };

  // unreachable
}

export function computePoseContribution(
  samples: readonly PoseContributionSample[],
  baseline: number,
): number | null {
  let active = 0;
  let accumulated = baseline;
  samples.forEach((sample) => {
    if (
      !Number.isFinite(sample.targetValue) ||
      !Number.isFinite(sample.neutralValue) ||
      !Number.isFinite(sample.weight) ||
      sample.weight <= 0
    ) {
      return;
    }
    active += 1;
    accumulated += (sample.targetValue - sample.neutralValue) * sample.weight;
  });
  return active > 0 ? accumulated : null;
}

export function computePipelineDiagnostics(params: {
  baseline: number;
  min: number;
  max: number;
  parentValues: readonly number[];
  poseContribution: number | null;
  directValue: number;
  directEnabled: boolean;
  overrideEnabled: boolean;
  overrideValue: number;
  clampEnabled: boolean;
}): PipelineDiagnosticsRow {
  const parentContribution =
    params.parentValues.length > 0
      ? normalizedAdditive(
          params.parentValues.filter((value) => Number.isFinite(value)),
          params.baseline,
        )
      : null;
  const directContribution = params.directEnabled ? params.directValue : null;
  const sourceValues: number[] = [];
  if (parentContribution !== null) {
    sourceValues.push(parentContribution);
  }
  if (params.poseContribution !== null) {
    sourceValues.push(params.poseContribution);
  }
  if (directContribution !== null) {
    sourceValues.push(directContribution);
  }
  const blendedResult =
    sourceValues.length > 0
      ? normalizedAdditive(sourceValues, params.baseline)
      : params.baseline;
  const overrideSelectedResult = params.overrideEnabled
    ? params.overrideValue
    : blendedResult;
  const effectiveResult = params.clampEnabled
    ? clampToRange(overrideSelectedResult, params.min, params.max)
    : overrideSelectedResult;

  return {
    parentContribution,
    poseContribution: params.poseContribution,
    directContribution,
    blendedResult,
    overrideSelectedResult,
    effectiveResult,
  };
}

export function buildCompiledPipelineEquation(params: {
  hasParents: boolean;
  hasPoses: boolean;
  directEnabled: boolean;
  clampEnabled: boolean;
}): string {
  const sourceTerms: string[] = [];
  if (params.hasParents) {
    sourceTerms.push("parentContribution");
  }
  if (params.hasPoses) {
    sourceTerms.push("poseContribution");
  }
  if (params.directEnabled) {
    sourceTerms.push("directContribution");
  }
  const blended =
    sourceTerms.length > 0
      ? `blend(${sourceTerms.join(", ")})`
      : "baseline(default)";
  const selected = `if(override.enabled, override.value, ${blended})`;
  if (params.clampEnabled) {
    return `effective = clamp(${selected})`;
  }
  return `effective = ${selected}`;
}

export function formatPipelineValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(3);
}
