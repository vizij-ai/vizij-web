import {
  bindingTargetFromInput,
  updateBindingSlotAlias,
  type AnimatableBinding,
} from "@vizij/node-graph-authoring";
import {
  buildRigPipelineV1LinkId,
  normalizeStandardRigInputPath,
  resolveRigPipelineV1FormulaVariable,
  SELF_BINDING_ID,
  type RigBindingSlot,
  type RigPipelineV1ParentContributionSource,
  type StandardRigInput,
} from "@vizij/utils";
import {
  buildDefaultParentContributionFormula,
  buildDefaultParentVariableFormula,
  isAutoParentBlendExpression,
  mergePipelineMetadata,
} from "./pipelineStages";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function normalizeExpression(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.replace(/\s+/g, "").toLowerCase();
}

function readPipelineMetadata(metadata: unknown): JsonObject | null {
  const metadataObject = asObject(metadata);
  const vizij = asObject(metadataObject?.vizij);
  return asObject(vizij?.pipelineV1);
}

function readParentBlendExpression(metadata: unknown): string | null {
  const pipeline = readPipelineMetadata(metadata);
  const parentBlend = asObject(pipeline?.parentBlend);
  const expression = parentBlend?.expression;
  return typeof expression === "string" && expression.trim().length > 0
    ? expression.trim()
    : null;
}

function readPipelineLinks(metadata: unknown): Record<string, JsonObject> {
  const pipeline = readPipelineMetadata(metadata);
  const rawLinks = asObject(pipeline?.links);
  const links: Record<string, JsonObject> = {};
  Object.entries(rawLinks ?? {}).forEach(([linkId, value]) => {
    const normalized = asObject(value);
    if (normalized) {
      links[linkId] = normalized;
    }
  });
  return links;
}

function readLinkExpression(
  linksById: Record<string, JsonObject>,
  linkId: string,
): string | null {
  const expression = linksById[linkId]?.expression;
  return typeof expression === "string" && expression.trim().length > 0
    ? expression.trim()
    : null;
}

function readLinkEnabled(
  linksById: Record<string, JsonObject>,
  linkId: string,
): boolean {
  const enabled = linksById[linkId]?.enabled;
  return typeof enabled === "boolean" ? enabled : true;
}

function resolveLinkVariable(
  params: {
    childInput: StandardRigInput;
    slot: RigBindingSlot;
    slotIndex: number;
    standardInputsById: ReadonlyMap<string, StandardRigInput>;
    linksById: Record<string, JsonObject>;
  } & (
    | {
        parentInputId: string;
      }
    | {
        parentInput?: StandardRigInput | null;
      }
  ),
): {
  inputId: string;
  linkId: string;
  alias: string;
  expression: string | null;
} | null {
  const parentInputId =
    "parentInputId" in params
      ? params.parentInputId
      : (params.parentInput?.id ?? params.slot.inputId ?? "");
  const trimmedParentInputId = parentInputId.trim();
  if (!trimmedParentInputId || trimmedParentInputId === SELF_BINDING_ID) {
    return null;
  }
  const parentInput =
    "parentInput" in params && params.parentInput
      ? params.parentInput
      : params.standardInputsById.get(trimmedParentInputId);
  const linkId = buildRigPipelineV1LinkId(
    trimmedParentInputId,
    params.childInput.id,
  );
  const expression = readLinkExpression(params.linksById, linkId);
  const alias = resolveAuthoringParentExpressionVariable({
    input: parentInput,
    slot: params.slot,
    slotIndex: params.slotIndex,
    linkExpression: expression,
    fallbackAlias: trimmedParentInputId,
  });
  return {
    inputId: trimmedParentInputId,
    linkId,
    alias,
    expression,
  };
}

