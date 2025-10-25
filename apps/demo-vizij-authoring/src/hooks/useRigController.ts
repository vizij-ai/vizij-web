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
import {
  loadRigState,
  saveRigState,
  type PersistedAutoStandardInput,
} from "../rig/persistence";
import { deriveAutoFaceId, sanitizeFaceId } from "../utils/faceId";
import { cloneRawValue, rawValuesEqual } from "@vizij/utils";
import { alertDialog } from "../utils/dialogs";
import {
  buildAutoRigInputBlueprints,
  type AutoRigInputBlueprintMetadata,
} from "../rig/autoInputs";

interface UseRigControllerOptions {
  namespace: string;
  rootId: string | null;
  sourceName: string | null;
}

type AnimatableComponent = AnimComponent;

type ManagedStandardInputSource = "auto" | "custom";

export interface ManagedStandardInput {
  input: StandardRigInput;
  source: ManagedStandardInputSource;
  disabled: boolean;
  metadata?: AutoRigInputBlueprintMetadata;
}

interface AutoInputState {
  input: StandardRigInput;
  disabled: boolean;
  metadata: AutoRigInputBlueprintMetadata;
  generatedLabel: string;
  generatedDefaultValue: number;
  generatedRange: { min: number; max: number };
}

export interface RigController {
  faceId: string;
  setFaceId: (next: string) => void;
  managedStandardInputs: ManagedStandardInput[];
  standardInputRoots: string[];
  selectedStandardInputRoots: string[];
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
  handleToggleStandardInput: (path: string, enabled: boolean) => void;
  handleCreateCustomStandardInput: (path: string) => StandardRigInput | null;
  handleUpdateStandardInput: (
    inputId: string,
    updates: { path?: string; label?: string },
  ) => void;
  handleDeleteCustomStandardInput: (inputId: string) => void;
  handleSelectStandardInputRoots: (roots: string[]) => void;
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
  const [autoInputs, setAutoInputs] = useState<Map<string, AutoInputState>>(
    () => new Map(),
  );
  const autoInputsRef = useRef(autoInputs);
  const [customInputs, setCustomInputs] = useState<StandardRigInput[]>([]);
  const [selectedStandardInputRoots, setSelectedStandardInputRoots] = useState<
    string[]
  >([]);
  const [inputValues, setInputValues] = useState<StandardInputValues>({});
  const [bindings, setBindings] = useState<BindingMap>(() =>
    createDefaultBindings([]),
  );

  const persistedAutoInputsRef = useRef<
    Map<string, PersistedAutoStandardInput>
  >(new Map());

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

  const autoBlueprintResult = useMemo(() => {
    return buildAutoRigInputBlueprints(
      world,
      animatables,
      animatableComponents,
    );
  }, [animatableComponents, animatables, world]);

  const autoBlueprints = autoBlueprintResult.blueprints;
  const standardInputRoots = autoBlueprintResult.roots;
  const componentPathMap = autoBlueprintResult.componentPathMap;

  const componentPathMapRef = useRef(componentPathMap);

  useEffect(() => {
    componentPathMapRef.current = componentPathMap;
  }, [componentPathMap]);

  const componentsByIdRef = useRef(componentsById);

  useEffect(() => {
    componentsByIdRef.current = componentsById;
  }, [componentsById]);

