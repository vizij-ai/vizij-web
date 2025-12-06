import {
  SELF_BINDING_ID,
  type StandardRigInput,
  type AnimatableComponent,
  type BindingValueType,
  type RigBindingDefinition,
  type RigBindingSlot,
  type RigBindingMetadata,
  cloneDeepSafe,
} from "@vizij/utils";

export type { BindingValueType };
export type AnimatableBindingSlot = RigBindingSlot;

export interface AnimatableBinding extends RigBindingDefinition {
  targetId: string;
  slots: AnimatableBindingSlot[];
}

export interface BindingTarget {
  id: string;
  defaultValue: number;
  range: {
    min: number;
    max: number;
  };
  valueType?: BindingValueType;
}

const VECTOR_ANIMATABLE_TYPES: ReadonlySet<
  AnimatableComponent["animatableType"]
> = new Set(["vector2", "vector3", "euler", "rgb"]);

function deriveComponentValueType(
  component: AnimatableComponent,
): BindingValueType {
  if (component.component) {
    return "scalar";
  }
  return VECTOR_ANIMATABLE_TYPES.has(component.animatableType)
    ? "vector"
    : "scalar";
}

function isBindingValueType(value: unknown): value is BindingValueType {
  return value === "scalar" || value === "vector";
}

function getTargetValueType(target: BindingTarget): BindingValueType {
  return isBindingValueType(target.valueType) ? target.valueType : "scalar";
}

function sanitizeSlotValueType(
  value: unknown,
  targetType: BindingValueType,
): BindingValueType {
  return isBindingValueType(value) ? value : targetType;
}

export function bindingTargetFromComponent(
  component: AnimatableComponent,
): BindingTarget {
  return {
    id: component.id,
    defaultValue: component.defaultValue,
    range: {
      min: component.range.min,
      max: component.range.max,
    },
    valueType: deriveComponentValueType(component),
  };
}

export function bindingTargetFromInput(input: StandardRigInput): BindingTarget {
  return {
    id: input.id,
    defaultValue: input.defaultValue,
    range: {
      min: input.range.min,
      max: input.range.max,
    },
    valueType: "scalar",
  };
}

export type BindingMap = Record<string, AnimatableBinding>;
export type InputBindingMap = Record<string, AnimatableBinding>;

export type StandardInputValues = Record<string, number>;

const LEGACY_SLOT_PATTERN = /^slot_(\d+)$/i;
const ALIAS_SANITIZE_PATTERN = /[^A-Za-z0-9_]+/g;

export const PRIMARY_SLOT_ID = "s1";
export const PRIMARY_SLOT_ALIAS = "s1";

function defaultSlotId(index: number): string {
  return `s${index + 1}`;
}

function normalizeSlotId(value: string | undefined, index: number): string {
  if (value && value.length > 0) {
    const match = value.match(LEGACY_SLOT_PATTERN);
    if (match) {
      const suffix = match[1] ?? String(index + 1);
      return `s${suffix}`;
    }
    return value;
  }
  return defaultSlotId(index);
}

function normalizeSlotAlias(
  value: string | undefined,
  fallback: string,
  index: number,
): { alias: string; replaced: string | null } {
  if (value && value.length > 0) {
    const match = value.match(LEGACY_SLOT_PATTERN);
    if (match) {
      const suffix = match[1] ?? String(index + 1);
      return { alias: `s${suffix}`, replaced: value };
    }
    return { alias: value, replaced: null };
  }
  if (fallback && fallback.length > 0) {
    return { alias: fallback, replaced: null };
  }
  return { alias: defaultSlotId(index), replaced: null };
}

function sanitizeAliasInput(
  raw: string,
  fallback: string,
  index: number,
): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return fallback || defaultSlotId(index);
  }
  let sanitized = trimmed
    .replace(/\s+/g, "_")
    .replace(ALIAS_SANITIZE_PATTERN, "");
  if (sanitized.length === 0) {
    sanitized = fallback || defaultSlotId(index);
  }
  if (/^\d/.test(sanitized)) {
    sanitized = `s${sanitized}`;
  }
  return sanitized;
}