function collectParentContributionSourcesFromBinding(params: {
  binding: AnimatableBinding;
  childInput: StandardRigInput;
  standardInputsById: ReadonlyMap<string, StandardRigInput>;
}): RigPipelineV1ParentContributionSource[] {
  const linksById = readPipelineLinks(params.binding.metadata);
  const entries: RigPipelineV1ParentContributionSource[] = [];
  (params.binding.slots ?? []).forEach((slot, index) => {
    const resolved = resolveLinkVariable({
      childInput: params.childInput,
      slot,
      slotIndex: index,
      standardInputsById: params.standardInputsById,
      linksById,
    });
    if (!resolved || !readLinkEnabled(linksById, resolved.linkId)) {
      return;
    }
    if (resolved.expression) {
      entries.push({
        alias: resolved.alias,
        expression: resolved.expression,
      });
      return;
    }
    entries.push({
      alias: resolved.alias,
    });
  });
  return entries;
}

export function deriveAliasFromInputDescriptor(
  input?: Pick<StandardRigInput, "id" | "path" | "label"> | null,
): string | null {
  if (!input) {
    return null;
  }
  const normalized = normalizeStandardRigInputPath(
    input.path ?? input.id ?? input.label ?? "",
  );
  const segments = normalized.split("/").filter(Boolean);
  const fallback = input.id ?? input.label ?? null;
  const candidate =
    segments.length > 0 ? segments[segments.length - 1] : fallback;
  return candidate?.trim() || null;
}

