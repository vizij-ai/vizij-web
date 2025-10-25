import type { StandardRigInput } from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";

export interface RemapSettings {
  inLow: number;
  inAnchor: number;
  inHigh: number;
  outLow: number;
  outAnchor: number;
  outHigh: number;
}

export interface AnimatableBindingSlot {
  id: string;
  alias: string;
  inputId: string | null;
  remap: RemapSettings;
}

export interface AnimatableBinding {
  targetId: string;
  inputId: string | null;
  remap: RemapSettings;
  slots: AnimatableBindingSlot[];
  expression: string;
}

export type BindingMap = Record<string, AnimatableBinding>;

export type StandardInputValues = Record<string, number>;

const DEFAULT_INPUT_RANGE = { min: -1, max: 1 };
const DEFAULT_INPUT_ANCHOR = 0;

const EPSILON = 1e-6;
const LEGACY_SLOT_PATTERN = /^slot_(\d+)$/i;

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

function rewriteLegacyExpression(
  expression: string,
  replacements: Map<string, string>,
): string {
  if (replacements.size === 0 || expression.trim().length === 0) {
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

function deriveOutputDefaults(component: AnimatableComponent): {
  outLow: number;
  outAnchor: number;
  outHigh: number;
} {
  const { min, max } = component.range;
  const anchor = clamp(component.defaultValue, min, max);
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
  component: AnimatableComponent,
): RemapSettings {
  const inputDefaults = deriveInputDefaults();
  const outputDefaults = deriveOutputDefaults(component);
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
  component: AnimatableComponent,
): RemapSettings {
  if (!remap) {
    return createDefaultRemap(component);
  }
  return migrateLegacyRemap(remap, component);
}

function cloneRemap(remap: RemapSettings): RemapSettings {
  return {
    inLow: remap.inLow,
    inAnchor: remap.inAnchor,
    inHigh: remap.inHigh,
    outLow: remap.outLow,
    outAnchor: remap.outAnchor,
    outHigh: remap.outHigh,
  };
}

function sanitizeRemap(
  remap: RemapSettings | LegacyRemapSettings | undefined,
  component: AnimatableComponent,
): RemapSettings {
  const normalized = normalizeRemap(remap, component);
  const outputDefaults = deriveOutputDefaults(component);
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

export function createDefaultRemap(
  component: AnimatableComponent,
): RemapSettings {
  const inputDefaults = deriveInputDefaults();
  const outputDefaults = deriveOutputDefaults(component);
  return {
    inLow: inputDefaults.inLow,
    inAnchor: inputDefaults.inAnchor,
    inHigh: inputDefaults.inHigh,
    outLow: outputDefaults.outLow,
    outAnchor: outputDefaults.outAnchor,
    outHigh: outputDefaults.outHigh,
  };
}

export function createDefaultBindings(
  components: AnimatableComponent[],
): BindingMap {
  const bindings: BindingMap = {};
  components.forEach((component) => {
    bindings[component.id] = createDefaultBinding(component);
  });
  return bindings;
}

export function createDefaultBinding(
  component: AnimatableComponent,
): AnimatableBinding {
  const remap = createDefaultRemap(component);
  return {
    targetId: component.id,
    inputId: null,
    remap,
    slots: [
      {
        id: PRIMARY_SLOT_ID,
        alias: PRIMARY_SLOT_ALIAS,
        inputId: null,
        remap: cloneRemap(remap),
      },
    ],
    expression: PRIMARY_SLOT_ALIAS,
  };
}

function ensurePrimarySlot(
  binding: AnimatableBinding,
  component: AnimatableComponent,
): AnimatableBinding {
  const normalizedBindingRemap = sanitizeRemap(binding.remap, component);
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
        (index === 0 ? normalizedBindingRemap : createDefaultRemap(component));
      const normalizedSlotRemap = sanitizeRemap(slotRemapSource, component);
      const inputId =
        slot.inputId !== undefined && slot.inputId !== null
          ? slot.inputId
          : index === 0
            ? (binding.inputId ?? null)
            : null;
      return {
        id: normalizedId,
        alias: normalizedAlias,
        inputId,
        remap: cloneRemap(normalizedSlotRemap),
      };
    },
  );

  const primary = normalizedSlots[0];
  const primaryRemap = sanitizeRemap(primary.remap, component);
  normalizedSlots[0] = {
    ...primary,
    id: primary.id || PRIMARY_SLOT_ID,
    alias: primary.alias || PRIMARY_SLOT_ALIAS,
    inputId: primary.inputId ?? binding.inputId ?? null,
    remap: cloneRemap(primaryRemap),
  };
  normalizedSlots.slice(1).forEach((slot, index) => {
    const slotRemap = sanitizeRemap(slot.remap, component);
    normalizedSlots[index + 1] = {
      ...slot,
      id: slot.id || defaultSlotId(index + 1),
      alias: slot.alias || defaultSlotId(index + 1),
      remap: cloneRemap(slotRemap),
    };
  });

  const rawExpression =
    typeof binding.expression === "string" ? binding.expression.trim() : "";
  let expression =
    rawExpression.length > 0 ? rawExpression : normalizedSlots[0].alias;
  expression = rewriteLegacyExpression(expression, aliasReplacements);

  return {
    ...binding,
    inputId: normalizedSlots[0].inputId ?? null,
    remap: cloneRemap(primaryRemap),
    slots: normalizedSlots,
    expression,
  };
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
  component: AnimatableComponent,
): AnimatableBinding {
  return ensurePrimarySlot(binding, component);
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
  component: AnimatableComponent,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, component);
  const nextIndex = base.slots.length + 1;
  const slotId = defaultSlotId(nextIndex - 1);
  const alias = slotId;
  const remap = createDefaultRemap(component);
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
    component,
  );
}

