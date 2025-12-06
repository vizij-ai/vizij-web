import type { BuildGraphResult, BindingMap } from "@vizij/node-graph-authoring";
import {
  addBindingSlot,
  buildRigGraphSpec,
  bindingTargetFromComponent,
  createDefaultBinding,
  updateBindingSlotAlias,
  updateBindingSlotValueType,
  updateBindingWithInput,
  updateBindingExpression,
} from "@vizij/node-graph-authoring";
import type {
  AnimatableComponent,
  AnimatableNumber,
  BindingValueType,
  StandardRigInput,
} from "@vizij/utils";
import {
  applyStandardInputPathPrefix,
  deriveStandardRigInputIdFromPath,
} from "@vizij/utils";

export type ExpressionSlotConfig = {
  id?: string;
  alias?: string;
  label?: string;
  path?: string;
  group?: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  valueType?: BindingValueType;
};

export interface ExpressionGraphOptions {
  expression: string;
  slots: ExpressionSlotConfig[];
  faceId?: string;
  animatableName?: string;
  animatableId?: string;
  outputRange?: { min?: number; max?: number };
}

export interface ExpressionGraphResult extends BuildGraphResult {
  inputs: StandardRigInput[];
}

function sanitizeIdentifier(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/_{2,}/g, "_");
  const candidate = normalized.replace(/^_+/, "");
  return candidate || fallback;
}

function coerceNumber(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function buildExpressionGraph(
  options: ExpressionGraphOptions,
): ExpressionGraphResult {
  const trimmedExpression = options.expression?.trim() ?? "";
  if (!trimmedExpression) {
    throw new Error("Expression cannot be empty.");
  }
  if (!Array.isArray(options.slots) || options.slots.length === 0) {
    throw new Error("Add at least one slot before building the graph.");
  }

  const normalizedInputs: StandardRigInput[] = options.slots.map(
    (slot, index) => {
      const fallbackAlias = `s${index + 1}`;
      const alias = slot.alias?.trim().length
        ? slot.alias.trim()
        : fallbackAlias;
      const path = applyStandardInputPathPrefix(
        slot.path && slot.path.trim().length > 0
          ? slot.path
          : `/expression/${alias.toLowerCase()}`,
      );
      const idCandidate =
        slot.id?.trim() || deriveStandardRigInputIdFromPath(path);
      const id = sanitizeIdentifier(
        idCandidate,
        `${fallbackAlias}_${index + 1}`,
      );
      const label = slot.label?.trim().length ? slot.label.trim() : alias;
      const group = slot.group?.trim().length
        ? slot.group.trim()
        : "expression";
      return {
        id,
        path,
        label,
        group,
        defaultValue: coerceNumber(slot.defaultValue, 0),
        range: {
          min: coerceNumber(slot.min, -1),
          max: coerceNumber(slot.max, 1),
        },
        derivedChildren: [],
      } satisfies StandardRigInput;
    },
  );

  const inputsById = new Map(
    normalizedInputs.map((input) => [input.id, input]),
  );

  const animatableName = options.animatableName?.trim() ?? "Expression Output";
  const animatableId = sanitizeIdentifier(
    options.animatableId ?? animatableName.toLowerCase(),
    "expression_output",
  );

  const rangeMin = coerceNumber(options.outputRange?.min, -1);
  const rangeMax = coerceNumber(options.outputRange?.max, 1);

  const animatable: AnimatableNumber = {
    id: animatableId,
    name: animatableName,
    type: "number",
    default: 0,
    constraints: {
      min: rangeMin,
      max: rangeMax,
    },
  };

  const component: AnimatableComponent = {
    id: `${animatableId}_component`,
    safeId: `${animatableId}_component`,
    animatableId: animatable.id,
    animatableType: animatable.type,
    label: animatableName,
    defaultValue: 0,
    range: {
      min: rangeMin,
      max: rangeMax,
    },
  };

  const target = bindingTargetFromComponent(component);
  let binding = createDefaultBinding(target);

  normalizedInputs.forEach((input, index) => {
    if (index >= binding.slots.length) {
      binding = addBindingSlot(binding, target);
    }
    const slot = binding.slots[index];
    const slotId = slot?.id ?? `s${index + 1}`;
    const alias = options.slots[index]?.alias ?? input.label;
    if (alias) {
      binding = updateBindingSlotAlias(binding, target, slotId, alias);
    }
    binding = updateBindingWithInput(binding, target, input, slotId);
    const requestedType = options.slots[index]?.valueType;
    if (requestedType) {
      binding = updateBindingSlotValueType(
        binding,
        target,
        slotId,
        requestedType,
      );
    }
  });

  binding = updateBindingExpression(binding, target, trimmedExpression);

  const bindings: BindingMap = {
    [component.id]: binding,
  };

  const result = buildRigGraphSpec({
    faceId: options.faceId?.trim().length ? options.faceId : "demo-face",
    animatables: { [animatable.id]: animatable },
    components: [component],
    bindings,
    inputsById,
    inputBindings: {},
  });

  return {
    ...result,
    inputs: normalizedInputs,
  };
}
