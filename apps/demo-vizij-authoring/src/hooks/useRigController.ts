import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useVizijStore,
  useVizijStoreSetter,
  type Selection,
  type VizijData,
  type Group,
  type World,
} from "@vizij/render";
import {
  getLookup,
  SELF_BINDING_ID,
  type AnimatableValue,
  type RawValue,
} from "@vizij/utils";
import {
  extractAnimatableComponents,
  buildAnimatableValue,
  type AnimatableComponent as AnimComponent,
} from "@vizij/utils";
import {
  createDefaultBindings,
  createDefaultBinding,
  createDefaultParentBinding,
  reconcileBindings,
  updateBindingWithInput,
  ensureBindingStructure,
  addBindingSlot,
  removeBindingSlot,
  updateBindingExpression,
  updateBindingSlotAlias,
  updateBindingSlotRemap,
  PRIMARY_SLOT_ID,
  PRIMARY_SLOT_ALIAS,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingFromDefinition,
  bindingToDefinition,
  type AnimatableBinding,
  type BindingMap,
  type InputBindingMap,
  type BindingTarget,
  type StandardInputValues,
} from "../rig/state";
import type { RemapSettings } from "@vizij/utils";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  type RigBindingDefinition,
  type StandardRigInput,
} from "@vizij/utils";
import {
  loadRigState,
  saveRigState,
  type PersistedAutoStandardInput,
} from "../rig/persistence";
import { deriveAutoFaceId, sanitizeFaceId } from "../utils/faceId";
import { cloneRawValue, rawValuesEqual } from "@vizij/utils";
import { alertDialog, confirmDialog } from "../utils/dialogs";
import {
  buildAutoRigInputBlueprints,
  type AutoRigInputBlueprintMetadata,
} from "../rig/autoInputs";
import { buildRigGraphSpec, type BuildGraphResult } from "../rig/graphBuilder";
import {
  useGraphInstance,
  valueAsColorRgba,
  valueAsNumber,
  valueAsVector,
  type ValueJSON,
  type WriteOpJSON,
} from "@vizij/node-graph-react";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import { rehydrateRigDataFromGraph } from "../rig/importer";

function convertValueJSONToRaw(
  animatable: AnimatableValue | undefined,
  value: ValueJSON | undefined,
): RawValue | undefined {
  if (!animatable) {
    return undefined;
  }
  switch (animatable.type) {
    case "number": {
      const num = valueAsNumber(value);
      if (typeof num === "number" && Number.isFinite(num)) {
        return num;
      }
      break;
    }
    case "vector2": {
      const vec = valueAsVector(value);
      if (vec && vec.length >= 2) {
        return {
          x: Number(vec[0] ?? 0),
          y: Number(vec[1] ?? 0),
        };
      }
      break;
    }
    case "vector3":
    case "euler": {
      const vec = valueAsVector(value);
      if (vec && vec.length >= 3) {
        return {
          x: Number(vec[0] ?? 0),
          y: Number(vec[1] ?? 0),
          z: Number(vec[2] ?? 0),
        };
      }
      break;
    }
    case "rgb": {
      const color = valueAsColorRgba(value);
      if (Array.isArray(color)) {
        const [r = 0, g = 0, b = 0] = color;
        return {
          r: Number(r ?? 0),
          g: Number(g ?? 0),
          b: Number(b ?? 0),
        };
      }
      const vec = valueAsVector(value);
      if (vec && vec.length >= 3) {
        return {
          r: Number(vec[0] ?? 0),
          g: Number(vec[1] ?? 0),
          b: Number(vec[2] ?? 0),
        };
      }
      break;
    }
    default:
      break;
  }
  const fallback = animatable.default as RawValue;
  if (fallback && typeof fallback === "object") {
    return JSON.parse(JSON.stringify(fallback)) as RawValue;
  }
  return fallback;
}

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
  metadata?: AutoRigInputBlueprintMetadata;
}

interface AutoInputState {
  input: StandardRigInput;
  metadata: AutoRigInputBlueprintMetadata;
  generatedLabel: string;
  generatedDefaultValue: number;
  generatedRange: { min: number; max: number };
}

