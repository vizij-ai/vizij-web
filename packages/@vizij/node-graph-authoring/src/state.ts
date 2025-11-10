import {
  cloneRemapSettings,
  SELF_BINDING_ID,
  type StandardRigInput,
  type AnimatableComponent,
  type BindingValueType,
  type RigBindingDefinition,
  type RigBindingSlot,
  type RemapSettings,
  type RigBindingMetadata,
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

const DEFAULT_INPUT_RANGE = { min: -1, max: 1 };
const DEFAULT_INPUT_ANCHOR = 0;

const EPSILON = 1e-6;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type LegacyRemapSettings = Partial<{
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}>;

function deriveOutputDefaults(target: BindingTarget): {
  outLow: number;
  outAnchor: number;
  outHigh: number;
} {
  const { min, max } = target.range;
  const anchor = clamp(target.defaultValue, min, max);
  return {
    outLow: min,
    outAnchor: anchor,
    outHigh: max,
  };
}

function deriveInputDefaults(): {
  inLow: number;
  inAnchor: number;
  inHigh: number;
} {
  return {
    inLow: DEFAULT_INPUT_RANGE.min,
    inAnchor: DEFAULT_INPUT_ANCHOR,
    inHigh: DEFAULT_INPUT_RANGE.max,
  };
}

function migrateLegacyRemap(
  legacy: LegacyRemapSettings | RemapSettings,
  target: BindingTarget,
): RemapSettings {
  const inputDefaults = deriveInputDefaults();
  const outputDefaults = deriveOutputDefaults(target);
  const defaults: RemapSettings = {
    inLow: inputDefaults.inLow,
    inAnchor: inputDefaults.inAnchor,
    inHigh: inputDefaults.inHigh,
    outLow: outputDefaults.outLow,
    outAnchor: outputDefaults.outAnchor,
    outHigh: outputDefaults.outHigh,
  };
  if (
    "inLow" in legacy &&
    "inHigh" in legacy &&
    "outLow" in legacy &&
    "outHigh" in legacy
  ) {
    const inLow = isFiniteNumber(legacy.inLow) ? legacy.inLow : defaults.inLow;
    const inAnchor = isFiniteNumber(legacy.inAnchor)
      ? legacy.inAnchor
      : defaults.inAnchor;
    const inHigh = isFiniteNumber(legacy.inHigh)
      ? legacy.inHigh
      : defaults.inHigh;
    let outLow = isFiniteNumber(legacy.outLow)
      ? legacy.outLow
      : defaults.outLow;
    let outHigh = isFiniteNumber(legacy.outHigh)
      ? legacy.outHigh
      : defaults.outHigh;
    if (outLow > outHigh) {
      const low = outHigh;
      const high = outLow;
      outLow = low;
      outHigh = high;
    }
    const outAnchor = clamp(
      isFiniteNumber(legacy.outAnchor) ? legacy.outAnchor : defaults.outAnchor,
      outLow,
      outHigh,
    );
    return {
      inLow,
      inAnchor,
      inHigh,
      outLow,
      outAnchor,
      outHigh,
    };
  }

  const legacyTyped = legacy as LegacyRemapSettings;
  const inLow = isFiniteNumber(legacyTyped.inMin)
    ? legacyTyped.inMin
    : defaults.inLow;
  const inHigh = isFiniteNumber(legacyTyped.inMax)
    ? legacyTyped.inMax
    : defaults.inHigh;
  const inAnchor = (inLow + inHigh) / 2;

  const legacyOutMid =
    isFiniteNumber(legacyTyped.outMin) && isFiniteNumber(legacyTyped.outMax)
      ? (legacyTyped.outMin + legacyTyped.outMax) / 2
      : defaults.outAnchor;
  const outAnchor = clamp(legacyOutMid, defaults.outLow, defaults.outHigh);

  return {
    inLow,
    inAnchor,
    inHigh,
    outLow: defaults.outLow,
    outAnchor,
    outHigh: defaults.outHigh,
  };
}

function normalizeRemap(
  remap: RemapSettings | LegacyRemapSettings | undefined,
  target: BindingTarget,
): RemapSettings {
  if (!remap) {
    return createDefaultRemap(target);
  }
  return migrateLegacyRemap(remap, target);
}

function cloneRemap(remap: RemapSettings): RemapSettings {
  return cloneRemapSettings(remap);
}

function cloneBindingMetadata(
  metadata: RigBindingMetadata | undefined,
): RigBindingMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(metadata)) as RigBindingMetadata;
}

