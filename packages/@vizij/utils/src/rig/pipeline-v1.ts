import type { StandardRigInput } from "./standard-inputs";

export const RIG_PIPELINE_V1_VERSION = 1 as const;

export type RigPipelineV1BlendMode = "normalized-additive";

export type RigPipelineV1SourceFallbackMode = "use-baseline";

export interface RigPipelineV1ParentEntry {
  linkId?: string;
  inputId: string;
  alias?: string;
  scale?: number;
  offset?: number;
  enabled?: boolean;
}

export interface RigPipelineV1ChildEntry {
  linkId: string;
  childInputId: string;
}

export interface RigPipelineV1ParentBlendConfig {
  mode?: RigPipelineV1BlendMode;
  weights?: Record<string, number>;
}

export interface RigPipelineV1PoseSourceConfig {
  targetIds?: string[];
}

export interface RigPipelineV1DirectInputConfig {
  enabled?: boolean;
  valuePath?: string;
}

export interface RigPipelineV1SourceBlendConfig {
  mode?: RigPipelineV1BlendMode;
}

export interface RigPipelineV1SourceFallbackConfig {
  whenNoSources?: RigPipelineV1SourceFallbackMode;
}

export interface RigPipelineV1ClampConfig {
  enabled?: boolean;
}

export interface RigPipelineV1OverrideConfig {
  enabledDefault?: boolean;
  valueDefault?: number;
  enabledPath?: string;
  valuePath?: string;
}

export interface RigPipelineV1InputConfig {
  inputId: string;
  parents?: RigPipelineV1ParentEntry[];
  children?: RigPipelineV1ChildEntry[];
  parentBlend?: RigPipelineV1ParentBlendConfig;
  poseSource?: RigPipelineV1PoseSourceConfig;
  directInput?: RigPipelineV1DirectInputConfig;
  sourceBlend?: RigPipelineV1SourceBlendConfig;
  sourceFallback?: RigPipelineV1SourceFallbackConfig;
  clamp?: RigPipelineV1ClampConfig;
  override?: RigPipelineV1OverrideConfig;
}

export interface RigPipelineV1LinkConfig {
  linkId: string;
  parentInputId: string;
  childInputId: string;
  scale?: number;
  offset?: number;
  enabled?: boolean;
}

export interface RigPipelineV1Metadata {
  version?: number | `${number}`;
  byInputId?: Record<string, RigPipelineV1InputConfig>;
  links?: Record<string, RigPipelineV1LinkConfig>;
}

export interface RigPipelineV1ResolvedParentEntry {
  linkId: string;
  inputId: string;
  alias: string;
  scale: number;
  offset: number;
  enabled: boolean;
}

export interface RigPipelineV1ResolvedChildEntry {
  linkId: string;
  childInputId: string;
}

export interface RigPipelineV1ResolvedInputConfig {
  inputId: string;
  staged: boolean;
  parents: RigPipelineV1ResolvedParentEntry[];
  children: RigPipelineV1ResolvedChildEntry[];
  parentBlend: {
    mode: RigPipelineV1BlendMode;
  };
  poseSource: {
    targetIds: string[];
  };
  directInput: {
    enabled: boolean;
    valuePath: string;
  };
  sourceBlend: {
    mode: RigPipelineV1BlendMode;
  };
  sourceFallback: {
    whenNoSources: RigPipelineV1SourceFallbackMode;
  };
  clamp: {
    enabled: boolean;
  };
  override: {
    enabledDefault: boolean;
    valueDefault: number;
    enabledPath: string;
    valuePath: string;
  };
}

export interface ResolveRigPipelineV1InputConfigArgs {
  faceId: string;
  input: Pick<StandardRigInput, "id" | "path" | "defaultValue">;
  pipelineV1?: RigPipelineV1Metadata | null;
}

const RIG_PIPELINE_V1_DEFAULT_BLEND_MODE: RigPipelineV1BlendMode =
  "normalized-additive";

const RIG_PIPELINE_V1_DEFAULT_SOURCE_FALLBACK: RigPipelineV1SourceFallbackMode =
  "use-baseline";

export function buildRigPipelineV1LinkId(
  parentInputId: string,
  childInputId: string,
): string {
  return `link/${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`;
}

function normalizeFinite(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isBlendMode(value: unknown): value is RigPipelineV1BlendMode {
  return value === "normalized-additive";
}

function normalizeBoolean(
  value: boolean | undefined,
  fallback: boolean,
): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return fallback;
}

export function buildRigPipelineV1DirectValuePath(
  faceId: string,
  inputPath: string,
): string {
  let trimmed = inputPath.startsWith("/") ? inputPath.slice(1) : inputPath;
  if (!trimmed) {
    return `rig/${faceId}`;
  }
  while (trimmed.startsWith("rig/")) {
    const segments = trimmed.split("/");
    if (segments.length >= 3) {
      const existingFaceId = segments[1];
      const remainder = segments.slice(2).join("/");
      if (existingFaceId === faceId) {
        return trimmed;
      }
      trimmed = remainder || "";
    } else {
      trimmed = segments.slice(1).join("/");
    }
  }
  const suffix = trimmed ? `/${trimmed}` : "";
  return `rig/${faceId}${suffix}`;
}