function ensureUniqueAlias(candidate: string, existing: Set<string>): string {
  if (!existing.has(candidate.toLowerCase())) {
    existing.add(candidate.toLowerCase());
    return candidate;
  }
  let suffix = 2;
  let next = `${candidate}_${suffix}`;
  while (existing.has(next.toLowerCase())) {
    suffix += 1;
    next = `${candidate}_${suffix}`;
  }
  existing.add(next.toLowerCase());
  return next;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rewriteLegacyExpression(
  expression: string,
  replacements: Map<string, string>,
): string {
  if (expression.trim().length === 0) {
    return expression;
  }
  return expression.replace(/\bslot_(\d+)\b/gi, (match, digits) => {
    const replacement = replacements.get(match);
    if (replacement) {
      return replacement;
    }
    return `s${digits}`;
  });
}

function cloneBindingMetadata(
  metadata: RigBindingMetadata | undefined,
): RigBindingMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return cloneDeepSafe(metadata);
}

export function createDefaultBindings(components: BindingTarget[]): BindingMap {
  const bindings: BindingMap = {};
  components.forEach((component) => {
    bindings[component.id] = createDefaultBinding(component);
  });
  return bindings;
}

export function createDefaultBinding(
  component: BindingTarget,
): AnimatableBinding {
  const valueType = getTargetValueType(component);
  const slots: AnimatableBindingSlot[] = [
    {
      id: PRIMARY_SLOT_ID,
      alias: PRIMARY_SLOT_ALIAS,
      inputId: null,
      valueType,
    },
  ];
  return {
    targetId: component.id,
    inputId: null,
    slots,
    expression: buildCanonicalExpressionFromSlots(slots),
  };
}

export function createDefaultParentBinding(
  component: BindingTarget,
): AnimatableBinding {
  const base = createDefaultBinding(component);
  const ensured = ensurePrimarySlot(base, component);
  const slots = ensured.slots.map((slot, index) => {
    if (index === 0) {
      return {
        ...slot,
        alias: "self",
        inputId: SELF_BINDING_ID,
      };
    }
    return slot;
  });
  return {
    ...ensured,
    inputId: SELF_BINDING_ID,
    slots,
    expression: buildCanonicalExpressionFromSlots(slots),
  };
}