  useEffect(() => {
    setAutoInputs((previous) => {
      const next = new Map<string, AutoInputState>();
      const persisted = persistedAutoInputsRef.current;

      autoBlueprints.forEach((blueprint) => {
        const existing = previous.get(blueprint.path);
        const persistedEntry = persisted.get(blueprint.path);
        const disabled =
          existing?.disabled ?? persistedEntry?.disabled ?? false;

        if (existing) {
          const labelMatchesGenerated =
            existing.input.label === existing.generatedLabel;
          const rangeMatchesGenerated =
            existing.input.range.min === existing.generatedRange.min &&
            existing.input.range.max === existing.generatedRange.max;
          const defaultMatchesGenerated =
            existing.input.defaultValue === existing.generatedDefaultValue;

          const nextLabel = labelMatchesGenerated
            ? (persistedEntry?.label ?? blueprint.input.label)
            : existing.input.label;
          const nextDefaultValue = defaultMatchesGenerated
            ? (persistedEntry?.defaultValue ?? blueprint.input.defaultValue)
            : existing.input.defaultValue;
          const persistedRangeMin =
            persistedEntry?.range?.min ?? blueprint.input.range.min;
          const persistedRangeMax =
            persistedEntry?.range?.max ?? blueprint.input.range.max;
          const nextRangeMin = rangeMatchesGenerated
            ? persistedRangeMin
            : existing.input.range.min;
          const nextRangeMax = rangeMatchesGenerated
            ? persistedRangeMax
            : existing.input.range.max;

          const updatedInput = createStandardRigInput({
            id: existing.input.id,
            path: blueprint.input.path,
            label: nextLabel,
            group: blueprint.input.group,
            defaultValue: nextDefaultValue,
            range: {
              min: nextRangeMin,
              max: nextRangeMax,
            },
          });

          next.set(blueprint.path, {
            input: updatedInput,
            disabled,
            metadata: blueprint.metadata,
            generatedLabel: blueprint.input.label,
            generatedDefaultValue: blueprint.input.defaultValue,
            generatedRange: {
              min: blueprint.input.range.min,
              max: blueprint.input.range.max,
            },
          });
        } else {
          const input = createStandardRigInput({
            id: blueprint.input.id,
            path: blueprint.input.path,
            label: persistedEntry?.label ?? blueprint.input.label,
            group: blueprint.input.group,
            defaultValue:
              persistedEntry?.defaultValue ?? blueprint.input.defaultValue,
            range: {
              min: persistedEntry?.range?.min ?? blueprint.input.range.min,
              max: persistedEntry?.range?.max ?? blueprint.input.range.max,
            },
          });

          next.set(blueprint.path, {
            input,
            disabled,
            metadata: blueprint.metadata,
            generatedLabel: blueprint.input.label,
            generatedDefaultValue: blueprint.input.defaultValue,
            generatedRange: {
              min: blueprint.input.range.min,
              max: blueprint.input.range.max,
            },
          });
        }

        persisted.delete(blueprint.path);
      });

      previous.forEach((entry, path) => {
        if (!next.has(path)) {
          next.set(path, {
            ...entry,
            disabled: true,
          });
        }
      });

      persistedAutoInputsRef.current = persisted;
      return next;
    });
  }, [autoBlueprints]);

  const managedStandardInputs = useMemo<ManagedStandardInput[]>(() => {
    const entries: ManagedStandardInput[] = [];
    const blueprintPaths = new Set<string>();

    autoBlueprints.forEach((blueprint) => {
      blueprintPaths.add(blueprint.path);
      const entry = autoInputs.get(blueprint.path);
      if (!entry) {
        return;
      }
      entries.push({
        input: entry.input,
        source: "auto",
        disabled: entry.disabled,
        metadata: entry.metadata,
      });
    });

    autoInputs.forEach((entry, path) => {
      if (blueprintPaths.has(path)) {
        return;
      }
      entries.push({
        input: entry.input,
        source: "auto",
        disabled: entry.disabled,
        metadata: entry.metadata,
      });
    });

    customInputs.forEach((input) => {
      entries.push({
        input,
        source: "custom",
        disabled: false,
      });
    });

    return entries;
  }, [autoBlueprints, autoInputs, customInputs]);

  useEffect(() => {
    if (selectedStandardInputRoots.length === 0) {
      return;
    }
    const validRoots = new Set<string>(standardInputRoots);
    customInputs.forEach((input) => {
      validRoots.add(input.group || "custom");
    });
    const filtered = selectedStandardInputRoots.filter((root) =>
      validRoots.has(root),
    );
    if (filtered.length !== selectedStandardInputRoots.length) {
      setSelectedStandardInputRoots(filtered);
    }
  }, [customInputs, selectedStandardInputRoots, standardInputRoots]);

  const standardInputs = useMemo(
    () =>
      managedStandardInputs
        .filter((entry) => !entry.disabled)
        .map((entry) => entry.input),
    [managedStandardInputs],
  );

  const standardInputsById = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const rootRenderable = useMemo(() => {
    return rootId ? (world[rootId] as Group | undefined) : undefined;
  }, [rootId, world]);

  useEffect(() => {
    autoInputsRef.current = autoInputs;
  }, [autoInputs]);

  useEffect(() => {
    if (autoInputs.size === 0) {
      return;
    }
    setBindings((previous) => {
      let changed = false;
      const next: BindingMap = { ...previous };

      autoBlueprints.forEach((blueprint) => {
        const entry = autoInputs.get(blueprint.path);
        if (!entry || entry.disabled) {
          return;
        }
        const componentId = blueprint.metadata.componentId;
        const component = componentsByIdRef.current.get(componentId);
        if (!component) {
          return;
        }
        const existing = next[componentId] ?? {
          targetId: componentId,
          inputId: null,
          remap: createDefaultRemap(component),
        };
        if (existing.inputId) {
          return;
        }
        const updated = updateBindingWithInput(
          existing,
          component,
          entry.input,
        );
        if (updated !== existing) {
          next[componentId] = updated;
          changed = true;
        } else if (!Object.prototype.hasOwnProperty.call(next, componentId)) {
          next[componentId] = existing;
        }
      });

      return changed ? next : previous;
    });
  }, [autoBlueprints, autoInputs]);