export interface RigController {
  faceId: string;
  setFaceId: (next: string) => void;
  graphStatus: "idle" | "loading" | "ready" | "error";
  graphError: string | null;
  bindingIssues: Map<string, readonly string[]>;
  featureLabelOverrides: Record<string, string>;
  managedStandardInputs: ManagedStandardInput[];
  standardInputRoots: string[];
  selectedStandardInputRoots: string[];
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  inputValues: StandardInputValues;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  animatableComponents: AnimatableComponent[];
  componentsById: Map<string, AnimatableComponent>;
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  selectionStack: Selection[];
  inputRanges: Map<string, { min: number; max: number }>;
  handleInputValueChange: (inputId: string, value: number) => void;
  handleBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  handleBindingRemapChange: (
    targetId: string,
    field: keyof RemapSettings,
    value: number,
    slotId?: string,
  ) => void;
  handleResetBinding: (targetId: string) => void;
  handleCreateCustomStandardInput: (path: string) => StandardRigInput | null;
  handleLinkChildInput: (parentId: string, childId: string) => void;
  handleRenameGroup: (sourceGroup: string, nextGroup: string) => void;
  handleUpdateStandardInput: (
    inputId: string,
    updates: { path?: string; label?: string },
  ) => void;
  handleDeleteCustomStandardInput: (inputId: string) => void;
  handleAddBindingSlot: (targetId: string) => void;
  handleRemoveBindingSlot: (targetId: string, slotId: string) => void;
  handleUpdateBindingExpression: (targetId: string, expression: string) => void;
  handleUpdateBindingSlotAlias: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  handleUpdateFeatureLabel: (
    featureId: string,
    defaultLabel: string,
    value: string,
  ) => void;
  handleEnsureParentBinding: (targetId: string) => void;
  handleParentBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  handleParentBindingRemapChange: (
    targetId: string,
    field: keyof RemapSettings,
    value: number,
    slotId?: string,
  ) => void;
  handleParentAddBindingSlot: (targetId: string) => void;
  handleParentRemoveBindingSlot: (targetId: string, slotId: string) => void;
  handleParentBindingExpressionChange: (
    targetId: string,
    expression: string,
  ) => void;
  handleParentBindingSlotAliasChange: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  handleParentResetBinding: (targetId: string) => void;
  handleSelectStandardInputRoots: (roots: string[]) => void;
  handleFaceIdChange: (value: string) => void;
  handleFocusSelectionIndex: (index: number) => void;
  handleClearSelection: () => void;
  handleImportGraphSpec: (spec: GraphSpec) => Promise<void>;
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

  const {
    loadGraph: loadRigGraph,
    unloadGraph: unloadRigGraph,
    evalAll: evalRigGraph,
    stageInput: stageRigInput,
    clearStaged: clearRigStaged,
  } = useGraphInstance(undefined, { autoEval: false });

