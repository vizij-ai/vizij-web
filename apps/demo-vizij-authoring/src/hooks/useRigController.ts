import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useVizijStore,
  useVizijStoreSetter,
  type Selection,
  type VizijData,
  type Group,
  type World,
} from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import { getLookup } from "@vizij/utils";
import {
  extractAnimatableComponents,
  buildAnimatableValue,
  type ComponentOverrideMap,
  type AnimatableComponent as AnimComponent,
} from "@vizij/utils";
import {
  createDefaultBindings,
  createDefaultInputValues,
  reconcileBindings,
  updateBindingWithInput,
  remapValue,
  createDefaultRemap,
  type BindingMap,
  type AnimatableBinding,
  type StandardInputValues,
  type RemapSettings,
} from "../rig/state";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import { loadRigState, saveRigState } from "../rig/persistence";
import { deriveAutoFaceId, sanitizeFaceId } from "../utils/faceId";
import { cloneRawValue, rawValuesEqual } from "@vizij/utils";
import { alertDialog } from "../utils/dialogs";

interface UseRigControllerOptions {
  namespace: string;
  rootId: string | null;
  sourceName: string | null;
}

type AnimatableComponent = AnimComponent;

export interface RigController {
  faceId: string;
  setFaceId: (next: string) => void;
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  inputValues: StandardInputValues;
  bindings: BindingMap;
  animatableComponents: AnimatableComponent[];
  componentsById: Map<string, AnimatableComponent>;
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  selectionStack: Selection[];
  inputRanges: Map<string, { min: number; max: number }>;
  handleInputValueChange: (inputId: string, value: number) => void;
  handleBindingInputChange: (targetId: string, inputId: string | null) => void;
  handleBindingRemapChange: (
    targetId: string,
    field: keyof RemapSettings,
    value: number,
  ) => void;
  handleResetBinding: (targetId: string) => void;
  handleCreateStandardInput: (path: string) => StandardRigInput | null;
  handleUpdateStandardInput: (
    inputId: string,
    updates: { path?: string; label?: string },
  ) => void;
  handleDeleteStandardInput: (inputId: string) => void;
  handleFaceIdChange: (value: string) => void;
  handleFocusSelectionIndex: (index: number) => void;
  handleClearSelection: () => void;
  setStoreState: ReturnType<typeof useVizijStoreSetter>;
  collectAnimatableExportState: () => {
    appliedOverrides: boolean;
    nextAnimatables: Record<string, AnimatableValue>;
    nextValues: Map<string, RawValue | undefined>;
    effectiveAnimatables: Record<string, AnimatableValue>;
  };
}