export function resolveBindingSlotAlias(
  slot: Pick<RigBindingSlot, "alias" | "id">,
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

export function resolveAuthoringParentExpressionVariable(params: {
  input?: Pick<StandardRigInput, "id" | "path" | "label"> | null;
  slot?: Pick<RigBindingSlot, "alias" | "id"> | null;
  slotIndex?: number;
  linkExpression?: string | null | undefined;
  fallbackAlias?: string | null | undefined;
}): string {
  const slotAlias =
    params.slot && typeof params.slotIndex === "number"
      ? resolveBindingSlotAlias(params.slot, params.slotIndex)
      : null;
  return resolveRigPipelineV1FormulaVariable({
    alias:
      slotAlias ??
      deriveAliasFromInputDescriptor(params.input) ??
      params.fallbackAlias,
    expression: params.linkExpression,
    fallbackAlias: params.fallbackAlias,
  });
}

export function syncBindingParentAliasReferences(params: {
  binding: AnimatableBinding;
  childInput: StandardRigInput;
  standardInputsById: ReadonlyMap<string, StandardRigInput>;
  parentInputBefore?: Pick<StandardRigInput, "id" | "path" | "label"> | null;
  parentInputAfter: Pick<StandardRigInput, "id" | "path" | "label">;
}): AnimatableBinding {
  const previousAlias = deriveAliasFromInputDescriptor(
    params.parentInputBefore,
  );
  const nextAlias = deriveAliasFromInputDescriptor(params.parentInputAfter);
  if (
    !previousAlias ||
    !nextAlias ||
    previousAlias === nextAlias ||
    !params.parentInputAfter.id?.trim()
  ) {
    return params.binding;
  }

  const childTarget = bindingTargetFromInput(params.childInput);
  const slotsToRename = (params.binding.slots ?? [])
    .map((slot, index) => {
      if (slot.inputId !== params.parentInputAfter.id) {
        return null;
      }
      const currentAlias = slot.alias?.trim() ?? "";
      const resolvedAlias = resolveBindingSlotAlias(slot, index);
      const shouldSync =
        currentAlias.length === 0 ||
        currentAlias === previousAlias ||
        resolvedAlias === previousAlias;
      if (!shouldSync) {
        return null;
      }
      return slot.id ?? `s${index + 1}`;
    })
    .filter((slotId): slotId is string => slotId !== null);

  if (slotsToRename.length === 0) {
    return params.binding;
  }

  const previousParentVariables = collectParentContributionSourcesFromBinding({
    binding: params.binding,
    childInput: params.childInput,
    standardInputsById: params.standardInputsById,
  });

  const originalSlotsById = new Map(
    (params.binding.slots ?? []).map((slot, index) => [
      slot.id ?? `s${index + 1}`,
      { slot, index },
    ]),
  );

  let nextBinding = params.binding;
  slotsToRename.forEach((slotId) => {
    nextBinding = updateBindingSlotAlias(
      nextBinding,
      childTarget,
      slotId,
      nextAlias,
    );
  });

  const linkUpserts: Record<
    string,
    {
      parentInputId: string;
      childInputId: string;
      expression?: string | null;
    }
  > = {};

  slotsToRename.forEach((slotId) => {
    const originalEntry = originalSlotsById.get(slotId);
    const nextIndex = nextBinding.slots.findIndex((slot) => slot.id === slotId);
    const nextSlot = nextIndex >= 0 ? nextBinding.slots[nextIndex] : null;
    if (!originalEntry || !nextSlot) {
      return;
    }
    const linksById = readPipelineLinks(params.binding.metadata);
    const previousResolved = resolveLinkVariable({
      childInput: params.childInput,
      slot: originalEntry.slot,
      slotIndex: originalEntry.index,
      parentInputId: params.parentInputAfter.id,
      standardInputsById: params.standardInputsById,
      linksById,
    });
    if (!previousResolved?.expression) {
      return;
    }
    if (
      normalizeExpression(previousResolved.expression) !==
      normalizeExpression(
        buildDefaultParentVariableFormula(previousResolved.alias),
      )
    ) {
      return;
    }
    const nextResolved = resolveLinkVariable({
      childInput: params.childInput,
      slot: nextSlot,
      slotIndex: nextIndex,
      parentInputId: params.parentInputAfter.id,
      standardInputsById: params.standardInputsById,
      linksById: {},
    });
    if (!nextResolved) {
      return;
    }
    const nextExpression = buildDefaultParentVariableFormula(
      nextResolved.alias,
    );
    if (
      normalizeExpression(previousResolved.expression) ===
      normalizeExpression(nextExpression)
    ) {
      return;
    }
    linkUpserts[nextResolved.linkId] = {
      parentInputId: params.parentInputAfter.id,
      childInputId: params.childInput.id,
      expression: nextExpression,
    };
  });

  const nextBindingWithLinkExpressions =
    Object.keys(linkUpserts).length > 0
      ? {
          ...nextBinding,
          metadata: mergePipelineMetadata(
            (nextBinding.metadata as JsonObject | undefined) ?? undefined,
            { linkUpserts },
          ),
        }
      : nextBinding;
  const nextParentVariables = collectParentContributionSourcesFromBinding({
    binding: nextBindingWithLinkExpressions,
    childInput: params.childInput,
    standardInputsById: params.standardInputsById,
  });
  const previousParentBlendExpression = readParentBlendExpression(
    params.binding.metadata,
  );
  const shouldRewriteParentBlend =
    previousParentBlendExpression !== null &&
    isAutoParentBlendExpression(
      previousParentBlendExpression,
      previousParentVariables,
    );
  const nextParentBlendExpression =
    shouldRewriteParentBlend && nextParentVariables.length > 0
      ? buildDefaultParentContributionFormula(nextParentVariables)
      : shouldRewriteParentBlend
        ? null
        : undefined;

  if (
    Object.keys(linkUpserts).length === 0 &&
    nextParentBlendExpression === undefined
  ) {
    return nextBinding;
  }

  return {
    ...nextBinding,
    metadata: mergePipelineMetadata(
      (nextBinding.metadata as JsonObject | undefined) ?? undefined,
      {
        ...(Object.keys(linkUpserts).length > 0 ? { linkUpserts } : {}),
        ...(nextParentBlendExpression !== undefined
          ? { parentBlendExpression: nextParentBlendExpression }
          : {}),
      },
    ),
  };
}