function sanitizeRemap(
  remap: RemapSettings | LegacyRemapSettings | undefined,
  target: BindingTarget,
): RemapSettings {
  const normalized = normalizeRemap(remap, target);
  const outputDefaults = deriveOutputDefaults(target);
  if (!Number.isFinite(normalized.outLow)) {
    normalized.outLow = outputDefaults.outLow;
  }
  if (!Number.isFinite(normalized.outHigh)) {
    normalized.outHigh = outputDefaults.outHigh;
  }
  if (!Number.isFinite(normalized.outAnchor)) {
    normalized.outAnchor = outputDefaults.outAnchor;
  }
  if (normalized.outLow > normalized.outHigh) {
    const low = normalized.outHigh;
    const high = normalized.outLow;
    normalized.outLow = low;
    normalized.outHigh = high;
  }
  normalized.outAnchor = clamp(
    normalized.outAnchor,
    normalized.outLow,
    normalized.outHigh,
  );
  return normalized;
}

export function createDefaultRemap(target: BindingTarget): RemapSettings {
  const inputDefaults = deriveInputDefaults();
  const outputDefaults = deriveOutputDefaults(target);
  return {
    inLow: inputDefaults.inLow,
    inAnchor: inputDefaults.inAnchor,
    inHigh: inputDefaults.inHigh,
    outLow: outputDefaults.outLow,
    outAnchor: outputDefaults.outAnchor,
    outHigh: outputDefaults.outHigh,
  };
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
  const remap = createDefaultRemap(component);
  const valueType = getTargetValueType(component);
  const slots: AnimatableBindingSlot[] = [
    {
      id: PRIMARY_SLOT_ID,
      alias: PRIMARY_SLOT_ALIAS,
      inputId: null,
      remap: cloneRemap(remap),
      valueType,
    },
  ];
  return {
    targetId: component.id,
    inputId: null,
    remap,
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
  const normalizedBindingRemap = sanitizeRemap(binding.remap, target);
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
            remap: cloneRemap(normalizedBindingRemap),
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
      const slotRemapSource =
        slot.remap ??
        (index === 0 ? normalizedBindingRemap : createDefaultRemap(target));
      const normalizedSlotRemap = sanitizeRemap(slotRemapSource, target);
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
        remap: cloneRemap(normalizedSlotRemap),
        valueType: slotValueType,
      };
    },
  );

  const primary = normalizedSlots[0];
  const primaryRemap = sanitizeRemap(primary.remap, target);
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
    remap: cloneRemap(primaryRemap),
    valueType: sanitizeSlotValueType(primary.valueType, targetValueType),
  };
  normalizedSlots.slice(1).forEach((slot, index) => {
    const slotRemap = sanitizeRemap(slot.remap, target);
    normalizedSlots[index + 1] = {
      ...slot,
      id: slot.id || defaultSlotId(index + 1),
      alias: slot.alias || defaultSlotId(index + 1),
      remap: cloneRemap(slotRemap),
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
    remap: cloneRemap(primaryRemap),
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
  const remap = createDefaultRemap(target);
  const nextSlots = [
    ...base.slots,
    {
      id: slotId,
      alias,
      inputId: null,
      remap: cloneRemap(remap),
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

export function updateBindingSlotRemap(
  binding: AnimatableBinding,
  target: BindingTarget,
  slotId: string,
  field: keyof RemapSettings,
  value: number,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, target);
  const existingExpression =
    typeof base.expression === "string" ? base.expression.trim() : "";
  const canonicalBefore = buildCanonicalExpressionFromSlots(base.slots);
  const expressionWasDefault =
    expressionMatchesAliasOnly(existingExpression, base.slots) ||
    expressionsEquivalent(existingExpression, canonicalBefore);
  const nextSlots = base.slots.map((slot) => {
    if (slot.id !== slotId) {
      return slot;
    }
    const updatedRemap: RemapSettings = {
      ...slot.remap,
      [field]: value,
    } as RemapSettings;
    const sanitized = sanitizeRemap(updatedRemap, target);
    return {
      ...slot,
      remap: cloneRemap(sanitized),
    };
  });
  const updated = ensurePrimarySlot(
    {
      ...base,
      slots: nextSlots,
    },
    target,
  );
  if (updated.slots[0]?.id === slotId) {
    updated.remap = {
      ...updated.remap,
      [field]: value,
    };
  }
  if (!expressionWasDefault) {
    return updated;
  }
  const canonicalAfter = buildCanonicalExpressionFromSlots(updated.slots);
  if (expressionsEquivalent(updated.expression ?? "", canonicalAfter)) {
    return updated;
  }
  return {
    ...updated,
    expression: canonicalAfter,
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

  const slots = base.slots.map((slot) => ({
    ...slot,
    remap: cloneRemap(slot.remap),
  }));

  if (slotIndex === -1) {
    const alias =
      slotId === PRIMARY_SLOT_ID && slots.length === 0
        ? PRIMARY_SLOT_ALIAS
        : slotId;
    slots.push({
      id: slotId,
      alias,
      inputId: null,
      remap: cloneRemap(createDefaultRemap(target)),
    });
  }

  const currentSlot = slots[effectiveIndex];

  let nextBinding: AnimatableBinding;
  if (!input) {
    const normalizedSlotRemap = sanitizeRemap(currentSlot.remap, target);
    const updatedRemap: RemapSettings = {
      ...normalizedSlotRemap,
      inLow: DEFAULT_INPUT_RANGE.min,
      inAnchor: DEFAULT_INPUT_ANCHOR,
      inHigh: DEFAULT_INPUT_RANGE.max,
    };
    slots[effectiveIndex] = {
      ...currentSlot,
      inputId: null,
      remap: cloneRemap(updatedRemap),
    };
    if (effectiveIndex === 0) {
      nextBinding = {
        ...base,
        inputId: null,
        remap: cloneRemap(updatedRemap),
        slots,
      };
    } else {
      nextBinding = {
        ...base,
        slots,
      };
    }
  } else {
    const normalizedRemap = sanitizeRemap(currentSlot.remap, target);
    const updatedRemap: RemapSettings = {
      ...normalizedRemap,
      inLow: input.range.min,
      inAnchor: clamp(input.defaultValue, input.range.min, input.range.max),
      inHigh: input.range.max,
      ...deriveOutputDefaults(target),
    };
    slots[effectiveIndex] = {
      ...currentSlot,
      inputId: input.id,
      remap: cloneRemap(updatedRemap),
    };

    if (effectiveIndex === 0) {
      nextBinding = {
        ...base,
        inputId: input.id,
        remap: cloneRemap(updatedRemap),
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

export function remapValue(value: number, remap: RemapSettings): number {
  const { inLow, inAnchor, inHigh, outLow, outAnchor, outHigh } = remap;
  if (Number.isNaN(value)) {
    return outAnchor;
  }
  if (value <= inAnchor) {
    const span = inAnchor - inLow;
    if (Math.abs(span) < EPSILON) {
      return outLow;
    }
    const t = (value - inLow) / span;
    return outLow + t * (outAnchor - outLow);
  }
  const span = inHigh - inAnchor;
  if (Math.abs(span) < EPSILON) {
    return outHigh;
  }
  const t = (value - inAnchor) / span;
  return outAnchor + t * (outHigh - outAnchor);
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
        const slotRemap = sanitizeRemap(slot.remap, component);
        return {
          ...slot,
          id: normalizedId,
          alias: normalizedAlias,
          remap: cloneRemap(slotRemap),
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
        remap: cloneRemap(primary.remap),
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
    remap: cloneRemap(binding.remap),
    slots: binding.slots.map((slot) => ({
      ...slot,
      remap: cloneRemap(slot.remap),
    })),
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
    remap: cloneRemap(definition.remap),
    slots: definition.slots.map((slot) => ({
      ...slot,
      remap: cloneRemap(slot.remap),
    })),
    expression: definition.expression,
    metadata: cloneBindingMetadata(definition.metadata),
  };
  return ensureBindingStructure(binding, target);
}
function sanitizeLiteral(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (Object.is(value, -0)) {
    return 0;
  }
  return value;
}

function formatVectorLiteral(values: number[]): string {
  return `vec(${values.map((value) => sanitizeLiteral(value)).join(", ")})`;
}

export function buildPiecewiseRemapExpression(
  alias: string,
  remap: RemapSettings,
): string {
  const sanitizedAlias =
    alias && alias.trim().length > 0 ? alias.trim() : PRIMARY_SLOT_ALIAS;
  const inputBreakpoints = [remap.inLow, remap.inAnchor, remap.inHigh];
  const outputBreakpoints = [remap.outLow, remap.outAnchor, remap.outHigh];
  return `piecewise_remap(${sanitizedAlias}, ${formatVectorLiteral(
    inputBreakpoints,
  )}, ${formatVectorLiteral(outputBreakpoints)})`;
}

function isSelfAlias(alias: string): boolean {
  return alias.trim().toLowerCase() === "self";
}

export function buildDefaultSlotExpression(
  alias: string,
  inputId: string | null,
  remap: RemapSettings,
): string {
  const sanitizedAlias =
    alias && alias.trim().length > 0 ? alias.trim() : PRIMARY_SLOT_ALIAS;
  if (inputId === SELF_BINDING_ID || isSelfAlias(sanitizedAlias)) {
    return sanitizedAlias;
  }
  return buildPiecewiseRemapExpression(sanitizedAlias, remap);
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
  if (!slots.length) {
    return PRIMARY_SLOT_ALIAS;
  }
  return slots
    .map((slot, index) =>
      buildDefaultSlotExpression(
        normalizeSlotAliasForExpression(slot, index),
        slot.inputId ?? null,
        slot.remap,
      ),
    )
    .join(" + ");
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