export function useRigController({
  namespace,
  rootId,
  sourceName,
}: UseRigControllerOptions): RigController {
  const world = useVizijStore((state) => state.world) as World;
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const values = useVizijStore((state) => state.values);
  const elementSelection = useVizijStore((state) => state.elementSelection);
  const clearSelection = useVizijStore((state) => state.clearSelection);
  const setStoreState = useVizijStoreSetter();

  const [faceId, setFaceIdState] = useState<string>("robot");
  const [standardInputs, setStandardInputs] = useState<StandardRigInput[]>([]);
  const [inputValues, setInputValues] = useState<StandardInputValues>(() =>
    createDefaultInputValues(),
  );
  const [bindings, setBindings] = useState<BindingMap>(() =>
    createDefaultBindings([]),
  );

  const drivenAnimatablesRef = useRef<Set<string>>(new Set());
  const lastAutoFaceIdRef = useRef<string | null>(null);
  const lastLoadedFaceIdRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);

  const animatableComponents = useMemo(
    () => extractAnimatableComponents(animatables),
    [animatables],
  );

  const componentsById = useMemo(
    () =>
      new Map<string, AnimatableComponent>(
        animatableComponents.map((component) => [component.id, component]),
      ),
    [animatableComponents],
  );

  const standardInputsById = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const rootRenderable = useMemo(() => {
    return rootId ? (world[rootId] as Group | undefined) : undefined;
  }, [rootId, world]);

  useEffect(() => {
    setInputValues((previous) => {
      let changed = false;
      const next: StandardInputValues = {};
      standardInputs.forEach((input) => {
        if (Object.prototype.hasOwnProperty.call(previous, input.id)) {
          next[input.id] = previous[input.id];
        } else {
          next[input.id] = input.defaultValue;
          changed = true;
        }
      });
      if (Object.keys(previous).length !== standardInputs.length || changed) {
        return next;
      }
      return previous;
    });
  }, [standardInputs]);

  useEffect(() => {
    const validIds = new Set(standardInputs.map((input) => input.id));
    setBindings((previous) => {
      let changed = false;
      const next: BindingMap = {};
      Object.entries(previous).forEach(([key, binding]) => {
        if (!binding) {
          return;
        }
        next[key] = binding;
        if (binding.inputId && !validIds.has(binding.inputId)) {
          const component = componentsById.get(key);
          next[key] = {
            targetId: binding.targetId,
            inputId: null,
            remap: component ? createDefaultRemap(component) : binding.remap,
          };
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [componentsById, standardInputs]);

  const handleInputValueChange = useCallback(
    (inputId: string, value: number) => {
      setInputValues((previous) => ({
        ...previous,
        [inputId]: value,
      }));
    },
    [],
  );

  const handleBindingInputChange = useCallback(
    (targetId: string, nextInputId: string | null) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const inputMeta =
        nextInputId !== null ? standardInputsById.get(nextInputId) : undefined;
      setBindings((previous) => {
        const fallback: AnimatableBinding = {
          targetId,
          inputId: null,
          remap: createDefaultRemap(component),
        };
        const current = previous[targetId] ?? fallback;
        const updated = updateBindingWithInput(current, component, inputMeta);
        if (updated === current) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: updated,
        };
      });
    },
    [componentsById, standardInputsById],
  );

  const handleBindingRemapChange = useCallback(
    (targetId: string, field: keyof RemapSettings, value: number) => {
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: {
            ...binding,
            remap: {
              ...binding.remap,
              [field]: value,
            },
          },
        };
      });
    },
    [],
  );

  const handleResetBinding = useCallback(
    (targetId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      setBindings((previous) => {
        if (!previous[targetId]) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: {
            targetId,
            inputId: null,
            remap: createDefaultRemap(component),
          },
        };
      });
    },
    [componentsById],
  );

  const handleCreateStandardInput = useCallback(
    (path: string): StandardRigInput | null => {
      let createdInput: StandardRigInput | null = null;
      setStandardInputs((previous) => {
        const existingIds = new Set(previous.map((input) => input.id));
        let candidate = createStandardRigInputFromPath(path);
        if (existingIds.has(candidate.id)) {
          const baseSegments = candidate.path
            .split("/")
            .filter((segment) => segment.length > 0);
          const targetIndex =
            baseSegments.length > 0 ? baseSegments.length - 1 : 0;
          const baseLeaf =
            baseSegments[targetIndex] ??
            (candidate.id ? candidate.id.replace(/^_+/, "") : "input");
          let suffix = 2;
          let resolved = candidate;
          while (existingIds.has(resolved.id)) {
            const nextSegments =
              baseSegments.length > 0 ? baseSegments.slice() : [baseLeaf];
            nextSegments[targetIndex] = `${baseLeaf}_${suffix}`;
            const nextPath = `/${nextSegments.join("/")}`;
            resolved = createStandardRigInputFromPath(nextPath);
            suffix += 1;
          }
          candidate = resolved;
        }
        createdInput = candidate;
        setInputValues((prev) => ({
          ...prev,
          [candidate.id]: candidate.defaultValue,
        }));
        return [...previous, candidate];
      });
      return createdInput;
    },
    [],
  );

  const handleUpdateStandardInput = useCallback(
    (inputId: string, updates: { path?: string; label?: string }) => {
      setStandardInputs((previous) => {
        const index = previous.findIndex((input) => input.id === inputId);
        if (index === -1) {
          return previous;
        }
        const current = previous[index];
        if (updates.path !== undefined && !updates.path.trim()) {
          alertDialog("Path cannot be empty.");
          return previous;
        }
        const requestedPath =
          updates.path !== undefined ? updates.path : current.path;
        const normalizedPath = normalizeStandardRigInputPath(requestedPath);
        const isPathChanged = normalizedPath !== current.path;
        if (
          isPathChanged &&
          previous.some(
            (input, idx) => idx !== index && input.path === normalizedPath,
          )
        ) {
          alertDialog(
            `Another standard input already uses the path "${normalizedPath}".`,
          );
          return previous;
        }
        const trimmedLabel =
          updates.label !== undefined ? updates.label.trim() : undefined;
        const nextLabel =
          trimmedLabel && trimmedLabel.length > 0
            ? trimmedLabel
            : updates.label !== undefined
              ? deriveLabelFromNormalizedPath(normalizedPath)
              : current.label;
        const nextGroup = deriveGroupFromNormalizedPath(normalizedPath);
        const updated = createStandardRigInput({
          id: current.id,
          path: normalizedPath,
          label: nextLabel,
          group: nextGroup,
          defaultValue: current.defaultValue,
          range: {
            min: current.range.min,
            max: current.range.max,
          },
        });
        const next = previous.slice();
        next[index] = updated;
        return next;
      });
    },
    [],
  );

  const handleDeleteStandardInput = useCallback((inputId: string) => {
    setStandardInputs((previous) =>
      previous.filter((input) => input.id !== inputId),
    );
  }, []);

  const setFaceId = useCallback((next: string) => {
    setFaceIdState(sanitizeFaceId(next));
  }, []);

  const handleFaceIdChange = setFaceId;

  const handleFocusSelectionIndex = useCallback(
    (index: number) => {
      setStoreState((state: VizijData) => {
        const current = state.elementSelection ?? [];
        if (index <= 0 || index >= current.length) {
          return {};
        }
        const next = current.slice();
        const [selected] = next.splice(index, 1);
        next.unshift(selected);
        return { elementSelection: next };
      });
    },
    [setStoreState],
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    setBindings((previous) =>
      reconcileBindings(previous, animatableComponents),
    );
  }, [animatableComponents]);

  useEffect(() => {
    if (!faceId) {
      return;
    }
    if (lastLoadedFaceIdRef.current === faceId) {
      return;
    }
    const persisted = loadRigState(faceId);
    skipPersistRef.current = true;
    if (persisted) {
      const storedInputs =
        persisted.standardInputs?.map((input) =>
          createStandardRigInput(input),
        ) ?? [];
      setStandardInputs(storedInputs);
      setInputValues(persisted.inputValues);
      setBindings(reconcileBindings(persisted.bindings, animatableComponents));
    } else {
      setStandardInputs([]);
      setInputValues(createDefaultInputValues());
      setBindings(createDefaultBindings(animatableComponents));
    }
    setTimeout(() => {
      skipPersistRef.current = false;
    }, 0);
    lastLoadedFaceIdRef.current = faceId;
  }, [animatableComponents, faceId]);

  useEffect(() => {
    if (
      !faceId ||
      skipPersistRef.current ||
      animatableComponents.length === 0
    ) {
      return;
    }
    saveRigState({
      faceId,
      bindings,
      inputValues,
      standardInputs,
    });
  }, [animatableComponents, bindings, faceId, inputValues, standardInputs]);

  useEffect(() => {
    const auto = deriveAutoFaceId(sourceName, rootRenderable);
    if (!auto) {
      return;
    }
    if (
      lastAutoFaceIdRef.current === null ||
      faceId === lastAutoFaceIdRef.current ||
      !faceId
    ) {
      setFaceId(auto);
    }
    lastAutoFaceIdRef.current = auto;
  }, [faceId, rootRenderable, setFaceId, sourceName]);

  useEffect(() => {
    const overrides = new Map<string, ComponentOverrideMap | number>();
    animatableComponents.forEach((component) => {
      const binding = bindings[component.id];
      if (!binding || !binding.inputId) {
        return;
      }
      const inputMeta = standardInputsById.get(binding.inputId);
      const sourceValue =
        inputValues[binding.inputId] ?? inputMeta?.defaultValue ?? 0;
      const outputValue = remapValue(sourceValue, binding.remap);
      const existing = overrides.get(component.animatableId);
      if (component.component) {
        const nextOverrides: ComponentOverrideMap =
          existing && typeof existing !== "number" ? { ...existing } : {};
        nextOverrides[component.component] = outputValue;
        overrides.set(component.animatableId, nextOverrides);
      } else {
        overrides.set(component.animatableId, outputValue);
      }
    });

    const nextDriven = new Set<string>();
    overrides.forEach((override, animId) => {
      const animatable = animatables[animId];
      if (!animatable) {
        return;
      }
      const rawValue = buildAnimatableValue(animatable, override);
      setValue(animId, namespace, rawValue);
      nextDriven.add(animId);
    });

    drivenAnimatablesRef.current.forEach((animId) => {
      if (nextDriven.has(animId)) {
        return;
      }
      const animatable = animatables[animId];
      if (!animatable) {
        return;
      }
      const resetValue = buildAnimatableValue(animatable, undefined);
      setValue(animId, namespace, resetValue);
    });

    drivenAnimatablesRef.current = nextDriven;
  }, [
    animatableComponents,
    animatables,
    bindings,
    inputValues,
    namespace,
    setValue,
    standardInputsById,
  ]);

  const collectAnimatableExportState = useCallback(() => {
    const nextAnimatables = { ...animatables };
    const nextValues = new Map(values);
    let appliedOverrides = false;

    for (const [animId, animatable] of Object.entries(animatables)) {
      const lookupKey = getLookup(namespace, animId);
      if (!nextValues.has(lookupKey)) {
        continue;
      }
      appliedOverrides = true;
      const override = nextValues.get(lookupKey);
      nextValues.delete(lookupKey);
      if (override !== undefined) {
        const overrideClone = cloneRawValue(override);
        if (!rawValuesEqual(animatable.default as RawValue, overrideClone)) {
          nextAnimatables[animId] = {
            ...animatable,
            default: overrideClone as unknown as typeof animatable.default,
          } as AnimatableValue;
        }
      }
    }

    return {
      appliedOverrides,
      nextAnimatables,
      nextValues,
      effectiveAnimatables: appliedOverrides ? nextAnimatables : animatables,
    };
  }, [animatables, namespace, values]);

  const inputRanges = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>();
    standardInputs.forEach((input) => {
      map.set(input.id, { min: input.range.min, max: input.range.max });
    });
    Object.values(bindings).forEach((binding) => {
      if (!binding || !binding.inputId) {
        return;
      }
      const rangeMin = Math.min(binding.remap.inLow, binding.remap.inHigh);
      const rangeMax = Math.max(binding.remap.inLow, binding.remap.inHigh);
      const current = map.get(binding.inputId);
      if (current) {
        current.min = Math.min(current.min, rangeMin);
        current.max = Math.max(current.max, rangeMax);
      } else {
        map.set(binding.inputId, { min: rangeMin, max: rangeMax });
      }
    });
    return map;
  }, [bindings, standardInputs]);

  return {
    faceId,
    setFaceId,
    standardInputs,
    standardInputsById,
    inputValues,
    bindings,
    animatableComponents,
    componentsById,
    world,
    animatables,
    values,
    selectionStack: elementSelection,
    inputRanges,
    handleInputValueChange,
    handleBindingInputChange,
    handleBindingRemapChange,
    handleResetBinding,
    handleCreateStandardInput,
    handleUpdateStandardInput,
    handleDeleteStandardInput,
    handleFaceIdChange,
    handleFocusSelectionIndex,
    handleClearSelection,
    setStoreState,
    collectAnimatableExportState,
  };
}
