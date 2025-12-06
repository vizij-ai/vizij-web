import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { AnimatableComponent } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import {
  addBindingSlot,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  buildCanonicalBindingExpression,
  createDefaultBinding,
  createDefaultParentBinding,
  createDefaultBindings,
  ensureBindingStructure,
  removeBindingSlot,
  updateBindingExpression,
  updateBindingSlotAlias,
  updateBindingSlotValueType,
  updateBindingWithInput,
  PRIMARY_SLOT_ALIAS,
  PRIMARY_SLOT_ID,
  type AnimatableBinding,
  type BindingMap,
  type BindingTarget,
  type BindingValueType,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID } from "@vizij/utils";

interface BindingManagerOptions {
  componentsById: Map<string, AnimatableComponent>;
  standardInputsByIdRef: MutableRefObject<Map<string, StandardRigInput>>;
  allStandardInputsRef: MutableRefObject<Map<string, StandardRigInput>>;
  maybeAutoAliasSlot: (
    binding: AnimatableBinding,
    target: BindingTarget,
    slotId: string,
    input?: StandardRigInput,
  ) => AnimatableBinding;
  debugLog: (...args: unknown[]) => void;
}

export function useBindingManager(options: BindingManagerOptions) {
  const {
    componentsById,
    standardInputsByIdRef,
    allStandardInputsRef,
    maybeAutoAliasSlot,
    debugLog,
  } = options;

  const [bindings, setBindings] = useState<BindingMap>(() =>
    createDefaultBindings([]),
  );
  const [inputBindings, setInputBindings] = useState<InputBindingMap>({});
  const inputBindingsRef = useRef<InputBindingMap>(inputBindings);

  useEffect(() => {
    inputBindingsRef.current = inputBindings;
  }, [inputBindings]);

  const aliasOnlyExpression = useCallback((binding: AnimatableBinding) => {
    const slots = binding.slots ?? [];
    if (slots.length === 0) {
      return PRIMARY_SLOT_ALIAS;
    }
    return slots
      .map((slot, index) => {
        const alias = (slot.alias || slot.id || "").trim();
        if (alias.length > 0) {
          return alias;
        }
        if (index === 0) {
          return PRIMARY_SLOT_ALIAS;
        }
        return `s${index + 1}`;
      })
      .join(" + ");
  }, []);

  const canonicalBindingExpression = useCallback(
    (binding: AnimatableBinding) => {
      const canonical = buildCanonicalBindingExpression(binding);
      if (canonical.trim().length > 0) {
        return canonical;
      }
      return aliasOnlyExpression(binding);
    },
    [aliasOnlyExpression],
  );

  const updateInputBinding = useCallback(
    (
      targetId: string,
      initializer: (target: BindingTarget) => AnimatableBinding,
      transform: (
        binding: AnimatableBinding,
        target: BindingTarget,
      ) => AnimatableBinding,
      options?: { preserveExpression?: boolean },
    ) => {
      setInputBindings((previous) => {
        const input = standardInputsByIdRef.current.get(targetId);
        if (!input) {
          debugLog("updateInputBinding: missing input metadata", {
            targetId,
          });
          return previous;
        }
        const target = bindingTargetFromInput(input);
        const current = previous[targetId] ?? initializer(target);
        const ensured = ensureBindingStructure(current, target);
        const canonicalBefore = canonicalBindingExpression(ensured);
        const aliasBefore = aliasOnlyExpression(ensured);
        const expressionBefore = (ensured.expression ?? "").trim();
        const preserveExpression = options?.preserveExpression === true;
        const expressionWasAuto =
          expressionBefore === "" ||
          expressionBefore === canonicalBefore ||
          expressionBefore === aliasBefore;
        const transformed = transform(ensured, target);
        let normalized = ensureBindingStructure(transformed, target);
        const expressionAfter = (normalized.expression ?? "").trim();
        const aliasAfter = aliasOnlyExpression(normalized);
        const canonicalFallback =
          canonicalBindingExpression(normalized) || aliasAfter;
        if (preserveExpression) {
          if (
            expressionAfter.length === 0 &&
            expressionAfter !== canonicalFallback
          ) {
            normalized = {
              ...normalized,
              expression: canonicalFallback,
            };
          }
        } else if (expressionWasAuto) {
          const canonicalAfter = canonicalBindingExpression(normalized);
          if (expressionAfter !== canonicalAfter) {
            normalized = {
              ...normalized,
              expression: canonicalAfter,
            };
          }
        }
        const hasSelfSlot =
          normalized.inputId === SELF_BINDING_ID ||
          normalized.slots.some((slot) => slot.inputId === SELF_BINDING_ID);
        const hasParents =
          (normalized.inputId && normalized.inputId !== SELF_BINDING_ID) ||
          normalized.slots.some(
            (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
          );
        const hasMultipleSlots = normalized.slots.length > 1;
        if (!hasParents && !hasSelfSlot && !hasMultipleSlots) {
          if (!previous[targetId]) {
            return previous;
          }
          const nextMap = { ...previous };
          delete nextMap[targetId];
          debugLog("updateInputBinding: removed binding (no parents)", {
            targetId,
          });
          return nextMap;
        }
        const previousBinding = previous[targetId];
        if (previousBinding) {
          const previousSignature = JSON.stringify(
            bindingToDefinition(previousBinding),
          );
          const nextSignature = JSON.stringify(bindingToDefinition(normalized));
          if (previousSignature === nextSignature) {
            return previous;
          }
        }
        debugLog("updateInputBinding: stored binding", {
          targetId,
          binding: bindingToDefinition(normalized),
        });
        return {
          ...previous,
          [targetId]: normalized,
        };
      });
    },
    [
      aliasOnlyExpression,
      canonicalBindingExpression,
      debugLog,
      standardInputsByIdRef,
    ],
  );

  const handleBindingInputChange = useCallback(
    (targetId: string, nextInputId: string | null, slotId?: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const nextInput =
        nextInputId !== null
          ? (standardInputsByIdRef.current.get(nextInputId) ??
            allStandardInputsRef.current.get(nextInputId))
          : undefined;
      setBindings((previous) => {
        const existing = previous[targetId];
        const target = bindingTargetFromComponent(component);
        const base = existing ?? createDefaultBinding(target);
        const normalized = ensureBindingStructure(base, target);
        const resolvedSlotId =
          slotId ?? normalized.slots[0]?.id ?? PRIMARY_SLOT_ID;
        const updated = updateBindingWithInput(
          normalized,
          target,
          nextInput,
          resolvedSlotId,
        );
        const aliased = maybeAutoAliasSlot(
          updated,
          target,
          resolvedSlotId,
          nextInput,
        );
        return {
          ...previous,
          [targetId]: aliased,
        };
      });
    },
    [
      allStandardInputsRef,
      componentsById,
      maybeAutoAliasSlot,
      setBindings,
      standardInputsByIdRef,
    ],
  );

  const handleAddBindingSlot = useCallback(
    (targetId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        const target = bindingTargetFromComponent(component);
        return {
          ...previous,
          [targetId]: addBindingSlot(binding, target),
        };
      });
    },
    [componentsById],
  );

  const handleRemoveBindingSlot = useCallback(
    (targetId: string, slotId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        const target = bindingTargetFromComponent(component);
        const next = removeBindingSlot(binding, target, slotId);
        if (next === binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: ensureBindingStructure(next, target),
        };
      });
    },
    [componentsById],
  );

  const handleUpdateBindingExpression = useCallback(
    (targetId: string, expression: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        const target = bindingTargetFromComponent(component);
        const next = updateBindingExpression(binding, target, expression);
        if (next === binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: next,
        };
      });
    },
    [componentsById],
  );

  const handleUpdateBindingSlotAlias = useCallback(
    (targetId: string, slotId: string, alias: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        const target = bindingTargetFromComponent(component);
        const next = updateBindingSlotAlias(binding, target, slotId, alias);
        if (next === binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: next,
        };
      });
    },
    [componentsById],
  );

  const handleBindingSlotValueTypeChange = useCallback(
    (targetId: string, slotId: string, valueType: BindingValueType) => {
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        const component = componentsById.get(targetId);
        if (!component) {
          return previous;
        }
        const target = bindingTargetFromComponent(component);
        const next = updateBindingSlotValueType(
          binding,
          target,
          slotId,
          valueType,
        );
        if (next === binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: next,
        };
      });
    },
    [componentsById],
  );

  const handleEnsureParentBinding = useCallback(
    (targetId: string) => {
      setInputBindings((previous) => {
        if (previous[targetId]) {
          return previous;
        }
        const input = standardInputsByIdRef.current.get(targetId);
        if (!input) {
          return previous;
        }
        const target = bindingTargetFromInput(input);
        const binding = createDefaultParentBinding(target);
        return {
          ...previous,
          [targetId]: binding,
        };
      });
    },
    [standardInputsByIdRef],
  );

  const handleParentBindingInputChange = useCallback(
    (targetId: string, nextInputId: string | null, slotId?: string) => {
      const input =
        nextInputId !== null
          ? (standardInputsByIdRef.current.get(nextInputId) ??
            allStandardInputsRef.current.get(nextInputId))
          : undefined;
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) => {
          const resolvedSlotId =
            slotId ?? binding.slots[0]?.id ?? PRIMARY_SLOT_ID;
          const updated = updateBindingWithInput(
            binding,
            target,
            input,
            resolvedSlotId,
          );
          return maybeAutoAliasSlot(updated, target, resolvedSlotId, input);
        },
      );
    },
    [
      allStandardInputsRef,
      maybeAutoAliasSlot,
      standardInputsByIdRef,
      updateInputBinding,
    ],
  );

  const handleParentAddBindingSlot = useCallback(
    (targetId: string) => {
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) => addBindingSlot(binding, target),
      );
    },
    [updateInputBinding],
  );

  const handleParentRemoveBindingSlot = useCallback(
    (targetId: string, slotId: string) => {
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) => removeBindingSlot(binding, target, slotId),
      );
    },
    [updateInputBinding],
  );

  const handleParentBindingExpressionChange = useCallback(
    (targetId: string, expression: string) => {
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) =>
          updateBindingExpression(binding, target, expression),
        { preserveExpression: true },
      );
    },
    [updateInputBinding],
  );

  const handleParentBindingSlotAliasChange = useCallback(
    (targetId: string, slotId: string, alias: string) => {
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) =>
          updateBindingSlotAlias(binding, target, slotId, alias),
      );
    },
    [updateInputBinding],
  );

  const handleParentBindingSlotValueTypeChange = useCallback(
    (targetId: string, slotId: string, valueType: BindingValueType) => {
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) =>
          updateBindingSlotValueType(
            binding,
            target,
            slotId ?? binding.slots[0]?.id ?? PRIMARY_SLOT_ID,
            valueType,
          ),
      );
    },
    [updateInputBinding],
  );

  const handleParentResetBinding = useCallback((targetId: string) => {
    setInputBindings((previous) => {
      if (!previous[targetId]) {
        return previous;
      }
      const next = { ...previous };
      delete next[targetId];
      return next;
    });
  }, []);

  const handleCreateParentDriverBinding = useCallback(
    (targetId: string, upstreamId: string) => {
      const upstreamInput =
        standardInputsByIdRef.current.get(upstreamId) ??
        allStandardInputsRef.current.get(upstreamId);
      if (!upstreamInput) {
        return;
      }
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) => {
          let working = binding;
          let availableSlot = working.slots.find(
            (slot, index) => index !== 0 && slot.inputId === null,
          );
          if (!availableSlot) {
            working = addBindingSlot(working, target);
            availableSlot = working.slots[working.slots.length - 1];
          }
          const updated = updateBindingWithInput(
            working,
            target,
            upstreamInput,
            availableSlot.id,
          );
          return maybeAutoAliasSlot(
            updated,
            target,
            availableSlot.id,
            upstreamInput,
          );
        },
      );
    },
    [
      allStandardInputsRef,
      standardInputsByIdRef,
      updateInputBinding,
      maybeAutoAliasSlot,
    ],
  );

  const handleResetBinding = useCallback(
    (targetId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const target = bindingTargetFromComponent(component);
      setBindings((previous) => {
        if (!previous[targetId]) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: createDefaultBinding(target),
        };
      });
    },
    [componentsById],
  );

  const applyBindingPatch = useCallback(
    (updater: (bindings: BindingMap) => BindingMap) => {
      setBindings((previous) => {
        const next = updater(previous);
        return next === previous ? previous : next;
      });
    },
    [setBindings],
  );

  const applyInputBindingPatch = useCallback(
    (updater: (bindings: InputBindingMap) => InputBindingMap) => {
      setInputBindings((previous) => {
        const next = updater(previous);
        return next === previous ? previous : next;
      });
    },
    [setInputBindings],
  );

  return {
    bindings,
    setBindings,
    applyBindingPatch,
    applyInputBindingPatch,
    inputBindings,
    setInputBindings,
    inputBindingsRef,
    updateInputBinding,
    handleBindingInputChange,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleBindingSlotValueTypeChange,
    handleResetBinding,
    handleEnsureParentBinding,
    handleParentBindingInputChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentResetBinding,
    handleCreateParentDriverBinding,
  };
}
