import {
  buildCanonicalBindingExpression,
  type AnimatableBinding,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID } from "@vizij/utils";

type JsonObject = Record<string, unknown>;

interface PipelineV1Metadata {
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
}

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

function isSimpleAliasAdditiveExpression(
  expression: string,
  requiredAliases: string[],
): boolean {
  const trimmed = expression.trim();
  if (!trimmed) {
    return false;
  }
  if (!/^[A-Za-z0-9_+\s]+$/.test(trimmed)) {
    return false;
  }
  const normalizedRequired = new Set(
    requiredAliases.map((alias) => normalizeAliasToken(alias)),
  );
  if (normalizedRequired.size === 0) {
    return false;
  }
  const tokens = trimmed
    .split("+")
    .map((token) => normalizeAliasToken(token))
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return false;
  }
  const seen = new Set<string>();
  for (const token of tokens) {
    if (!normalizedRequired.has(token)) {
      return false;
    }
    seen.add(token);
  }
  return Array.from(normalizedRequired).every((alias) => seen.has(alias));
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
  (binding.slots ?? []).forEach((slot, index) => {
    const alias = getSlotAlias(binding, slot, index);
    if (slot.inputId === SELF_BINDING_ID) {
      selfAliases.push(alias);
      return;
    }
    if (slot.inputId && slot.inputId.trim().length > 0) {
      parentAliases.push(alias);
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

  if (
    expressionNormalized === canonicalNormalized ||
    isSimpleAliasAdditiveExpression(expression, requiredAliases)
  ) {
    return {
      kind: "convertible",
      expression,
      canonicalExpression,
      reason: null,
    };
  }

  return {
    kind: "non-convertible",
    expression,
    canonicalExpression,
    reason:
      "Expression is not a canonical additive self+parent form. Keep this binding legacy/read-only.",
  };
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