function ensurePrimarySlot(
  binding: AnimatableBinding,
  target: BindingTarget,
): AnimatableBinding {
  const targetValueType = getTargetValueType(target);
  const aliasReplacements = new Map<string, string>();
  const sourceSlots =
    Array.isArray(binding.slots) && binding.slots.length > 0
      ? binding.slots
      : [
          {
            id: PRIMARY_SLOT_ID,
            alias: PRIMARY_SLOT_ALIAS,
            inputId: binding.inputId ?? null,
            valueType: targetValueType,
          },
        ];

  const normalizedSlots: AnimatableBindingSlot[] = sourceSlots.map(
    (slot, index) => {
      const normalizedId = normalizeSlotId(slot.id, index);
      const { alias: normalizedAlias, replaced } = normalizeSlotAlias(
        slot.alias,
        normalizedId,
        index,
      );
      if (replaced && replaced !== normalizedAlias) {
        aliasReplacements.set(replaced, normalizedAlias);
      }
      const inputId =
        slot.inputId !== undefined && slot.inputId !== null
          ? slot.inputId
          : index === 0
            ? (binding.inputId ?? null)
            : null;
      const slotValueType = sanitizeSlotValueType(
        slot.valueType,
        targetValueType,
      );
      return {
        id: normalizedId,
        alias: normalizedAlias,
        inputId,
        valueType: slotValueType,
      };
    },
  );

  const primary = normalizedSlots[0];
  const primaryInputId =
    primary.inputId === SELF_BINDING_ID
      ? SELF_BINDING_ID
      : (primary.inputId ?? binding.inputId ?? null);
  const primaryAlias =
    primaryInputId === SELF_BINDING_ID
      ? "self"
      : primary.alias || PRIMARY_SLOT_ALIAS;
  normalizedSlots[0] = {
    ...primary,
    id: primary.id || PRIMARY_SLOT_ID,
    alias: primaryAlias,
    inputId: primaryInputId,
    valueType: sanitizeSlotValueType(primary.valueType, targetValueType),
  };
  normalizedSlots.slice(1).forEach((slot, index) => {
    normalizedSlots[index + 1] = {
      ...slot,
      id: slot.id || defaultSlotId(index + 1),
      alias: slot.alias || defaultSlotId(index + 1),
      valueType: sanitizeSlotValueType(slot.valueType, targetValueType),
    };
  });

  const rawExpression =
    typeof binding.expression === "string" ? binding.expression.trim() : "";
  const canonicalExpression =
    buildCanonicalExpressionFromSlots(normalizedSlots);
  let expression: string;
  if (expressionMatchesAliasOnly(rawExpression, normalizedSlots)) {
    expression = canonicalExpression;
  } else {
    expression = rewriteLegacyExpression(rawExpression, aliasReplacements);
  }

  const normalizedBinding: AnimatableBinding = {
    ...binding,
    inputId: normalizedSlots[0].inputId ?? null,
    slots: normalizedSlots,
    expression,
  };
  return normalizedBinding;
}

export function createDefaultInputValues(
  inputs: StandardRigInput[] = [],
): StandardInputValues {
  const values: StandardInputValues = {};
  inputs.forEach((input) => {
    values[input.id] = input.defaultValue;
  });
  return values;
}

export function ensureBindingStructure(
  binding: AnimatableBinding,
  target: BindingTarget,
): AnimatableBinding {
  return ensurePrimarySlot(binding, target);
}

export function getPrimaryBindingSlot(
  binding: AnimatableBinding,
): AnimatableBindingSlot | null {
  if (!binding.slots || binding.slots.length === 0) {
    return null;
  }
  return binding.slots[0];
}

export function addBindingSlot(
  binding: AnimatableBinding,
  target: BindingTarget,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  const nextIndex = base.slots.length + 1;
  const slotId = defaultSlotId(nextIndex - 1);
  const alias = slotId;
  const nextSlots = [
    ...base.slots,
    {
      id: slotId,
      alias,
      inputId: null,
      valueType: getTargetValueType(target),
    },
  ];
  return ensurePrimarySlot(
    {
      ...base,
      slots: nextSlots,
    },
    target,
  );
}

export function removeBindingSlot(
  binding: AnimatableBinding,
  target: BindingTarget,
  slotId: string,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  if (base.slots.length <= 1) {
    return base;
  }
  const nextSlots = base.slots.filter((slot) => slot.id !== slotId);
  if (nextSlots.length === base.slots.length) {
    return base;
  }
  const nextBinding = ensurePrimarySlot(
    {
      ...base,
      slots: nextSlots,
    },
    target,
  );
  if (!nextBinding.expression) {
    return nextBinding;
  }
  const hasExpressionAlias = nextBinding.slots.some(
    (slot) => slot.alias === nextBinding.expression,
  );
  if (!hasExpressionAlias) {
    return {
      ...nextBinding,
      expression: nextBinding.slots[0]?.alias ?? PRIMARY_SLOT_ALIAS,
    };
  }
  return nextBinding;
}

