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
  expression?: string;
}

export interface RigPipelineV1ChildEntry {
  linkId: string;
  childInputId: string;
}

export interface RigPipelineV1ParentBlendConfig {
  mode?: RigPipelineV1BlendMode;
  weights?: Record<string, number>;
  expression?: string;
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
  expression?: string;
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
  expression: string;
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
    expression: string;
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

function normalizeExpression(value: unknown): string | null {
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

export function buildRigPipelineV1ParentExpression(alias: string): string {
  const resolvedAlias = normalizeStringValue(alias) ?? "P1";
  return `${resolvedAlias} = parent * scale + offset`;
}

export function buildRigPipelineV1ParentContributionExpression(
  parentAliases: readonly string[],
): string {
  const aliases = parentAliases.map((alias) => normalizeStringValue(alias));
  const resolvedAliases = aliases.filter(
    (alias): alias is string => alias !== null,
  );
  const parentTerms = resolvedAliases.join(", ");
  return `parentContribution = normalizedAdditive([${parentTerms}], baseline=default)`;
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
  const linkMap = pipelineV1?.links ?? {};
  const parentEntries = Array.isArray(stagedConfig?.parents)
    ? stagedConfig.parents
    : [];
  const parents: RigPipelineV1ResolvedParentEntry[] = [];
  const parentLinkIds = new Set<string>();
  parentEntries.forEach((entry, index) => {
    const linkId =
      normalizeStringValue(entry.linkId) ??
      buildRigPipelineV1LinkId(
        normalizeStringValue(entry?.inputId) ?? `parent_${index + 1}`,
        input.id,
      );
    const linkConfigRaw = linkMap[linkId];
    const linkConfig =
      linkConfigRaw && typeof linkConfigRaw === "object"
        ? (linkConfigRaw as RigPipelineV1LinkConfig)
        : null;
    const linkParentInputId = normalizeStringValue(linkConfig?.parentInputId);
    const linkChildInputId = normalizeStringValue(linkConfig?.childInputId);
    if (linkChildInputId && linkChildInputId !== input.id) {
      return;
    }
    const parentInputId =
      normalizeStringValue(entry?.inputId) ?? linkParentInputId;
    if (!parentInputId) {
      return;
    }
    const alias =
      normalizeStringValue(entry.alias) ??
      normalizeStringValue(`P${index + 1}`) ??
      "P1";
    const linkScale =
      typeof linkConfig?.scale === "number" && Number.isFinite(linkConfig.scale)
        ? linkConfig.scale
        : undefined;
    const linkOffset =
      typeof linkConfig?.offset === "number" &&
      Number.isFinite(linkConfig.offset)
        ? linkConfig.offset
        : undefined;
    const linkEnabled =
      typeof linkConfig?.enabled === "boolean" ? linkConfig.enabled : undefined;
    parentLinkIds.add(linkId);
    parents.push({
      linkId,
      inputId: parentInputId,
      alias,
      scale: linkScale ?? normalizeFinite(entry.scale, 1),
      offset: linkOffset ?? normalizeFinite(entry.offset, 0),
      enabled: linkEnabled ?? normalizeBoolean(entry.enabled, true),
      expression:
        normalizeExpression(linkConfig?.expression) ??
        normalizeExpression(entry.expression) ??
        buildRigPipelineV1ParentExpression(alias),
    });
  });
  Object.entries(linkMap).forEach(([rawLinkId, rawLink]) => {
    const link = rawLink as RigPipelineV1LinkConfig;
    if (!link || typeof link !== "object") {
      return;
    }
    const linkId =
      normalizeStringValue(rawLinkId) ?? normalizeStringValue(link.linkId);
    const parentInputId = normalizeStringValue(link.parentInputId);
    const childInputId = normalizeStringValue(link.childInputId);
    if (!linkId || !parentInputId || childInputId !== input.id) {
      return;
    }
    if (parentLinkIds.has(linkId)) {
      return;
    }
    parentLinkIds.add(linkId);
    parents.push({
      linkId,
      inputId: parentInputId,
      alias: `P${parents.length + 1}`,
      scale: normalizeFinite(link.scale, 1),
      offset: normalizeFinite(link.offset, 0),
      enabled: normalizeBoolean(link.enabled, true),
      expression:
        normalizeExpression(link.expression) ??
        buildRigPipelineV1ParentExpression(`P${parents.length + 1}`),
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
  const childLinkKeys = new Set(children.map((entry) => entry.linkId));
  Object.entries(linkMap).forEach(([rawLinkId, rawLink]) => {
    const link = rawLink as RigPipelineV1LinkConfig;
    if (!link || typeof link !== "object") {
      return;
    }
    const linkId =
      normalizeStringValue(rawLinkId) ?? normalizeStringValue(link.linkId);
    const parentInputId = normalizeStringValue(link.parentInputId);
    const childInputId = normalizeStringValue(link.childInputId);
    if (!linkId || !childInputId || parentInputId !== input.id) {
      return;
    }
    if (childLinkKeys.has(linkId)) {
      return;
    }
    childLinkKeys.add(linkId);
    children.push({
      linkId,
      childInputId,
    });
  });

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
  const parentBlendExpression =
    normalizeExpression(stagedConfig?.parentBlend?.expression) ??
    buildRigPipelineV1ParentContributionExpression(
      parents.filter((parent) => parent.enabled).map((parent) => parent.alias),
    );

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
      expression: parentBlendExpression,
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