  const [graphStatus, setGraphStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [graphError, setGraphError] = useState<string | null>(null);

  const [faceId, setFaceIdState] = useState<string>("robot");
  const [autoInputs, setAutoInputs] = useState<Map<string, AutoInputState>>(
    () => new Map(),
  );
  const GROUP_FALLBACK = "custom";

  const autoInputsRef = useRef(autoInputs);
  const [customInputs, setCustomInputs] = useState<StandardRigInput[]>([]);
  const [selectedStandardInputRoots, setSelectedStandardInputRoots] = useState<
    string[]
  >([]);
  const [inputValues, setInputValues] = useState<StandardInputValues>({});
  const [bindings, setBindings] = useState<BindingMap>(() =>
    createDefaultBindings([]),
  );
  const [inputBindings, setInputBindings] = useState<InputBindingMap>({});
  const isDev = process.env.NODE_ENV !== "production";
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console -- debug logger
      console.debug("[rig-controller]", ...args);
    }
  };
  const [featureLabelOverrides, setFeatureLabelOverrides] = useState<
    Record<string, string>
  >({});

  const persistedAutoInputsRef = useRef<
    Map<string, PersistedAutoStandardInput>
  >(new Map());
  const pendingInputBindingDefinitionsRef = useRef<Record<
    string,
    RigBindingDefinition
  > | null>(null);
  const inputBindingsRef = useRef<InputBindingMap>(inputBindings);
  const allStandardInputsRef = useRef<Map<string, StandardRigInput>>(new Map());

  const drivenAnimatablesRef = useRef<Set<string>>(new Set());
  const graphSummaryRef = useRef<BuildGraphResult["summary"] | null>(null);
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
      featureLabelOverrides,
    );
  }, [animatableComponents, animatables, featureLabelOverrides, world]);

  const autoBlueprints = autoBlueprintResult.blueprints;
  const standardInputRoots = autoBlueprintResult.roots;

  const componentsByIdRef = useRef(componentsById);

  useEffect(() => {
    componentsByIdRef.current = componentsById;
  }, [componentsById]);

  useEffect(() => {
    inputBindingsRef.current = inputBindings;
  }, [inputBindings]);

  useEffect(() => {
    setAutoInputs((previous) => {
      const next = new Map<string, AutoInputState>();
      const persisted = persistedAutoInputsRef.current;

      autoBlueprints.forEach((blueprint) => {
        const existing = previous.get(blueprint.path);
        const persistedEntry = persisted.get(blueprint.path);

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

      persistedAutoInputsRef.current = persisted;
      return next;
    });
  }, [autoBlueprints]);

  const derivedChildrenMap = useMemo(() => {
    const working = new Map<string, Set<string>>();

    const record = (sourceId: string | null | undefined, childId: string) => {
      if (!sourceId || sourceId === SELF_BINDING_ID) {
        return;
      }
      let set = working.get(sourceId);
      if (!set) {
        set = new Set<string>();
        working.set(sourceId, set);
      }
      set.add(childId);
    };

    Object.entries(inputBindings).forEach(([derivedId, binding]) => {
      record(binding.inputId, derivedId);
      binding.slots.forEach((slot) => {
        record(slot.inputId, derivedId);
      });
    });

    const result = new Map<string, string[]>();
    working.forEach((value, key) => {
      result.set(key, Array.from(value));
    });
    return result;
  }, [inputBindings]);

  const managedStandardInputs = useMemo<ManagedStandardInput[]>(() => {
    const entries: ManagedStandardInput[] = [];
    const blueprintPaths = new Set<string>();

    const enhanceInput = (input: StandardRigInput): StandardRigInput => {
      const binding = inputBindings[input.id];
      const target = bindingTargetFromInput(input);
      const normalized = binding
        ? ensureBindingStructure(binding, target)
        : null;
      const parentBinding = normalized ? bindingToDefinition(normalized) : null;
      const children = derivedChildrenMap.get(input.id);
      return {
        ...input,
        parentBinding,
        derivedChildren: children ? [...children] : [],
      };
    };

    autoBlueprints.forEach((blueprint) => {
      blueprintPaths.add(blueprint.path);
      const entry = autoInputs.get(blueprint.path);
      if (!entry) {
        return;
      }
      entries.push({
        input: enhanceInput(entry.input),
        source: "auto",
        metadata: entry.metadata,
      });
    });

    autoInputs.forEach((entry, path) => {
      if (blueprintPaths.has(path)) {
        return;
      }
      entries.push({
        input: enhanceInput(entry.input),
        source: "auto",
        metadata: entry.metadata,
      });
    });

    customInputs.forEach((input) => {
      entries.push({
        input: enhanceInput(input),
        source: "custom",
      });
    });

    return entries;
  }, [
    autoBlueprints,
    autoInputs,
    customInputs,
    inputBindings,
    derivedChildrenMap,
  ]);

  useEffect(() => {
    const map = new Map<string, StandardRigInput>();
    managedStandardInputs.forEach((entry) => {
      map.set(entry.input.id, entry.input);
    });
    allStandardInputsRef.current = map;
  }, [managedStandardInputs]);

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
    () => managedStandardInputs.map((entry) => entry.input),
    [managedStandardInputs],
  );

  const standardInputsById = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const standardInputsByPath = useMemo(
    () =>
      new Map<string, StandardRigInput>(
        standardInputs.map((input) => [input.path, input]),
      ),
    [standardInputs],
  );

  const standardInputsByIdRef = useRef(standardInputsById);

  useEffect(() => {
    standardInputsByIdRef.current = standardInputsById;
  }, [standardInputsById]);

  useEffect(() => {
    const pending = pendingInputBindingDefinitionsRef.current;
    if (!pending || standardInputsById.size === 0) {
      return;
    }
    const next: InputBindingMap = {};
    Object.entries(pending).forEach(([inputId, definition]) => {
      const input = standardInputsById.get(inputId);
      if (!input) {
        return;
      }
      const target = bindingTargetFromInput(input);
      const binding = bindingFromDefinition(target, definition);
      const hasParents =
        (binding.inputId && binding.inputId !== SELF_BINDING_ID) ||
        binding.slots.some(
          (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
        );
      if (!hasParents) {
        return;
      }
      next[inputId] = binding;
    });
    setInputBindings(next);
    pendingInputBindingDefinitionsRef.current = null;
  }, [standardInputsById]);

  const rigGraphBuild = useMemo<BuildGraphResult | null>(() => {
    if (!faceId) {
      return null;
    }
    return buildRigGraphSpec({
      faceId,
      animatables,
      components: animatableComponents,
      bindings,
      inputsById: standardInputsById,
      inputBindings,
    });
  }, [
    animatableComponents,
    animatables,
    bindings,
    inputBindings,
    faceId,
    standardInputsById,
  ]);

  const graphSpecSignature = useMemo(() => {
    if (!rigGraphBuild) {
      return null;
    }
    if (rigGraphBuild.issues.fatal.length > 0) {
      return null;
    }
    try {
      return JSON.stringify(rigGraphBuild.spec);
    } catch (err) {
      console.error("Failed to serialise rig graph spec signature", err);
      return `${Date.now()}`;
    }
  }, [rigGraphBuild]);

  const bindingIssues = useMemo(
    () =>
      rigGraphBuild
        ? new Map(
            Object.entries(rigGraphBuild.issues.byTarget).map(
              ([targetId, issues]) => [targetId, [...issues]],
            ),
          )
        : new Map<string, readonly string[]>(),
    [rigGraphBuild],
  );

  const resetDrivenAnimatables = useCallback(() => {
    if (drivenAnimatablesRef.current.size === 0) {
      return;
    }
    const next = drivenAnimatablesRef.current;
    drivenAnimatablesRef.current = new Set();
    next.forEach((animId) => {
      const animatable = animatables[animId];
      if (!animatable) {
        return;
      }
      const resetValue = buildAnimatableValue(animatable, undefined);
      setValue(animId, namespace, resetValue);
    });
  }, [animatables, namespace, setValue]);

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
        if (!entry) {
          return;
        }
        const componentId = blueprint.metadata.componentId;
        const component = componentsByIdRef.current.get(componentId);
        if (!component) {
          return;
        }
        const target = bindingTargetFromComponent(component);
        const currentBinding = next[componentId];
        const ensured =
          currentBinding !== undefined
            ? ensureBindingStructure(currentBinding, target)
            : createDefaultBinding(target);
        if (ensured !== currentBinding) {
          next[componentId] = ensured;
        }
        if (ensured.inputId) {
          return;
        }
        const updated = updateBindingWithInput(ensured, target, entry.input);
        if (updated !== ensured) {
          next[componentId] = updated;
          changed = true;
        } else if (!Object.prototype.hasOwnProperty.call(next, componentId)) {
          next[componentId] = ensured;
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
        const component = componentsById.get(key);
        const ensured =
          component !== undefined
            ? ensureBindingStructure(
                binding,
                bindingTargetFromComponent(component),
              )
            : binding;
        next[key] = ensured;
        if (ensured !== binding) {
          changed = true;
        }
        if (ensured.inputId && !validIds.has(ensured.inputId)) {
          if (component) {
            next[key] = updateBindingWithInput(
              ensured,
              bindingTargetFromComponent(component),
              undefined,
            );
          } else {
            next[key] = {
              ...ensured,
              inputId: null,
            };
          }
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
      const validRoots = new Set<string>(standardInputRoots);
      managedStandardInputs.forEach((entry) => {
        validRoots.add(entry.input.group || "custom");
      });
      const normalized = Array.from(
        new Set(nextRoots.filter((root) => validRoots.has(root))),
      );
      setSelectedStandardInputRoots(normalized);
    },
    [managedStandardInputs, standardInputRoots],
  );

  const handleBindingInputChange = useCallback(
    (targetId: string, nextInputId: string | null, slotId?: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const target = bindingTargetFromComponent(component);
      const inputMeta =
        nextInputId !== null ? standardInputsById.get(nextInputId) : undefined;
      setBindings((previous) => {
        const current = previous[targetId] ?? createDefaultBinding(target);
        const ensured = ensureBindingStructure(current, target);
        const targetSlotId = slotId ?? ensured.slots[0]?.id ?? PRIMARY_SLOT_ID;
        const updated = updateBindingWithInput(
          ensured,
          target,
          inputMeta,
          targetSlotId,
        );
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
    (
      targetId: string,
      field: keyof RemapSettings,
      value: number,
      slotId?: string,
    ) => {
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
        const targetSlotId =
          slotId ?? binding.slots?.[0]?.id ?? PRIMARY_SLOT_ID;
        const updated = updateBindingSlotRemap(
          binding,
          target,
          targetSlotId,
          field,
          value,
        );
        if (updated === binding) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: updated,
        };
      });
    },
    [componentsById],
  );

  const handleAddBindingSlot = useCallback(
    (targetId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const target = bindingTargetFromComponent(component);
      setBindings((previous) => {
        const current = previous[targetId] ?? createDefaultBinding(target);
        const next = addBindingSlot(current, target);
        if (next === current) {
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

  const handleRemoveBindingSlot = useCallback(
    (targetId: string, slotId: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const target = bindingTargetFromComponent(component);
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
        const next = removeBindingSlot(binding, target, slotId);
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

  const handleUpdateBindingExpression = useCallback(
    (targetId: string, expression: string) => {
      const component = componentsById.get(targetId);
      if (!component) {
        return;
      }
      const target = bindingTargetFromComponent(component);
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
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
      const target = bindingTargetFromComponent(component);
      setBindings((previous) => {
        const binding = previous[targetId];
        if (!binding) {
          return previous;
        }
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

  const handleUpdateFeatureLabel = useCallback(
    (featureId: string, defaultLabel: string, value: string) => {
      const trimmed = value.trim();
      const normalizedDefault = defaultLabel.trim();
      setFeatureLabelOverrides((previous) => {
        if (trimmed.length === 0 || trimmed === normalizedDefault) {
          if (!(featureId in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[featureId];
          return next;
        }
        if (previous[featureId] === trimmed) {
          return previous;
        }
        return {
          ...previous,
          [featureId]: trimmed,
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

  const pruneInputBindings = useCallback(
    (removedInputId: string, snapshot?: Map<string, StandardRigInput>) => {
      const inputsSnapshot =
        snapshot ?? new Map(standardInputsByIdRef.current.entries());
      setInputBindings((previous) => {
        let changed = false;
        const next: InputBindingMap = {};
        Object.entries(previous).forEach(([targetId, binding]) => {
          if (targetId === removedInputId) {
            changed = true;
            return;
          }
          const targetInput = inputsSnapshot.get(targetId);
          if (!targetInput) {
            next[targetId] = binding;
            return;
          }
          const target = bindingTargetFromInput(targetInput);
          const ensured = ensureBindingStructure(binding, target);
          let updated = ensured;
          if (ensured.inputId === removedInputId) {
            updated = updateBindingWithInput(updated, target, undefined);
          }
          ensured.slots.forEach((slot) => {
            if (slot.inputId === removedInputId) {
              updated = updateBindingWithInput(
                updated,
                target,
                undefined,
                slot.id,
              );
            }
          });
          const normalized = ensureBindingStructure(updated, target);
          const hasParents =
            (normalized.inputId && normalized.inputId !== SELF_BINDING_ID) ||
            normalized.slots.some(
              (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
            );
          if (!hasParents) {
            changed = true;
            return;
          }
          const previousDefinition = bindingToDefinition(ensured);
          const nextDefinition = bindingToDefinition(normalized);
          if (
            JSON.stringify(previousDefinition) !==
            JSON.stringify(nextDefinition)
          ) {
            changed = true;
          }
          next[targetId] = normalized;
        });
        return changed ? next : previous;
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
      const snapshot = new Map(standardInputsByIdRef.current.entries());
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
          const component = componentsByIdRef.current.get(key);
          if (!component) {
            next[key] = binding;
            return;
          }
          const target = bindingTargetFromComponent(component);
          const ensured = ensureBindingStructure(binding, target);
          let updated = ensured;
          ensured.slots.forEach((slot) => {
            if (slot.inputId === inputId) {
              updated = updateBindingWithInput(
                updated,
                target,
                undefined,
                slot.id,
              );
            }
          });
          if (updated !== binding) {
            changed = true;
          }
          next[key] = updated;
        });
        return changed ? next : previous;
      });
      pruneInputBindings(inputId, snapshot);
    },
    [pruneInputBindings, setBindings],
  );

  const setFaceId = useCallback((next: string) => {
    setFaceIdState(sanitizeFaceId(next));
  }, []);

  const canonicalBindingExpression = useCallback(
    (binding: AnimatableBinding): string => {
      const aliases: string[] = [];
      binding.slots.forEach((slot) => {
        if (!slot.inputId) {
          return;
        }
        const alias = (slot.alias || slot.id || "").trim();
        if (!alias) {
          return;
        }
        if (!aliases.includes(alias)) {
          aliases.push(alias);
        }
      });
      return aliases.join(" + ");
    },
    [],
  );

  const updateInputBinding = useCallback(
    (
      targetId: string,
      initializer: (target: BindingTarget) => AnimatableBinding,
      transform: (
        binding: AnimatableBinding,
        target: BindingTarget,
      ) => AnimatableBinding,
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
        const expressionBefore = (ensured.expression ?? "").trim();
        const expressionWasAuto =
          expressionBefore === "" || expressionBefore === canonicalBefore;
        const transformed = transform(ensured, target);
        let normalized = ensureBindingStructure(transformed, target);
        if (expressionWasAuto) {
          const canonicalAfter = canonicalBindingExpression(normalized);
          const expressionAfter = (normalized.expression ?? "").trim();
          if (canonicalAfter.length > 0) {
            if (expressionAfter !== canonicalAfter) {
              normalized = {
                ...normalized,
                expression: canonicalAfter,
              };
            }
          } else {
            const fallbackAlias =
              normalized.slots[0]?.alias ?? PRIMARY_SLOT_ALIAS;
            if (expressionAfter !== fallbackAlias) {
              normalized = {
                ...normalized,
                expression: fallbackAlias,
              };
            }
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
    [],
  );

  const handleRenameGroup = useCallback(
    (sourceGroup: string, nextGroup: string) => {
      const trimmed = nextGroup.trim();
      if (!trimmed || trimmed === sourceGroup) {
        return;
      }

      setCustomInputs((previous) => {
        let changed = false;
        const next = previous.map((input) => {
          if ((input.group ?? GROUP_FALLBACK) !== sourceGroup) {
            return input;
          }
          changed = true;
          return createStandardRigInput({
            id: input.id,
            path: input.path,
            label: input.label,
            group: trimmed,
            defaultValue: input.defaultValue,
            range: {
              min: input.range.min,
              max: input.range.max,
            },
            parentBinding: input.parentBinding ?? null,
            derivedChildren: input.derivedChildren
              ? [...input.derivedChildren]
              : [],
          });
        });
        return changed ? next : previous;
      });

      setAutoInputs((previous) => {
        let changed = false;
        const next = new Map<string, AutoInputState>();
        previous.forEach((entry, key) => {
          if ((entry.input.group ?? GROUP_FALLBACK) !== sourceGroup) {
            next.set(key, entry);
            return;
          }
          changed = true;
          const updatedInput = createStandardRigInput({
            id: entry.input.id,
            path: entry.input.path,
            label: entry.input.label,
            group: trimmed,
            defaultValue: entry.input.defaultValue,
            range: {
              min: entry.input.range.min,
              max: entry.input.range.max,
            },
            parentBinding: entry.input.parentBinding ?? null,
            derivedChildren: entry.input.derivedChildren
              ? [...entry.input.derivedChildren]
              : [],
          });
          next.set(key, {
            ...entry,
            input: updatedInput,
          });
        });
        return changed ? next : previous;
      });

      setSelectedStandardInputRoots((previous) => {
        if (!previous.includes(sourceGroup)) {
          return previous;
        }
        const filtered = previous.filter((root) => root !== sourceGroup);
        if (filtered.includes(trimmed)) {
          return filtered;
        }
        return [...filtered, trimmed];
      });
    },
    [],
  );

  const handleEnsureParentBinding = useCallback((targetId: string) => {
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
  }, []);

  const handleParentBindingInputChange = useCallback(
    (targetId: string, nextInputId: string | null, slotId?: string) => {
      const input =
        nextInputId !== null
          ? (standardInputsByIdRef.current.get(nextInputId) ??
            allStandardInputsRef.current.get(nextInputId))
          : undefined;
      debugLog("parent binding change: input lookup", {
        targetId,
        slotId,
        nextInputId,
        found: input?.id ?? null,
      });
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) =>
          updateBindingWithInput(
            binding,
            target,
            input,
            slotId ?? binding.slots[0]?.id ?? PRIMARY_SLOT_ID,
          ),
      );
    },
    [updateInputBinding],
  );

  const handleParentBindingRemapChange = useCallback(
    (
      targetId: string,
      field: keyof RemapSettings,
      value: number,
      slotId?: string,
    ) => {
      updateInputBinding(
        targetId,
        createDefaultParentBinding,
        (binding, target) =>
          updateBindingSlotRemap(
            binding,
            target,
            slotId ?? binding.slots[0]?.id ?? PRIMARY_SLOT_ID,
            field,
            value,
          ),
      );
    },
    [updateInputBinding],
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

  const handleImportGraphSpec = useCallback(
    async (spec: GraphSpec) => {
      try {
        const rehydrated = rehydrateRigDataFromGraph(spec, {
          faceId,
          animatables,
          components: animatableComponents,
        });

        const blueprint = buildAutoRigInputBlueprints(
          world,
          animatables,
          animatableComponents,
          featureLabelOverrides,
        );

        const inputsByPath = new Map(
          rehydrated.standardInputs.map((input) => [input.path, input]),
        );
        const nextAutoInputs = new Map<string, AutoInputState>();
        const missingBlueprintPaths: string[] = [];

        blueprint.blueprints.forEach((entry) => {
          const input = inputsByPath.get(entry.path);
          if (!input) {
            missingBlueprintPaths.push(entry.path);
            return;
          }
          nextAutoInputs.set(entry.path, {
            input,
            metadata: entry.metadata,
            generatedLabel: entry.input.label,
            generatedDefaultValue: entry.input.defaultValue,
            generatedRange: {
              min: entry.input.range.min,
              max: entry.input.range.max,
            },
          });
          inputsByPath.delete(entry.path);
        });

        const nextCustomInputs = Array.from(inputsByPath.values()).sort(
          (a, b) => a.label.localeCompare(b.label),
        );

        const nextInputValues: StandardInputValues = {};
        rehydrated.standardInputs.forEach((input) => {
          nextInputValues[input.id] = input.defaultValue;
        });

        const rebuiltSpec = buildRigGraphSpec({
          faceId,
          animatables,
          components: animatableComponents,
          bindings: rehydrated.bindings,
          inputsById: new Map(
            rehydrated.standardInputs.map((input) => [input.id, input]),
          ),
          inputBindings: rehydrated.inputBindings,
        }).spec;

        const [importedNormalized, rebuiltNormalized] = await Promise.all([
          normalizeGraphSpec(spec),
          normalizeGraphSpec(rebuiltSpec),
        ]);

        const importedSignature = JSON.stringify(importedNormalized);
        const rebuiltSignature = JSON.stringify(rebuiltNormalized);
        if (importedSignature !== rebuiltSignature) {
          const mismatchReasons = [
            "Slot aliases, expressions, and remap defaults are normalised during import.",
            "Identifier sanitisation may regenerate component or input ids.",
            "Auto-generated standard inputs are reconstructed from rig metadata rather than the saved graph structure.",
          ];
          if (missingBlueprintPaths.length > 0) {
            mismatchReasons.push(
              `Auto-generated inputs missing from the imported metadata: ${missingBlueprintPaths
                .map((path) => `"${path}"`)
                .join(", ")}.`,
            );
          }
          const accept = confirmDialog(
            `The imported graph normalises to a different spec. Possible causes include:\n${mismatchReasons
              .map((reason) => `• ${reason}`)
              .join("\n")}\n\nApply the reconstructed bindings?`,
          );
          if (!accept) {
            return;
          }
        }

        skipPersistRef.current = true;
        persistedAutoInputsRef.current = new Map();
        setAutoInputs(nextAutoInputs);
        setCustomInputs(nextCustomInputs);
        setInputValues(nextInputValues);
        setBindings(rehydrated.bindings);
        setInputBindings(rehydrated.inputBindings);
        setSelectedStandardInputRoots(blueprint.roots);
        setTimeout(() => {
          skipPersistRef.current = false;
        }, 0);

        if (missingBlueprintPaths.length > 0) {
          alertDialog(
            `The imported graph is missing auto-generated inputs for ${missingBlueprintPaths
              .map((path) => `"${path}"`)
              .join(", ")}.`,
          );
        }
      } catch (error) {
        alertDialog(
          `Failed to import graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
    [
      faceId,
      animatables,
      animatableComponents,
      world,
      featureLabelOverrides,
      setAutoInputs,
      setCustomInputs,
      setInputValues,
      setBindings,
      setInputBindings,
      setSelectedStandardInputRoots,
      alertDialog,
      confirmDialog,
    ],
  );

  const handleLinkChildInput = useCallback(
    (parentId: string, childId: string) => {
      if (parentId === childId) {
        return;
      }
      const parent =
        standardInputsByIdRef.current.get(parentId) ??
        allStandardInputsRef.current.get(parentId);
      const child =
        standardInputsByIdRef.current.get(childId) ??
        allStandardInputsRef.current.get(childId);
      if (!parent || !child) {
        return;
      }
      updateInputBinding(
        childId,
        createDefaultParentBinding,
        (binding, target) => {
          let next = binding;
          const existingSlot = next.slots.find(
            (slot) => slot.inputId === parent.id,
          );
          let targetSlotId = existingSlot?.id ?? null;
          if (!targetSlotId) {
            const reusableSlot = next.slots.find(
              (slot, index) =>
                index > 0 &&
                (slot.inputId === null || slot.inputId === undefined),
            );
            if (reusableSlot) {
              targetSlotId = reusableSlot.id;
            } else {
              next = addBindingSlot(next, target);
              targetSlotId = next.slots[next.slots.length - 1]?.id ?? null;
            }
          }
          return updateBindingWithInput(
            next,
            target,
            parent,
            targetSlotId ?? undefined,
          );
        },
      );
    },
    [updateInputBinding],
  );

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
      const idMismatches: string[] = [];
      if (Array.isArray(persisted.standardInputs)) {
        persisted.standardInputs.forEach((entry) => {
          if (
            entry &&
            typeof entry === "object" &&
            "range" in entry &&
            "defaultValue" in entry
          ) {
            const legacyDescriptor = entry as StandardRigInput;
            const normalized = createStandardRigInput(legacyDescriptor);
            if (legacyDescriptor.id && legacyDescriptor.id !== normalized.id) {
              idMismatches.push(
                `${legacyDescriptor.id} → ${normalized.id} (${normalized.path})`,
              );
            }
            legacyCustomInputs.push(normalized);
            return;
          }
          const descriptor = entry as PersistedAutoStandardInput;
          const normalizedPath = normalizeStandardRigInputPath(descriptor.path);
          const canonicalId = createStandardRigInputFromPath(normalizedPath).id;
          if (descriptor.id && descriptor.id !== canonicalId) {
            idMismatches.push(
              `${descriptor.id} → ${canonicalId} (${normalizedPath})`,
            );
          }
          autoEntries.set(normalizedPath, {
            id: canonicalId,
            path: normalizedPath,
            label: descriptor.label,
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
      persisted.customStandardInputs?.forEach((input, index) => {
        if (input.id && input.id !== persistedCustom[index]?.id) {
          const resolved = persistedCustom[index];
          if (resolved) {
            idMismatches.push(
              `${input.id} → ${resolved.id} (${resolved.path})`,
            );
          }
        }
      });
      setCustomInputs([...persistedCustom, ...legacyCustomInputs]);
      setAutoInputs(new Map());
      setInputValues(persisted.inputValues ?? {});
      setBindings(reconcileBindings(persisted.bindings, animatableComponents));
      setSelectedStandardInputRoots(
        Array.isArray(persisted.selectedStandardInputRoots)
          ? persisted.selectedStandardInputRoots
          : [],
      );
      setFeatureLabelOverrides(persisted.featureLabels ?? {});
      pendingInputBindingDefinitionsRef.current =
        persisted.inputBindingDefinitions ??
        persisted.derivedStandardInputs ??
        null;
      setInputBindings({});
      if (idMismatches.length > 0) {
        alertDialog(
          `Some standard input identifiers were normalised to keep them consistent:\n${idMismatches.join("\n")}`,
        );
      }
    } else {
      persistedAutoInputsRef.current = new Map();
      setCustomInputs([]);
      setAutoInputs(new Map());
      setInputValues({});
      setBindings(createDefaultBindings(animatableComponents));
      setSelectedStandardInputRoots([]);
      setFeatureLabelOverrides({});
      pendingInputBindingDefinitionsRef.current = null;
      setInputBindings({});
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
    const bindingDefinitions: Record<string, RigBindingDefinition> = {};
    Object.entries(inputBindings).forEach(([id, binding]) => {
      const hasParents =
        (binding.inputId && binding.inputId !== SELF_BINDING_ID) ||
        binding.slots.some(
          (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
        );
      if (!hasParents) {
        return;
      }
      bindingDefinitions[id] = bindingToDefinition(binding);
    });

    saveRigState({
      faceId,
      bindings,
      inputValues,
      standardInputs: persistedAuto,
      customStandardInputs: customInputs,
      selectedStandardInputRoots,
      featureLabels:
        Object.keys(featureLabelOverrides).length > 0
          ? featureLabelOverrides
          : undefined,
      derivedStandardInputs:
        Object.keys(bindingDefinitions).length > 0
          ? bindingDefinitions
          : undefined,
      inputBindingDefinitions:
        Object.keys(bindingDefinitions).length > 0
          ? bindingDefinitions
          : undefined,
      schemaVersion: 2,
    });
  }, [
    animatableComponents,
    autoInputs,
    bindings,
    customInputs,
    inputBindings,
    faceId,
    featureLabelOverrides,
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
    if (!rigGraphBuild) {
      setGraphStatus("idle");
      setGraphError(null);
      graphSummaryRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
      return;
    }

    const fatalIssues = rigGraphBuild.issues.fatal;
    if (fatalIssues.length > 0) {
      graphSummaryRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
      setGraphStatus("error");
      setGraphError(
        fatalIssues.length === 1 ? fatalIssues[0] : fatalIssues.join("; "),
      );
      return;
    }

    if (!graphSpecSignature) {
      setGraphStatus("idle");
      setGraphError(null);
      graphSummaryRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
      return;
    }

    let cancelled = false;

    setGraphStatus("loading");
    setGraphError(null);

    (async () => {
      try {
        await loadRigGraph(rigGraphBuild.spec);
        if (cancelled) {
          return;
        }
        graphSummaryRef.current = rigGraphBuild.summary;
        setGraphStatus("ready");
        setGraphError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        graphSummaryRef.current = null;
        setGraphStatus("error");
        setGraphError(err instanceof Error ? err.message : String(err));
        resetDrivenAnimatables();
      }
    })();

    return () => {
      cancelled = true;
      graphSummaryRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
    };
  }, [
    clearRigStaged,
    graphSpecSignature,
    loadRigGraph,
    resetDrivenAnimatables,
    rigGraphBuild,
    unloadRigGraph,
  ]);

  useEffect(() => {
    const summary = graphSummaryRef.current;
    if (graphStatus !== "ready" || !summary) {
      resetDrivenAnimatables();
      return;
    }

    clearRigStaged();

    const inputPaths = Array.isArray(summary.inputs) ? summary.inputs : [];
    inputPaths.forEach((graphPath) => {
      if (typeof graphPath !== "string") {
        return;
      }
      let value = 0;
      const segments = graphPath.split("/");
      if (segments.length >= 3) {
        const normalized = `/${segments.slice(2).join("/")}`;
        const inputMeta = standardInputsByPath.get(normalized);
        if (inputMeta) {
          const stored =
            inputValues[inputMeta.id] ?? inputMeta.defaultValue ?? 0;
          value = Number.isFinite(stored) ? Number(stored) : 0;
        }
      }
      stageRigInput(graphPath, { float: value });
    });

    const result = evalRigGraph();
    if (!result) {
      resetDrivenAnimatables();
      return;
    }

    const writes: WriteOpJSON[] = Array.isArray((result as any)?.writes)
      ? ((result as any).writes as WriteOpJSON[])
      : [];

    const nextDriven = new Set<string>();

    writes.forEach((write) => {
      if (!write || typeof write.path !== "string") {
        return;
      }
      const animatable = animatables[write.path];
      if (!animatable) {
        return;
      }
      const rawValue = convertValueJSONToRaw(
        animatable,
        write.value as ValueJSON,
      );
      if (rawValue === undefined) {
        return;
      }
      setValue(write.path, namespace, rawValue);
      nextDriven.add(write.path);
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
    animatables,
    clearRigStaged,
    evalRigGraph,
    graphStatus,
    inputValues,
    namespace,
    resetDrivenAnimatables,
    setValue,
    stageRigInput,
    standardInputsByPath,
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
    graphStatus,
    graphError,
    bindingIssues,
    featureLabelOverrides,
    managedStandardInputs,
    standardInputRoots,
    selectedStandardInputRoots,
    standardInputs,
    standardInputsById,
    inputValues,
    bindings,
    inputBindings,
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
    handleCreateCustomStandardInput,
    handleLinkChildInput,
    handleRenameGroup,
    handleEnsureParentBinding,
    handleUpdateStandardInput,
    handleDeleteCustomStandardInput,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleUpdateFeatureLabel,
    handleParentBindingInputChange,
    handleParentBindingRemapChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentResetBinding,
    handleSelectStandardInputRoots,
    handleFaceIdChange,
    handleFocusSelectionIndex,
    handleClearSelection,
    handleImportGraphSpec,
    setStoreState,
    collectAnimatableExportState,
  };
}