export function updateBindingSlotAlias(
  binding: AnimatableBinding,
  target: BindingTarget,
  slotId: string,
  nextAlias: string,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  const slotIndex = base.slots.findIndex((slot) => slot.id === slotId);
  if (slotIndex < 0) {
    return base;
  }
  const slots = base.slots.map((slot) => ({ ...slot }));
  const currentSlot = slots[slotIndex]!;
  const fallbackAlias =
    currentSlot.alias || currentSlot.id || defaultSlotId(slotIndex);
  const sanitized = sanitizeAliasInput(nextAlias, fallbackAlias, slotIndex);
  const existingAliases = new Set<string>();
  slots.forEach((slot, index) => {
    if (index === slotIndex) {
      return;
    }
    if (slot.alias) {
      existingAliases.add(slot.alias.toLowerCase());
    }
  });
  const uniqueAlias = ensureUniqueAlias(sanitized, existingAliases);
  const previousAlias = currentSlot.alias;
  slots[slotIndex] = {
    ...currentSlot,
    alias: uniqueAlias,
  };

  let nextExpression = base.expression;
  if (
    previousAlias &&
    previousAlias !== uniqueAlias &&
    typeof nextExpression === "string"
  ) {
    const pattern = new RegExp(`\\b${escapeRegExp(previousAlias)}\\b`, "g");
    nextExpression = nextExpression.replace(pattern, uniqueAlias);
  }

  const updated = ensurePrimarySlot(
    {
      ...base,
      slots,
      expression: nextExpression,
    },
    target,
  );
  return updated;
}

export function updateBindingSlotValueType(
  binding: AnimatableBinding,
  target: BindingTarget,
  slotId: string,
  nextValueType: BindingValueType,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  const slotIndex = base.slots.findIndex((slot) => slot.id === slotId);
  if (slotIndex < 0) {
    return base;
  }
  const normalizedType = sanitizeSlotValueType(
    nextValueType,
    getTargetValueType(target),
  );
  const slots = base.slots.map((slot, index) => {
    if (index !== slotIndex) {
      return slot;
    }
    return {
      ...slot,
      valueType: normalizedType,
    };
  });
  return {
    ...base,
    slots,
  };
}

export function updateBindingExpression(
  binding: AnimatableBinding,
  target: BindingTarget,
  expression: string,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  const trimmed = expression.trim();
  const canonicalExpression = buildCanonicalExpressionFromSlots(base.slots);
  return {
    ...base,
    expression: trimmed.length > 0 ? trimmed : canonicalExpression,
  };
}

export function updateBindingWithInput(
  binding: AnimatableBinding,
  target: BindingTarget,
  input: StandardRigInput | undefined,
  slotId: string = PRIMARY_SLOT_ID,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  const existingExpression =
    typeof base.expression === "string" ? base.expression.trim() : "";
  const canonicalBefore = buildCanonicalExpressionFromSlots(base.slots);
  const expressionWasDefault =
    expressionMatchesAliasOnly(existingExpression, base.slots) ||
    expressionsEquivalent(existingExpression, canonicalBefore);
  const slotIndex = base.slots.findIndex((slot) => slot.id === slotId);

  const effectiveIndex = slotIndex >= 0 ? slotIndex : base.slots.length;

  const slots = base.slots.map((slot) => ({ ...slot }));

  if (slotIndex === -1) {
    const alias =
      slotId === PRIMARY_SLOT_ID && slots.length === 0
        ? PRIMARY_SLOT_ALIAS
        : slotId;
    slots.push({
      id: slotId,
      alias,
      inputId: null,
      valueType: getTargetValueType(target),
    });
  }

  const currentSlot = slots[effectiveIndex];

  let nextBinding: AnimatableBinding;
  if (!input) {
    slots[effectiveIndex] = {
      ...currentSlot,
      inputId: null,
    };
    if (effectiveIndex === 0) {
      nextBinding = {
        ...base,
        inputId: null,
        slots,
      };
    } else {
      nextBinding = {
        ...base,
        slots,
      };
    }
  } else {
    slots[effectiveIndex] = {
      ...currentSlot,
      inputId: input.id,
    };

    if (effectiveIndex === 0) {
      nextBinding = {
        ...base,
        inputId: input.id,
        slots,
      };
    } else {
      nextBinding = {
        ...base,
        slots,
      };
    }
  }
  if (!expressionWasDefault) {
    return nextBinding;
  }
  const canonicalAfter = buildCanonicalExpressionFromSlots(nextBinding.slots);
  if (expressionsEquivalent(nextBinding.expression ?? "", canonicalAfter)) {
    return nextBinding;
  }
  return {
    ...nextBinding,
    expression: canonicalAfter,
  };
}