export function buildRigPipelineV1OverrideEnabledPath(
  faceId: string,
  inputId: string,
): string {
  return `rig/${faceId}/override/${inputId}/enabled`;
}

export function buildRigPipelineV1OverrideValuePath(
  faceId: string,
  inputId: string,
): string {
  return `rig/${faceId}/override/${inputId}/value`;
}

export function getRigPipelineV1InputConfig(
  pipelineV1: RigPipelineV1Metadata | null | undefined,
  inputId: string,
): RigPipelineV1InputConfig | null {
  if (!pipelineV1?.byInputId) {
    return null;
  }
  const entry = pipelineV1.byInputId[inputId];
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return entry;
}

export function hasRigPipelineV1InputConfig(
  pipelineV1: RigPipelineV1Metadata | null | undefined,
  inputId: string,
): boolean {
  return getRigPipelineV1InputConfig(pipelineV1, inputId) !== null;
}

export function resolveRigPipelineV1InputConfig({
  faceId,
  input,
  pipelineV1,
}: ResolveRigPipelineV1InputConfigArgs): RigPipelineV1ResolvedInputConfig {
  const stagedConfig = getRigPipelineV1InputConfig(pipelineV1, input.id);
  const parentEntries = Array.isArray(stagedConfig?.parents)
    ? stagedConfig.parents
    : [];
  const parents: RigPipelineV1ResolvedParentEntry[] = [];
  parentEntries.forEach((entry, index) => {
    const parentInputId = normalizeStringValue(entry?.inputId);
    if (!parentInputId) {
      return;
    }
    const linkId =
      normalizeStringValue(entry.linkId) ??
      buildRigPipelineV1LinkId(parentInputId, input.id);
    const alias =
      normalizeStringValue(entry.alias) ??
      normalizeStringValue(`p${index + 1}`) ??
      "p1";
    parents.push({
      linkId,
      inputId: parentInputId,
      alias,
      scale: normalizeFinite(entry.scale, 1),
      offset: normalizeFinite(entry.offset, 0),
      enabled: normalizeBoolean(entry.enabled, true),
    });
  });

  const childEntries = Array.isArray(stagedConfig?.children)
    ? stagedConfig.children
    : [];
  const children: RigPipelineV1ResolvedChildEntry[] = childEntries
    .map((entry) => {
      const linkId = normalizeStringValue(entry?.linkId);
      const childInputId = normalizeStringValue(entry?.childInputId);
      if (!linkId || !childInputId) {
        return null;
      }
      return {
        linkId,
        childInputId,
      };
    })
    .filter(
      (entry): entry is RigPipelineV1ResolvedChildEntry => entry !== null,
    );

  const poseTargetIds = Array.isArray(stagedConfig?.poseSource?.targetIds)
    ? stagedConfig.poseSource.targetIds
        .map((targetId) => normalizeStringValue(targetId))
        .filter((targetId): targetId is string => targetId !== null)
    : [];

  const sourceBlendMode = isBlendMode(stagedConfig?.sourceBlend?.mode)
    ? stagedConfig.sourceBlend.mode
    : RIG_PIPELINE_V1_DEFAULT_BLEND_MODE;
  const parentBlendMode = isBlendMode(stagedConfig?.parentBlend?.mode)
    ? stagedConfig.parentBlend.mode
    : RIG_PIPELINE_V1_DEFAULT_BLEND_MODE;

  const defaultValue = Number.isFinite(input.defaultValue)
    ? input.defaultValue
    : 0;
  const directValuePath = buildRigPipelineV1DirectValuePath(faceId, input.path);
  const overrideEnabledPath = buildRigPipelineV1OverrideEnabledPath(
    faceId,
    input.id,
  );
  const overrideValuePath = buildRigPipelineV1OverrideValuePath(
    faceId,
    input.id,
  );

  return {
    inputId: input.id,
    staged: stagedConfig !== null,
    parents,
    children,
    parentBlend: {
      mode: parentBlendMode,
    },
    poseSource: {
      targetIds: poseTargetIds,
    },
    directInput: {
      enabled: normalizeBoolean(stagedConfig?.directInput?.enabled, false),
      valuePath: directValuePath,
    },
    sourceBlend: {
      mode: sourceBlendMode,
    },
    sourceFallback: {
      whenNoSources: RIG_PIPELINE_V1_DEFAULT_SOURCE_FALLBACK,
    },
    clamp: {
      enabled: normalizeBoolean(stagedConfig?.clamp?.enabled, true),
    },
    override: {
      enabledDefault: normalizeBoolean(
        stagedConfig?.override?.enabledDefault,
        false,
      ),
      valueDefault: normalizeFinite(
        stagedConfig?.override?.valueDefault,
        defaultValue,
      ),
      enabledPath: overrideEnabledPath,
      valuePath: overrideValuePath,
    },
  };
}