  useEffect(() => {
    setInputValues((previous) => {
      const next: StandardInputValues = { ...previous };
      let changed = false;
      const validIds = new Set<string>();

      managedStandardInputs.forEach((entry) => {
        const inputId = entry.input.id;
        validIds.add(inputId);
        if (!Object.prototype.hasOwnProperty.call(next, inputId)) {
          next[inputId] = entry.input.defaultValue;
          changed = true;
        }
      });

      Object.keys(next).forEach((inputId) => {
        if (!validIds.has(inputId)) {
          delete next[inputId];
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [managedStandardInputs]);

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

  const handleSelectStandardInputRoots = useCallback(
    (nextRoots: string[]) => {
      const validSet = new Set<string>();
      nextRoots.forEach((root) => {
        if (standardInputRoots.includes(root)) {
          validSet.add(root);
        }
      });
      setSelectedStandardInputRoots(Array.from(validSet));
    },
    [standardInputRoots],
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

  const handleCreateCustomStandardInput = useCallback(
    (path: string): StandardRigInput | null => {
      let createdInput: StandardRigInput | null = null;
      const normalizedPath = normalizeStandardRigInputPath(path);
      setCustomInputs((previous) => {
        const autoIds = new Set(
          Array.from(autoInputsRef.current.values()).map(
            (entry) => entry.input.id,
          ),
        );
        const existingIds = new Set(previous.map((input) => input.id));
        autoIds.forEach((id) => existingIds.add(id));
        let candidate = createStandardRigInputFromPath(normalizedPath);
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
        return [...previous, candidate];
      });
      if (createdInput === null) {
        return null;
      }
      const created: StandardRigInput = createdInput;
      setInputValues((previous) => ({
        ...previous,
        [created.id]: created.defaultValue,
      }));
      return created;
    },
    [],
  );

  const handleUpdateStandardInput = useCallback(
    (inputId: string, updates: { path?: string; label?: string }) => {
      const autoEntry = Array.from(autoInputsRef.current.entries()).find(
        ([, entry]) => entry.input.id === inputId,
      );
      if (autoEntry) {
        if (updates.path !== undefined) {
          alertDialog(
            "Auto-generated inputs follow the scene hierarchy and cannot change path.",
          );
          return;
        }
        if (updates.label === undefined) {
          return;
        }
        const trimmedLabel = updates.label.trim();
        const nextLabel =
          trimmedLabel.length > 0
            ? trimmedLabel
            : deriveLabelFromNormalizedPath(autoEntry[1].input.path);
        setAutoInputs((previous) => {
          const current = previous.get(autoEntry[0]);
          if (!current || current.input.label === nextLabel) {
            return previous;
          }
          const updatedInput = createStandardRigInput({
            id: current.input.id,
            path: current.input.path,
            label: nextLabel,
            group: current.input.group,
            defaultValue: current.input.defaultValue,
            range: {
              min: current.input.range.min,
              max: current.input.range.max,
            },
          });
          const next = new Map(previous);
          next.set(autoEntry[0], {
            ...current,
            input: updatedInput,
          });
          return next;
        });
        return;
      }

      setCustomInputs((previous) => {
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
        if (
          updates.path !== undefined &&
          (previous.some(
            (input, idx) => idx !== index && input.path === normalizedPath,
          ) ||
            Array.from(autoInputsRef.current.values()).some(
              (entry) =>
                entry.input.path === normalizedPath &&
                entry.input.id !== inputId,
            ))
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
        if (normalizedPath === current.path && nextLabel === current.label) {
          return previous;
        }
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

  const handleDeleteCustomStandardInput = useCallback(
    (inputId: string) => {
      const isAuto = Array.from(autoInputsRef.current.values()).some(
        (entry) => entry.input.id === inputId,
      );
      if (isAuto) {
        return;
      }
      setCustomInputs((previous) =>
        previous.filter((input) => input.id !== inputId),
      );
      setInputValues((previous) => {
        if (!Object.prototype.hasOwnProperty.call(previous, inputId)) {
          return previous;
        }
        const next = { ...previous };
        delete next[inputId];
        return next;
      });
      setBindings((previous) => {
        let changed = false;
        const next: BindingMap = {};
        Object.entries(previous).forEach(([key, binding]) => {
          if (!binding) {
            return;
          }
          if (binding.inputId === inputId) {
            const component = componentsByIdRef.current.get(key);
            next[key] = {
              targetId: binding.targetId,
              inputId: null,
              remap: component ? createDefaultRemap(component) : binding.remap,
            };
            changed = true;
          } else {
            next[key] = binding;
          }
        });
        return changed ? next : previous;
      });
    },
    [setBindings],
  );

  const handleToggleStandardInput = useCallback(
    (path: string, enabled: boolean) => {
      const normalizedPath = normalizeStandardRigInputPath(path);
      const entry = autoInputsRef.current.get(normalizedPath);
      if (!entry) {
        return;
      }
      const nextDisabled = !enabled;
      if (entry.disabled === nextDisabled) {
        return;
      }
      setAutoInputs((previous) => {
        const current = previous.get(normalizedPath);
        if (!current || current.disabled === nextDisabled) {
          return previous;
        }
        const next = new Map(previous);
        next.set(normalizedPath, {
          ...current,
          disabled: nextDisabled,
        });
        return next;
      });
      if (!enabled) {
        const inputId = entry.input.id;
        setBindings((previous) => {
          let changed = false;
          const next: BindingMap = {};
          Object.entries(previous).forEach(([key, binding]) => {
            if (!binding) {
              return;
            }
            if (binding.inputId === inputId) {
              const component = componentsByIdRef.current.get(key);
              next[key] = {
                targetId: binding.targetId,
                inputId: null,
                remap: component
                  ? createDefaultRemap(component)
                  : binding.remap,
              };
              changed = true;
            } else {
              next[key] = binding;
            }
          });
          return changed ? next : previous;
        });
      }
    },
    [setBindings],
  );

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
      const autoEntries = new Map<string, PersistedAutoStandardInput>();
      const legacyCustomInputs: StandardRigInput[] = [];
      if (Array.isArray(persisted.standardInputs)) {
        persisted.standardInputs.forEach((entry) => {
          if (
            entry &&
            typeof entry === "object" &&
            "range" in entry &&
            "defaultValue" in entry
          ) {
            legacyCustomInputs.push(
              createStandardRigInput(entry as StandardRigInput),
            );
            return;
          }
          const descriptor = entry as PersistedAutoStandardInput;
          const normalizedPath = normalizeStandardRigInputPath(descriptor.path);
          autoEntries.set(normalizedPath, {
            id: descriptor.id,
            path: normalizedPath,
            label: descriptor.label,
            disabled: descriptor.disabled,
            defaultValue: descriptor.defaultValue,
            range: descriptor.range,
          });
        });
      }
      persistedAutoInputsRef.current = autoEntries;
      const persistedCustom =
        persisted.customStandardInputs?.map((input) =>
          createStandardRigInput(input),
        ) ?? [];
      setCustomInputs([...persistedCustom, ...legacyCustomInputs]);
      setAutoInputs(new Map());
      setInputValues(persisted.inputValues ?? {});
      setBindings(reconcileBindings(persisted.bindings, animatableComponents));
      setSelectedStandardInputRoots(
        Array.isArray(persisted.selectedStandardInputRoots)
          ? persisted.selectedStandardInputRoots
          : [],
      );
    } else {
      persistedAutoInputsRef.current = new Map();
      setCustomInputs([]);
      setAutoInputs(new Map());
      setInputValues({});
      setBindings(createDefaultBindings(animatableComponents));
      setSelectedStandardInputRoots([]);
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
    const persistedAuto: PersistedAutoStandardInput[] = [];
    autoInputs.forEach((entry, path) => {
      persistedAuto.push({
        id: entry.input.id,
        path,
        label: entry.input.label,
        disabled: entry.disabled,
        defaultValue:
          entry.input.defaultValue !== entry.generatedDefaultValue
            ? entry.input.defaultValue
            : undefined,
        range:
          entry.input.range.min !== entry.generatedRange.min ||
          entry.input.range.max !== entry.generatedRange.max
            ? {
                min: entry.input.range.min,
                max: entry.input.range.max,
              }
            : undefined,
      });
    });
    saveRigState({
      faceId,
      bindings,
      inputValues,
      standardInputs: persistedAuto,
      customStandardInputs: customInputs,
      selectedStandardInputRoots,
    });
  }, [
    animatableComponents,
    autoInputs,
    bindings,
    customInputs,
    faceId,
    inputValues,
    selectedStandardInputRoots,
  ]);

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
    managedStandardInputs,
    standardInputRoots,
    selectedStandardInputRoots,
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
    handleToggleStandardInput,
    handleCreateCustomStandardInput,
    handleUpdateStandardInput,
    handleDeleteCustomStandardInput,
    handleSelectStandardInputRoots,
    handleFaceIdChange,
    handleFocusSelectionIndex,
    handleClearSelection,
    setStoreState,
    collectAnimatableExportState,
  };
}