export function removeBindingSlot(
  binding: AnimatableBinding,
  component: AnimatableComponent,
  slotId: string,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, component);
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
    component,
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

export function updateBindingExpression(
  binding: AnimatableBinding,
  component: AnimatableComponent,
  expression: string,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, component);
  const trimmed = expression.trim();
  return {
    ...base,
    expression:
      trimmed.length > 0
        ? trimmed
        : (base.slots[0]?.alias ?? PRIMARY_SLOT_ALIAS),
  };
}

export function updateBindingSlotRemap(
  binding: AnimatableBinding,
  component: AnimatableComponent,
  slotId: string,
  field: keyof RemapSettings,
  value: number,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, component);
  const nextSlots = base.slots.map((slot) => {
    if (slot.id !== slotId) {
      return slot;
    }
    const updatedRemap: RemapSettings = {
      ...slot.remap,
      [field]: value,
    } as RemapSettings;
    const sanitized = sanitizeRemap(updatedRemap, component);
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
    component,
  );
  if (updated.slots[0]?.id === slotId) {
    updated.remap = {
      ...updated.remap,
      [field]: value,
    };
  }
  return updated;
}

export function updateBindingWithInput(
  binding: AnimatableBinding,
  component: AnimatableComponent,
  input: StandardRigInput | undefined,
  slotId: string = PRIMARY_SLOT_ID,
): AnimatableBinding {
  const base = ensurePrimarySlot(binding, component);
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
      remap: cloneRemap(createDefaultRemap(component)),
    });
  }

  const currentSlot = slots[effectiveIndex];

  if (!input) {
    const normalizedSlotRemap = sanitizeRemap(currentSlot.remap, component);
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
      return {
        ...base,
        inputId: null,
        remap: cloneRemap(updatedRemap),
        slots,
      };
    }
    return {
      ...base,
      slots,
    };
  }

  const normalizedRemap = sanitizeRemap(currentSlot.remap, component);
  const updatedRemap: RemapSettings = {
    ...normalizedRemap,
    inLow: input.range.min,
    inAnchor: clamp(input.defaultValue, input.range.min, input.range.max),
    inHigh: input.range.max,
    ...deriveOutputDefaults(component),
  };
  slots[effectiveIndex] = {
    ...currentSlot,
    inputId: input.id,
    remap: cloneRemap(updatedRemap),
  };

  if (effectiveIndex === 0) {
    return {
      ...base,
      inputId: input.id,
      remap: cloneRemap(updatedRemap),
      slots,
    };
  }

  return {
    ...base,
    slots,
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
  components: AnimatableComponent[],
): BindingMap {
  const next: BindingMap = {};
  components.forEach((component) => {
    const existing = previous[component.id];
    if (existing) {
      const ensured = ensurePrimarySlot(existing, component);
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