export function reconcileBindings(
  previous: BindingMap,
  components: BindingTarget[],
): BindingMap {
  const next: BindingMap = {};
  components.forEach((component) => {
    const existing = previous[component.id];
    if (existing) {
      const ensured = ensureBindingStructure(existing, component);
      const aliasReplacements = new Map<string, string>();
      const slots = ensured.slots.map((slot, index) => {
        const normalizedId = normalizeSlotId(slot.id, index);
        const { alias: normalizedAlias, replaced } = normalizeSlotAlias(
          slot.alias,
          normalizedId,
          index,
        );
        if (replaced && replaced !== normalizedAlias) {
          aliasReplacements.set(replaced, normalizedAlias);
        }
        return {
          ...slot,
          id: normalizedId,
          alias: normalizedAlias,
        };
      });
      const primary = slots[0];
      let expression =
        typeof ensured.expression === "string" &&
        ensured.expression.trim().length > 0
          ? ensured.expression.trim()
          : primary.alias;
      expression = rewriteLegacyExpression(expression, aliasReplacements);
      next[component.id] = {
        ...ensured,
        targetId: component.id,
        inputId: primary.inputId ?? null,
        slots,
        expression,
      };
    } else {
      next[component.id] = createDefaultBinding(component);
    }
  });
  return next;
}

export function bindingToDefinition(
  binding: AnimatableBinding,
): RigBindingDefinition {
  const definition = {
    inputId: binding.inputId ?? null,
    slots: binding.slots.map((slot) => ({ ...slot })),
    expression: binding.expression,
    metadata: cloneBindingMetadata(binding.metadata),
  } as RigBindingDefinition;

  return definition;
}

export function bindingFromDefinition(
  target: BindingTarget,
  definition: RigBindingDefinition | null | undefined,
): AnimatableBinding {
  if (!definition) {
    return createDefaultBinding(target);
  }

  const binding: AnimatableBinding = {
    targetId: target.id,
    inputId: definition.inputId ?? null,
    slots: definition.slots.map((slot) => ({ ...slot })),
    expression: definition.expression,
    metadata: cloneBindingMetadata(definition.metadata),
  };
  return ensureBindingStructure(binding, target);
}
function normalizeSlotAliasForExpression(
  slot: AnimatableBindingSlot,
  index: number,
): string {
  if (slot.alias && slot.alias.trim().length > 0) {
    return slot.alias.trim();
  }
  if (slot.id && slot.id.trim().length > 0) {
    return slot.id.trim();
  }
  return defaultSlotId(index);
}

function buildAliasOnlyExpression(
  slots: readonly AnimatableBindingSlot[],
): string {
  if (!slots.length) {
    return PRIMARY_SLOT_ALIAS;
  }
  return slots
    .map((slot, index) => normalizeSlotAliasForExpression(slot, index))
    .join(" + ");
}

function buildCanonicalExpressionFromSlots(
  slots: readonly AnimatableBindingSlot[],
): string {
  return buildAliasOnlyExpression(slots);
}

function expressionsEquivalent(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function expressionMatchesAliasOnly(
  expression: string,
  slots: readonly AnimatableBindingSlot[],
): boolean {
  if (expression.trim().length === 0) {
    return true;
  }
  const aliasOnly = buildAliasOnlyExpression(slots);
  return expressionsEquivalent(expression, aliasOnly);
}

export function buildCanonicalBindingExpression(
  binding: AnimatableBinding,
): string {
  const slots = binding.slots ?? [];
  return buildCanonicalExpressionFromSlots(slots);
}
