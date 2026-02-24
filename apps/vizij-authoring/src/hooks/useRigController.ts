import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SetStateAction } from "react";
import {
  bindingFromDefinition,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  buildMachineReport,
  buildRigGraphSpec,
  createDefaultBinding,
  createDefaultInputValues,
  ensureBindingStructure,
  reconcileBindings,
  updateBindingSlotAlias,
  updateBindingWithInput,
  type AnimatableBinding,
  type BindingMap,
  type BindingTarget,
  type BuildGraphResult,
  type InputComposeMode,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import {
  useVizijStore,
  useVizijStoreSetter,
  type AnimatedFeature,
  type Feature,
  type Group,
  type VizijData,
  type World,
} from "@vizij/render";
import {
  SELF_BINDING_ID,
  buildAnimatableValue,
  createStandardRigInput,
  deriveStandardRigInputIdFromPath,
  extractAnimatableComponents,
  getLookup,
  createStandardRigInputFromPath,
  normalizeStandardRigGroup,
  normalizeStandardRigInputPath,
  resolveStandardRigInputId,
  stripStandardInputPathPrefix,
  type AnimatableComponent as AnimComponent,
  type AnimatableValue,
  type RigBindingDefinition,
  type RigBindingSlot,
  type StandardRigInput,
} from "@vizij/utils";
import { buildRigInputPath, isPoseControlInputPath } from "../poseRig/utils";
import { buildSceneGraphData } from "../scene/sceneGraph";
import {
  buildAutoRigInputBlueprints,
  type AutoRigInputBlueprintMetadata,
} from "../rig/autoInputs";
import type {
  PersistedAutoStandardInput,
  PersistedGraphInsight,
} from "../rig/persistence";
import { alertDialog } from "../utils/dialogs";
import { deriveAutoFaceId, sanitizeFaceId } from "../utils/faceId";
import { normalizeGraphPath } from "../utils/graphPaths";
import type { AutoInputState } from "../types/autoInputs";
import type { GraphRuntimeStore } from "../state/graphRuntimeStore";
import type { BindingAuthoringStore } from "../state/bindingAuthoringStore";
import type { SelectionStore } from "../state/selectionStore";
import { useBindingManager } from "./useBindingManager";
import { useDiscrepancyReview } from "./useDiscrepancyReview";
import { useFeatureLabels } from "./useFeatureLabels";
import { useManagedStandardInputs } from "./useManagedStandardInputs";
import { useStandardInputCollections } from "./useStandardInputCollections";
import { useStandardInputSelectionSync } from "./useStandardInputSelectionSync";
import { applyShapeInputRename } from "./shapeRenaming";
import {
  createCustomStandardInputEntry,
  updateStandardInputEntry,
} from "./standardInputMutations";
import { linkChildInput, unlinkChildInput } from "./standardInputLinks";
import {
  buildFallbackGraphPath,
  subscribeRuntimeInputBridgeAvailable,
} from "./graphRuntime";
import {
  resolveRuntimeGraphSpec,
  type RuntimeGraphSpec,
} from "./runtimeGraphSpec";
import { useRigGraphImport } from "./useRigGraphImport";
import type { FaceLoadPhaseUpdate } from "./useVizijAssetLoader";
import { useRigPersistence } from "./useRigPersistence";

const __DEV__ = process.env.NODE_ENV !== "production";

function resolvePersistedAutoKey(
  sourceId?: string | null,
  sourcePath?: string | null,
): string | null {
  if (sourceId && sourceId.length > 0) {
    return sourceId;
  }
  if (sourcePath && sourcePath.length > 0) {
    return normalizeStandardRigInputPath(sourcePath);
  }
  return null;
}

function createGraphInsightSnapshot(
  result: BuildGraphResult,
): PersistedGraphInsight {
  return {
    summary: {
      faceId: result.summary.faceId,
      inputs: [...result.summary.inputs],
      outputs: [...result.summary.outputs],
      bindings: result.summary.bindings.length,
    },
    issues: {
      fatal: [...result.issues.fatal],
      byTarget: Object.fromEntries(
        Object.entries(result.issues.byTarget).map(([targetId, issues]) => [
          targetId,
          [...issues],
        ]),
      ),
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildPoseComposeModeByInputId(
  poseConfig:
    | {
        poses?: Array<{
          values?: Record<string, number | undefined>;
          composeModes?: Record<string, unknown>;
        }>;
      }
    | null
    | undefined,
): Partial<Record<string, InputComposeMode>> {
  const next: Partial<Record<string, InputComposeMode>> = {};
  const poses = Array.isArray(poseConfig?.poses) ? poseConfig.poses : [];
  poses.forEach((pose) => {
    if (!pose || typeof pose !== "object") {
      return;
    }
    const targets =
      pose.values && typeof pose.values === "object" ? pose.values : {};
    Object.keys(targets).forEach((inputId) => {
      const rawMode =
        pose.composeModes && typeof pose.composeModes === "object"
          ? pose.composeModes[inputId]
          : undefined;
      next[inputId] = rawMode === "average" ? "average" : "add";
    });
  });
  return next;
}

function deriveAliasFromInputDescriptor(
  input?: StandardRigInput | null,
): string | null {
  if (!input) {
    return null;
  }
  const normalized = normalizeStandardRigInputPath(input.path);
  const segments = normalized.split("/").filter(Boolean);
  const fallback = input.id ?? input.label ?? null;
  const candidate =
    segments.length > 0 ? segments[segments.length - 1] : fallback;
  if (!candidate) {
    return null;
  }
  return candidate;
}

function isDefaultSlotAlias(slot: RigBindingSlot, index: number): boolean {
  if (slot.inputId === SELF_BINDING_ID) {
    return false;
  }
  const alias = slot.alias?.trim();
  if (!alias) {
    return true;
  }
  const normalizedAlias = alias.toLowerCase();
  if (normalizedAlias === "self") {
    return false;
  }
  const defaultAlias = `s${index + 1}`;
  if (normalizedAlias === defaultAlias) {
    return true;
  }
  const slotIdNormalized = slot.id?.trim().toLowerCase();
  if (slotIdNormalized && slotIdNormalized === normalizedAlias) {
    return true;
  }
  return false;
}

type AnimatableComponent = AnimComponent;

type StandardInputId = StandardRigInput["id"];

interface UseRigControllerOptions {
  namespace: string;
  rootId: string | null;
  sourceName: string | null;
  onLoadPhaseChange?: (update: FaceLoadPhaseUpdate) => void;
}

interface UseRigControllerStores {
  graphRuntimeStore: GraphRuntimeStore;
  bindingAuthoringStore: BindingAuthoringStore;
  selectionStore: SelectionStore;
}

interface RuntimeInputRoute {
  graphPath: string;
  defaultValue: number;
}

export type RigController = void;

export function useRigController(
  { namespace, rootId, sourceName, onLoadPhaseChange }: UseRigControllerOptions,
  stores: UseRigControllerStores,
): RigController {
  const { graphRuntimeStore, bindingAuthoringStore, selectionStore } = stores;
  const poseConfigSnapshot = useSyncExternalStore(
    graphRuntimeStore.subscribe,
    () => graphRuntimeStore.getState().poseConfig,
    () => graphRuntimeStore.getState().poseConfig,
  );
  const world = useVizijStore((state) => state.world) as World;
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const values = useVizijStore((state) => state.values);

  useEffect(() => {
    graphRuntimeStore.setState({
      world: world as World,
      animatables: animatables as Record<string, AnimatableValue>,
      values,
    });
  }, [animatables, graphRuntimeStore, values, world]);
  const elementSelection = useVizijStore((state) => state.elementSelection);
  const clearSelection = useVizijStore((state) => state.clearSelection);
  const setStoreState = useVizijStoreSetter();

  useEffect(() => {
    graphRuntimeStore.setState({ setStoreState });
  }, [graphRuntimeStore, setStoreState]);

  const getStageRuntimeInput = useCallback(
    () => graphRuntimeStore.getState().stageRuntimeInput,
    [graphRuntimeStore],
  );

  const [graphStatus, setGraphStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [runtimeInputBridgeEpoch, setRuntimeInputBridgeEpoch] = useState(0);
  const [runtimeInputMapRevision, setRuntimeInputMapRevision] = useState(0);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphWarning, setGraphWarning] = useState<string | null>(null);
  const pendingFaceRenameRef = useRef<string | null>(null);
  const faceRenameTokenRef = useRef<string | null>(null);

  useEffect(() => {
    graphRuntimeStore.setState({ graphStatus });
  }, [graphRuntimeStore, graphStatus]);

  useEffect(() => {
    graphRuntimeStore.setState({ graphError });
  }, [graphRuntimeStore, graphError]);
  useEffect(() => {
    graphRuntimeStore.setState({ graphWarning });
  }, [graphRuntimeStore, graphWarning]);

  useEffect(
    () =>
      subscribeRuntimeInputBridgeAvailable(graphRuntimeStore, () => {
        setRuntimeInputBridgeEpoch((prev) => prev + 1);
      }),
    [graphRuntimeStore],
  );

  const [faceId, setFaceIdState] = useState<string>("robot");
  const clearFaceRenameToken = useCallback(
    (token: string) => {
      graphRuntimeStore.setState((state) => {
        if (state.faceRenameToken !== token) {
          return;
        }
        return { ...state, faceRenameToken: null };
      });
      if (faceRenameTokenRef.current === token) {
        faceRenameTokenRef.current = null;
      }
      if (pendingFaceRenameRef.current === token) {
        pendingFaceRenameRef.current = null;
      }
    },
    [graphRuntimeStore],
  );

  const updateFaceId = useCallback(
    (value: SetStateAction<string>, { rename = false } = {}) => {
      setFaceIdState((previous) => {
        const nextValue = typeof value === "function" ? value(previous) : value;
        const trimmed = nextValue.trim();
        if (trimmed.length === 0) {
          return "";
        }
        const sanitized = sanitizeFaceId(trimmed);
        if (sanitized === previous && !rename) {
          return previous;
        }
        const faceRenameToken = rename ? sanitized : null;
        faceRenameTokenRef.current = faceRenameToken;
        pendingFaceRenameRef.current = faceRenameToken;
        if (rename) {
          // Clear the rename marker after the rename is applied so later face/root
          // changes trigger a full pose reset.
          setTimeout(() => clearFaceRenameToken(sanitized), 0);
        }
        return sanitized;
      });
    },
    [clearFaceRenameToken],
  );

  const setFaceId = useCallback(
    (value: SetStateAction<string>) => updateFaceId(value),
    [updateFaceId],
  );

  const renameFaceId = useCallback(
    (value: SetStateAction<string>) => updateFaceId(value, { rename: true }),
    [updateFaceId],
  );
  const [autoInputs, setAutoInputs] = useState<Map<string, AutoInputState>>(
    () => new Map(),
  );
  const GROUP_FALLBACK = "custom";

  const autoInputsRef = useRef(autoInputs);
  const [customInputs, setCustomInputs] = useState<StandardRigInput[]>([]);
  const customInputsRef = useRef(customInputs);
  const [selectedStandardInputRoots, setSelectedStandardInputRoots] = useState<
    string[]
  >([]);
  const [selectedStandardInputSubgroups, setSelectedStandardInputSubgroups] =
    useState<string[]>([]);
  const [disabledStandardInputIds, setDisabledStandardInputIds] = useState<
    string[]
  >([]);
  const [standardInputSchema, setStandardInputSchema] = useState<{
    id: string;
    version: string;
  } | null>({ id: "vizij-standard-face", version: "v1" });
  const [hiddenDriverIds, setHiddenDriverIds] = useState<Set<string>>(
    () => new Set(),
  );
  const viewerSelectionActiveRef = useRef(false);
  const [inputValues, setInputValues] = useState<StandardInputValues>({});
  const inputValuesRef = useRef<StandardInputValues>(inputValues);
  const updateInputValues = useCallback(
    (updater: (prev: StandardInputValues) => StandardInputValues) => {
      setInputValues((previous) => {
        const next = updater(previous);
        if (next !== previous) {
          inputValuesRef.current = next;
        }
        return next;
      });
    },
    [],
  );
  const isDev = process.env.NODE_ENV !== "production";
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console -- debug logger
      console.debug("[rig-controller]", ...args);
    }
  };
  const {
    featureLabelOverrides,
    setFeatureLabelOverrides,
    featureFlags,
    setFeatureFlags,
    handleFeatureFlagChange,
    handleUpdateFeatureLabel,
  } = useFeatureLabels();

  const handleSetStandardInputSchema = useCallback(
    (
      schema:
        | { id: string; version: string }
        | null
        | ((
            prev: { id: string; version: string } | null,
          ) => { id: string; version: string } | null),
    ) => {
      setStandardInputSchema((prev) =>
        typeof schema === "function" ? schema(prev) : schema,
      );
    },
    [],
  );

  const handleHideDriver = useCallback((inputId: string) => {
    setHiddenDriverIds((previous) => {
      if (previous.has(inputId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(inputId);
      return next;
    });
  }, []);

  const handleShowDriver = useCallback((inputId: string) => {
    setHiddenDriverIds((previous) => {
      if (!previous.has(inputId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(inputId);
      return next;
    });
  }, []);

  const handleShowAllDrivers = useCallback(() => {
    setHiddenDriverIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      return new Set();
    });
  }, []);
  const [graphInsights, setGraphInsights] =
    useState<PersistedGraphInsight | null>(null);

  useEffect(() => {
    graphRuntimeStore.setState({ graphInsights });
  }, [graphInsights, graphRuntimeStore]);
  const { discrepancyReview, openDiscrepancyReview, resolveDiscrepancyReview } =
    useDiscrepancyReview();

  useEffect(() => {
    graphRuntimeStore.setState({ discrepancyReview, resolveDiscrepancyReview });
  }, [discrepancyReview, graphRuntimeStore, resolveDiscrepancyReview]);

  const persistedAutoInputsRef = useRef<
    Map<string, PersistedAutoStandardInput>
  >(new Map());
  const pendingInputBindingDefinitionsRef = useRef<Record<
    string,
    RigBindingDefinition
  > | null>(null);
  const disabledInputBindingCacheRef = useRef<
    Map<string, RigBindingDefinition>
  >(new Map());
  const allStandardInputsRef = useRef<Map<string, StandardRigInput>>(new Map());
  const standardInputsByIdRef = useRef<Map<string, StandardRigInput>>(
    new Map(),
  );
  const disabledStandardInputIdsRef = useRef<Set<string>>(new Set());

  const drivenAnimatablesRef = useRef<Set<string>>(new Set());
  const graphSummaryRef = useRef<BuildGraphResult["summary"] | null>(null);
  const graphIrRef = useRef<BuildGraphResult["ir"] | null>(null);
  const lastGraphSummaryLogSignatureRef = useRef<string | null>(null);
  const lastKnownGoodRuntimeSpecRef = useRef<RuntimeGraphSpec | null>(null);
  const skipRuntimeUnloadRef = useRef(false);
  const runtimeInputRoutesByCanonicalIdRef = useRef<
    Map<string, RuntimeInputRoute>
  >(new Map());
  const runtimeInputGraphPathLookupRef = useRef<Map<string, string>>(new Map());
  const stagedRuntimeInputValuesRef = useRef<Map<string, number>>(new Map());
  const runtimeInputIdResolutionCacheRef = useRef<{
    sourceMap: Map<string, StandardRigInput> | null;
    cache: Map<string, string>;
  }>({
    sourceMap: null,
    cache: new Map(),
  });
  const autoPlayTokenRef = useRef<string | null>(null);

  const [graphInputDefaults, setGraphInputDefaults] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    graphRuntimeStore.setState({ graphInputDefaults });
  }, [graphInputDefaults, graphRuntimeStore]);
  const lastAutoFaceIdRef = useRef<string | null>(null);
  const lastLoadedFaceIdRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);

  const resolveRuntimeInputId = useCallback((inputId: string): string => {
    const normalized = inputId.trim();
    if (!normalized) {
      return inputId;
    }
    const sourceMap = standardInputsByIdRef.current;
    const cacheState = runtimeInputIdResolutionCacheRef.current;
    if (cacheState.sourceMap !== sourceMap) {
      cacheState.sourceMap = sourceMap;
      cacheState.cache = new Map();
    }
    const cached = cacheState.cache.get(normalized);
    if (cached) {
      return cached;
    }
    const resolved = resolveStandardRigInputId(normalized, sourceMap);
    cacheState.cache.set(normalized, resolved);
    return resolved;
  }, []);

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

  const maybeAutoAliasSlot = useCallback(
    (
      binding: AnimatableBinding,
      target: BindingTarget,
      slotId: string,
      input: StandardRigInput | undefined,
    ): AnimatableBinding => {
      if (!input) {
        return binding;
      }
      const slotIndex = binding.slots.findIndex((slot) => slot.id === slotId);
      if (slotIndex < 0) {
        return binding;
      }
      const slot = binding.slots[slotIndex]!;
      if (!isDefaultSlotAlias(slot, slotIndex)) {
        return binding;
      }
      const aliasCandidate = deriveAliasFromInputDescriptor(input);
      if (!aliasCandidate) {
        return binding;
      }
      return updateBindingSlotAlias(binding, target, slotId, aliasCandidate);
    },
    [],
  );
  const {
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
    handleEnableParentLocalControl,
    handleCreateParentDriverBinding,
  } = useBindingManager({
    componentsById,
    standardInputsByIdRef,
    allStandardInputsRef,
    maybeAutoAliasSlot,
    debugLog,
  });

  useEffect(() => {
    const validTargets = new Set(
      animatableComponents.map((component) => component.id),
    );
    applyBindingPatch((previous) => {
      let changed = false;
      const next: BindingMap = {};
      Object.entries(previous).forEach(([targetId, binding]) => {
        if (!validTargets.has(targetId)) {
          changed = true;
          return;
        }
        next[targetId] = binding;
      });
      return changed ? next : previous;
    });
  }, [animatableComponents, applyBindingPatch]);
  const handleCreateCustomStandardInput = useCallback(
    (path: string): StandardRigInput | null =>
      createCustomStandardInputEntry({
        path,
        autoInputsRef,
        setCustomInputs,
        updateInputValues,
      }),
    [setCustomInputs, updateInputValues],
  );

  const handleUpdateStandardInput = useCallback(
    (
      inputId: string,
      updates: {
        path?: string;
        label?: string;
        sourceId?: string | null;
        defaultValue?: number;
        range?: { min?: number; max?: number };
      },
    ) => {
      updateStandardInputEntry({
        inputId,
        updates,
        autoInputsRef,
        customInputsRef,
        setAutoInputs,
        setCustomInputs,
        persistedAutoInputsRef,
        resolvePersistedAutoKey,
        groupFallback: GROUP_FALLBACK,
      });
    },
    [autoInputsRef, customInputsRef, setAutoInputs, setCustomInputs],
  );

  const handleCloneStandardInputs = useCallback(
    (
      inputIds: readonly string[],
      options?: { labelSuffix?: string; pathSuffix?: string },
    ) => {
      const mapping = new Map<string, string>();
      const labelSuffix = options?.labelSuffix ?? " Copy";
      const pathSuffix = options?.pathSuffix ?? "_copy";

      const appendPathSuffix = (path: string, suffix: string): string => {
        const trimmed = path.trim();
        if (trimmed === "/") return `/${suffix.replace(/^_*/, "")}`;
        const segments = trimmed.split("/").filter(Boolean);
        if (segments.length === 0) {
          return `/${suffix.replace(/^_*/, "")}`;
        }
        let insertAt = 0;
        if (segments[0] === "rig") {
          if (segments.length >= 3 && segments[1] === "face") {
            insertAt = 2; // rig / face / <object>
          } else if (segments.length >= 2) {
            insertAt = 1; // rig / <object>
          }
        }
        segments[insertAt] = `${segments[insertAt]}${suffix}`;
        return `/${segments.join("/")}`;
      };
      setCustomInputs((previous) => {
        const existingIds = new Set<string>([
          ...previous.map((input) => input.id),
          ...Array.from(standardInputsByIdRef.current.keys()),
        ]);
        const existingPaths = new Set<string>(
          Array.from(allStandardInputsRef.current.values()).map((input) =>
            normalizeStandardRigInputPath(input.path),
          ),
        );
        const next = [...previous];

        inputIds.forEach((sourceId) => {
          if (mapping.has(sourceId)) {
            return;
          }
          const source = standardInputsByIdRef.current.get(sourceId);
          if (!source) return;
          let attempt = 1;
          let candidatePath = normalizeStandardRigInputPath(
            appendPathSuffix(source.path, pathSuffix),
          );
          let candidateId = source.id;
          while (
            existingIds.has(candidateId) ||
            existingPaths.has(candidatePath)
          ) {
            const suffix =
              attempt === 1 ? pathSuffix : `${pathSuffix}${attempt}`;
            candidatePath = normalizeStandardRigInputPath(
              appendPathSuffix(source.path, suffix),
            );
            const derived = createStandardRigInputFromPath(candidatePath);
            candidateId = derived.id;
            attempt += 1;
          }

          const cloned: StandardRigInput = {
            ...source,
            id: candidateId,
            path: candidatePath,
            label: `${source.label}${labelSuffix}`,
          };
          next.push(cloned);
          existingIds.add(candidateId);
          existingPaths.add(candidatePath);
          mapping.set(source.id, cloned.id);
        });

        return next;
      });

      if (mapping.size > 0) {
        updateInputValues((prev) => {
          const next = { ...prev };
          mapping.forEach((newId, oldId) => {
            const src = standardInputsByIdRef.current.get(oldId);
            if (src) {
              next[newId] = src.defaultValue ?? 0;
            }
          });
          return next;
        });
      }

      return mapping;
    },
    [standardInputsByIdRef, updateInputValues, allStandardInputsRef],
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

  const removeInputFromAnimatableBindings = useCallback(
    (inputId: string) => {
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
    },
    [setBindings],
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
      updateInputValues((previous) => {
        if (!Object.prototype.hasOwnProperty.call(previous, inputId)) {
          return previous;
        }
        const next = { ...previous };
        delete next[inputId];
        return next;
      });
      removeInputFromAnimatableBindings(inputId);
      pruneInputBindings(inputId, snapshot);
    },
    [pruneInputBindings, removeInputFromAnimatableBindings, updateInputValues],
  );

  const handleDisableStandardInput = useCallback(
    (inputId: string) => {
      setDisabledStandardInputIds((previous) => {
        if (previous.includes(inputId)) {
          return previous;
        }
        return [...previous, inputId];
      });
      const snapshot = new Map(standardInputsByIdRef.current.entries());
      const existingParentBinding = inputBindingsRef.current[inputId];
      if (existingParentBinding) {
        disabledInputBindingCacheRef.current.set(
          inputId,
          bindingToDefinition(existingParentBinding),
        );
      }
      pruneInputBindings(inputId, snapshot);
      removeInputFromAnimatableBindings(inputId);
    },
    [pruneInputBindings, removeInputFromAnimatableBindings],
  );

  const handleEnableStandardInput = useCallback((inputId: string) => {
    setDisabledStandardInputIds((previous) =>
      previous.filter((value) => value !== inputId),
    );
    const cachedDefinition = disabledInputBindingCacheRef.current.get(inputId);
    if (!cachedDefinition) {
      return;
    }
    const input = standardInputsByIdRef.current.get(inputId);
    if (!input) {
      disabledInputBindingCacheRef.current.delete(inputId);
      return;
    }
    const target = bindingTargetFromInput(input);
    const restored = ensureBindingStructure(
      bindingFromDefinition(target, cachedDefinition),
      target,
    );
    setInputBindings((previous) => ({
      ...previous,
      [inputId]: restored,
    }));
    disabledInputBindingCacheRef.current.delete(inputId);
  }, []);

  const autoBlueprintResult = useMemo(() => {
    return buildAutoRigInputBlueprints(
      world,
      animatables,
      animatableComponents,
      featureLabelOverrides,
    );
  }, [animatableComponents, animatables, featureLabelOverrides, world]);

  const autoBlueprints = autoBlueprintResult.blueprints;
  const blueprintRoots = autoBlueprintResult.roots;

  const componentsByIdRef = useRef(componentsById);

  useEffect(() => {
    componentsByIdRef.current = componentsById;
  }, [componentsById]);

  useEffect(() => {
    inputBindingsRef.current = inputBindings;
  }, [inputBindings]);

  useEffect(() => {
    disabledStandardInputIdsRef.current = new Set(disabledStandardInputIds);
  }, [disabledStandardInputIds]);

  const rebuildAutoInputs = useCallback(() => {
    setAutoInputs((previous) => {
      const next = new Map<string, AutoInputState>();
      const persisted = persistedAutoInputsRef.current;
      const nextPersisted = new Map<string, PersistedAutoStandardInput>();

      autoBlueprints.forEach((blueprint) => {
        let existingEntry: AutoInputState | undefined;
        previous.forEach((value) => {
          if (
            (blueprint.sourceId && value.sourceId === blueprint.sourceId) ||
            value.sourcePath === blueprint.path
          ) {
            existingEntry = value;
          }
        });

        const persistedKey = resolvePersistedAutoKey(
          blueprint.sourceId,
          blueprint.path,
        );
        const persistedEntry = persistedKey
          ? persisted.get(persistedKey)
          : undefined;
        const generatedLabel = blueprint.input.label;
        const generatedDefault = blueprint.input.defaultValue;
        const generatedRange = {
          min: blueprint.input.range.min,
          max: blueprint.input.range.max,
        };

        const existingHasCustomPath =
          existingEntry &&
          normalizeStandardRigInputPath(existingEntry.input.path) !==
            normalizeStandardRigInputPath(existingEntry.sourcePath);
        const existingPathOverride = existingHasCustomPath
          ? existingEntry?.input.path
          : undefined;
        const pathOverride =
          persistedEntry?.path ?? existingPathOverride ?? blueprint.input.path;

        const blueprintRoot =
          blueprint.metadata.root ?? blueprint.input.group ?? GROUP_FALLBACK;
        const existingRoot =
          existingEntry?.metadata.root ??
          existingEntry?.input.group ??
          GROUP_FALLBACK;
        const existingGroupValue = existingEntry?.input.group ?? GROUP_FALLBACK;
        const existingHasCustomGroup =
          existingEntry && existingGroupValue !== existingRoot;
        const existingGroupOverride = existingHasCustomGroup
          ? existingEntry?.input.group
          : undefined;
        const groupOverride =
          persistedEntry?.group ?? existingGroupOverride ?? blueprintRoot;

        const labelMatchesGenerated = existingEntry
          ? existingEntry.input.label === existingEntry.generatedLabel
          : true;
        const rangeMatchesGenerated = existingEntry
          ? existingEntry.input.range.min ===
              existingEntry.generatedRange.min &&
            existingEntry.input.range.max === existingEntry.generatedRange.max
          : true;
        const defaultMatchesGenerated = existingEntry
          ? existingEntry.input.defaultValue ===
            existingEntry.generatedDefaultValue
          : true;

        const nextLabel = labelMatchesGenerated
          ? (persistedEntry?.label ?? generatedLabel)
          : (existingEntry?.input.label ?? generatedLabel);
        const persistedRangeMin =
          persistedEntry?.range?.min ?? generatedRange.min;
        const persistedRangeMax =
          persistedEntry?.range?.max ?? generatedRange.max;
        const nextRangeMin = rangeMatchesGenerated
          ? persistedRangeMin
          : (existingEntry?.input.range.min ?? persistedRangeMin);
        const nextRangeMax = rangeMatchesGenerated
          ? persistedRangeMax
          : (existingEntry?.input.range.max ?? persistedRangeMax);
        const nextDefaultValue = defaultMatchesGenerated
          ? (persistedEntry?.defaultValue ?? generatedDefault)
          : (existingEntry?.input.defaultValue ?? generatedDefault);

        const resolvedSourceId =
          persistedEntry?.sourceId ??
          existingEntry?.input.sourceId ??
          blueprint.sourceId;

        const updatedInput = createStandardRigInput({
          id:
            existingEntry?.input.id ?? persistedEntry?.id ?? blueprint.input.id,
          path: pathOverride,
          label: nextLabel,
          group: groupOverride,
          defaultValue: nextDefaultValue,
          range: {
            min: nextRangeMin,
            max: nextRangeMax,
          },
          sourceId: resolvedSourceId,
        });

        const updatedMetadata: AutoRigInputBlueprintMetadata = {
          ...blueprint.metadata,
          root: groupOverride,
        };

        next.set(updatedInput.path, {
          input: updatedInput,
          metadata: updatedMetadata,
          generatedLabel,
          generatedDefaultValue: generatedDefault,
          generatedRange,
          sourcePath: blueprint.path,
          sourceId: resolvedSourceId ?? blueprint.sourceId,
        });

        const nextPersistedKey = resolvePersistedAutoKey(
          resolvedSourceId ?? blueprint.sourceId,
          blueprint.path,
        );
        if (nextPersistedKey) {
          nextPersisted.set(nextPersistedKey, {
            id: updatedInput.id,
            path: updatedInput.path,
            sourcePath: blueprint.path,
            sourceId: resolvedSourceId ?? blueprint.sourceId,
            group:
              updatedInput.group !== blueprint.input.group
                ? updatedInput.group
                : undefined,
            label:
              updatedInput.label !== generatedLabel
                ? updatedInput.label
                : undefined,
            defaultValue:
              updatedInput.defaultValue !== generatedDefault
                ? updatedInput.defaultValue
                : undefined,
            range:
              updatedInput.range.min !== generatedRange.min ||
              updatedInput.range.max !== generatedRange.max
                ? {
                    min: updatedInput.range.min,
                    max: updatedInput.range.max,
                  }
                : undefined,
          });
        }
      });

      persistedAutoInputsRef.current = nextPersisted;
      return next;
    });
  }, [autoBlueprints]);

  useEffect(() => {
    rebuildAutoInputs();
  }, [autoBlueprints, rebuildAutoInputs]);

  const { handleClearCachedState } = useRigPersistence({
    faceId,
    animatableComponents,
    autoInputs,
    customInputs,
    bindings,
    inputBindings,
    inputValues,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    disabledStandardInputIds,
    hiddenDriverIds,
    featureLabelOverrides,
    featureFlags,
    standardInputSchema,
    graphInsights,
    setAutoInputs,
    setCustomInputs,
    setBindings,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    setDisabledStandardInputIds,
    setHiddenDriverIds,
    setFeatureLabelOverrides,
    setStandardInputSchema: handleSetStandardInputSchema,
    setFeatureFlags,
    setGraphInsights,
    updateInputValues,
    pendingInputBindingDefinitionsRef,
    persistedAutoInputsRef,
    skipPersistRef,
    lastLoadedFaceIdRef,
    rebuildAutoInputs,
    alertDialog,
    pendingFaceRenameRef,
  });

  const refreshAutoMetadataForShape = useCallback(
    (shapeId: string, shapeName: string) => {
      setAutoInputs((previous) => {
        let changed = false;
        const next = new Map<string, AutoInputState>();
        previous.forEach((entry, key) => {
          if (entry.metadata.elementId === shapeId) {
            const updatedEntry: AutoInputState = {
              ...entry,
              metadata: {
                ...entry.metadata,
                elementName: shapeName,
              },
            };
            next.set(key, updatedEntry);
            if (updatedEntry !== entry) {
              changed = true;
            }
          } else {
            next.set(key, entry);
          }
        });
        return changed ? next : previous;
      });
    },
    [],
  );

  const renameInputsForShape = useCallback(
    (
      shapeId: string,
      oldSlug: string,
      newSlug: string,
      shapeName: string,
      previousName: string,
    ) => {
      applyShapeInputRename({
        shapeId,
        oldSlug,
        newSlug,
        shapeName,
        previousName,
        autoInputsRef,
        customInputsRef,
        setCustomInputs,
        setAutoInputs,
        allStandardInputsRef,
        setDisabledStandardInputIds,
        disabledInputBindingCacheRef,
        updateInputValues,
        setBindings,
        componentsByIdRef,
        setInputBindings,
        pendingInputBindingDefinitionsRef,
        persistedAutoInputsRef,
        refreshAutoMetadataForShape,
        setSelectedStandardInputRoots,
        setSelectedStandardInputSubgroups,
        setFeatureLabelOverrides,
        resolvePersistedAutoKey,
      });
    },
    [
      componentsByIdRef,
      pendingInputBindingDefinitionsRef,
      persistedAutoInputsRef,
      refreshAutoMetadataForShape,
      setAutoInputs,
      setBindings,
      setCustomInputs,
      setDisabledStandardInputIds,
      setInputBindings,
      updateInputValues,
      setSelectedStandardInputRoots,
      setFeatureLabelOverrides,
      setSelectedStandardInputSubgroups,
    ],
  );

  const managedStandardInputs = useManagedStandardInputs({
    autoBlueprints,
    autoInputs,
    customInputs,
    inputBindings,
    disabledStandardInputIds,
    resolvePersistedAutoKey,
  });

  const {
    standardInputs,
    standardInputsById,
    standardInputsByPath,
    standardInputMetadataById,
    elementRootLookup,
    allStandardInputSubgroups,
  } = useStandardInputCollections({
    managedStandardInputs,
    groupFallback: GROUP_FALLBACK,
    allStandardInputsRef,
    standardInputsByIdRef,
  });

  const faceSegment = useMemo(
    () => (faceId && faceId.length > 0 ? faceId : "face"),
    [faceId],
  );

  useEffect(() => {
    const faceRenameToken = faceRenameTokenRef.current;
    graphRuntimeStore.setState({
      faceId,
      faceSegment,
      faceRenameToken:
        faceRenameToken && faceRenameToken === faceId ? faceRenameToken : null,
    });
  }, [faceId, faceSegment, graphRuntimeStore]);

  const rigOutputLookup = useMemo(() => {
    const map = new Map<string, StandardRigInput>();
    standardInputs.forEach((input) => {
      const rigPath = buildRigInputPath(faceSegment, input.path);
      const normalizedRig = normalizeGraphPath(rigPath);
      if (normalizedRig) {
        map.set(normalizedRig, input);
      }
    });
    return map;
  }, [faceSegment, standardInputs]);

  const validOutputTargets = useMemo(
    () => new Set<string>(rigOutputLookup.keys()),
    [rigOutputLookup],
  );

  const sceneGraph = useMemo(
    () =>
      buildSceneGraphData({
        world,
        animatables,
        bindings,
        animatableComponents,
        standardInputsById,
        featureLabelOverrides,
      }),
    [
      animatableComponents,
      animatables,
      bindings,
      featureLabelOverrides,
      standardInputsById,
      world,
    ],
  );

  useEffect(() => {
    bindingAuthoringStore.setState({
      sceneObjects: sceneGraph.nodes,
      sceneObjectRoots: sceneGraph.rootIds,
    });
  }, [bindingAuthoringStore, sceneGraph]);

  const standardInputRoots = useMemo(() => {
    const rootSet = new Set<string>();
    managedStandardInputs.forEach((entry) => {
      const root = entry.metadata?.root ?? entry.input.group ?? GROUP_FALLBACK;
      if (root) {
        rootSet.add(root);
      }
    });
    if (rootSet.size === 0) {
      blueprintRoots.forEach((root) => rootSet.add(root));
    }
    return Array.from(rootSet).sort((a, b) => a.localeCompare(b));
  }, [blueprintRoots, managedStandardInputs]);

  useStandardInputSelectionSync({
    elementSelection,
    namespace,
    world,
    standardInputRoots,
    elementRootLookup,
    selectedRoots: selectedStandardInputRoots,
    setSelectedRoots: setSelectedStandardInputRoots,
    selectedSubgroups: selectedStandardInputSubgroups,
    setSelectedSubgroups: setSelectedStandardInputSubgroups,
    allStandardInputSubgroups,
    viewerSelectionActiveRef,
  });

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
    const poseComposeModesByInputId =
      buildPoseComposeModeByInputId(poseConfigSnapshot);
    return buildRigGraphSpec({
      faceId,
      animatables,
      components: animatableComponents,
      bindings,
      inputsById: standardInputsById,
      inputBindings,
      inputMetadata: standardInputMetadataById,
      inputComposeModesById: poseComposeModesByInputId,
    });
  }, [
    animatableComponents,
    animatables,
    bindings,
    faceId,
    inputBindings,
    poseConfigSnapshot,
    standardInputMetadataById,
    standardInputsById,
  ]);

  const runtimeGraphSpec = useMemo(() => {
    const resolved = resolveRuntimeGraphSpec(
      rigGraphBuild,
      lastKnownGoodRuntimeSpecRef.current,
    );
    if (!resolved.blocked && resolved.runtimeSpec) {
      lastKnownGoodRuntimeSpecRef.current = resolved.runtimeSpec;
    }
    return resolved;
  }, [rigGraphBuild]);

  skipRuntimeUnloadRef.current =
    runtimeGraphSpec.blocked && Boolean(lastKnownGoodRuntimeSpecRef.current);

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

  useEffect(() => {
    graphRuntimeStore.setState({
      graphSpec: runtimeGraphSpec.runtimeSpec?.spec ?? null,
    });
  }, [graphRuntimeStore, runtimeGraphSpec.runtimeSpec]);

  const graphMachineReport = useMemo(
    () => (rigGraphBuild ? buildMachineReport(rigGraphBuild) : null),
    [rigGraphBuild],
  );

  useEffect(() => {
    graphRuntimeStore.setState({ graphMachineReport });
  }, [graphMachineReport, graphRuntimeStore]);

  const getGraphIr = useCallback(() => graphIrRef.current, []);

  useEffect(() => {
    graphRuntimeStore.setState({ getGraphIr });
  }, [getGraphIr, graphRuntimeStore]);

  useEffect(() => {
    if (!rigGraphBuild) {
      return;
    }
    setGraphInsights(createGraphInsightSnapshot(rigGraphBuild));
  }, [rigGraphBuild]);

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

  const stageInputsFromState = useCallback(() => {
    if (graphStatus !== "ready" || graphError) {
      return;
    }
    const routesByCanonicalId = runtimeInputRoutesByCanonicalIdRef.current;
    if (routesByCanonicalId.size === 0) {
      return;
    }
    const stageRuntimeInput = getStageRuntimeInput();
    if (!stageRuntimeInput) {
      return;
    }
    routesByCanonicalId.forEach((route, canonicalInputId) => {
      const stored = inputValuesRef.current[canonicalInputId];
      const value =
        typeof stored === "number" && Number.isFinite(stored)
          ? stored
          : route.defaultValue;
      const previous = stagedRuntimeInputValuesRef.current.get(route.graphPath);
      if (previous !== undefined && Object.is(previous, value)) {
        return;
      }
      stageRuntimeInput(route.graphPath, value);
      stagedRuntimeInputValuesRef.current.set(route.graphPath, value);
    });
  }, [getStageRuntimeInput, graphError, graphStatus]);

  const graphTimeSeconds = 0;
  const graphPlaybackState = "paused" as const;
  const graphPlaybackAvailable = false;
  const graphFrameRate = 0;
  const playGraph = () => {};
  const pauseGraph = () => {};
  const stopGraph = () => {};
  const stepGraph = () => {};

  useEffect(() => {
    graphRuntimeStore.setState({
      graphTimeSeconds,
      graphPlaybackState,
      graphPlaybackAvailable,
      graphFrameRate,
      playGraph,
      pauseGraph,
      stopGraph,
      stepGraph,
    });
  }, [
    graphFrameRate,
    graphPlaybackAvailable,
    graphPlaybackState,
    graphRuntimeStore,
    graphTimeSeconds,
    pauseGraph,
    playGraph,
    stepGraph,
    stopGraph,
  ]);

  useEffect(() => {
    if (graphStatus !== "ready" || graphError) {
      return;
    }
    if (!rootId) {
      return;
    }
    const faceToken = faceId && faceId.length > 0 ? faceId : "default";
    const token = `${rootId}::${faceToken}`;
    if (autoPlayTokenRef.current === token) {
      return;
    }
    autoPlayTokenRef.current = token;
  }, [faceId, graphStatus, graphError, rootId]);

  useEffect(() => {
    if (graphStatus === "ready") {
      return;
    }
    autoPlayTokenRef.current = null;
  }, [graphStatus]);

  const rootRenderable = useMemo(() => {
    return rootId ? (world[rootId] as Group | undefined) : undefined;
  }, [rootId, world]);

  useEffect(() => {
    autoInputsRef.current = autoInputs;
  }, [autoInputs]);

  useEffect(() => {
    customInputsRef.current = customInputs;
  }, [customInputs]);

  useEffect(() => {
    const activeInputsById = standardInputsByIdRef.current;
    setBindings((previous) => {
      let changed = false;
      const next: BindingMap = { ...previous };
      const autoInputsBySourceId = new Map<string, AutoInputState>();

      autoInputs.forEach((entry) => {
        if (entry.sourceId) {
          autoInputsBySourceId.set(entry.sourceId, entry);
        }
      });

      autoBlueprints.forEach((blueprint) => {
        const entry =
          (blueprint.sourceId
            ? autoInputsBySourceId.get(blueprint.sourceId)
            : undefined) ?? autoInputs.get(blueprint.path);
        const resolvedInput = entry?.input ?? blueprint.input;
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
        if (ensured.inputId && activeInputsById.has(ensured.inputId)) {
          return;
        }
        const updated = updateBindingWithInput(ensured, target, resolvedInput);
        if (updated !== ensured) {
          next[componentId] = updated;
          changed = true;
        } else if (!Object.prototype.hasOwnProperty.call(next, componentId)) {
          next[componentId] = ensured;
        }
      });

      return changed ? next : previous;
    });
  }, [autoBlueprints, autoInputs, standardInputsByIdRef]);

  useEffect(() => {
    updateInputValues((previous) => {
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
  }, [managedStandardInputs, updateInputValues]);

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

  const stageGraphInputValue = useCallback(
    (inputId: string, value: number) => {
      if (graphStatus !== "ready" || graphError) {
        if (__DEV__) {
          console.warn(
            "[vizij] skipped staging input while graph not ready",
            inputId,
            value,
          );
        }
        return;
      }
      const trimmedInputId = inputId.trim();
      const resolvedInputId = resolveRuntimeInputId(trimmedInputId);
      const graphPath =
        runtimeInputGraphPathLookupRef.current.get(resolvedInputId) ??
        runtimeInputGraphPathLookupRef.current.get(trimmedInputId) ??
        null;
      if (!graphPath) {
        if (__DEV__) {
          console.warn("[vizij] no graph input binding for", inputId, value);
        }
        return;
      }
      const previous = stagedRuntimeInputValuesRef.current.get(graphPath);
      if (previous !== undefined && Object.is(previous, value)) {
        return;
      }
      const stageRuntimeInput = getStageRuntimeInput();
      if (!stageRuntimeInput) {
        return;
      }
      stageRuntimeInput(graphPath, value);
      stagedRuntimeInputValuesRef.current.set(graphPath, value);
    },
    [getStageRuntimeInput, graphError, graphStatus, resolveRuntimeInputId],
  );

  const handleInputValueChange = useCallback(
    (inputId: string, value: number) => {
      const resolvedInputId = resolveRuntimeInputId(inputId);
      updateInputValues((previous) => ({
        ...previous,
        [resolvedInputId]: value,
      }));
      stageGraphInputValue(resolvedInputId, value);
    },
    [resolveRuntimeInputId, stageGraphInputValue, updateInputValues],
  );

  const applyStandardInputBatch = useCallback(
    (
      updates: Record<StandardInputId, number>,
      options?: { replace?: boolean },
    ) => {
      if (!updates || typeof updates !== "object") {
        return;
      }
      // Relaxed check: allow all updates, similar to handleInputValueChange
      const entries = Object.entries(updates) as Array<
        [StandardInputId, number]
      >;

      if (entries.length === 0) {
        return;
      }
      updateInputValues((previous) => {
        if (options?.replace) {
          const next: StandardInputValues = {};
          const entryIds = new Set<StandardInputId>();
          let changed = false;
          entries.forEach(([inputId, value]) => {
            const resolvedInputId = resolveRuntimeInputId(inputId);
            entryIds.add(resolvedInputId);
            next[resolvedInputId] = value;
            if (!changed && previous[resolvedInputId] !== value) {
              changed = true;
            }
          });
          if (!changed) {
            const previousKeys = Object.keys(previous);
            if (previousKeys.length !== entryIds.size) {
              changed = true;
            } else if (
              previousKeys.some((key) => !entryIds.has(key as StandardInputId))
            ) {
              changed = true;
            }
          }
          return changed ? next : previous;
        }
        let changed = false;
        const next: StandardInputValues = { ...previous };
        entries.forEach(([inputId, value]) => {
          const resolvedInputId = resolveRuntimeInputId(inputId);
          if (next[resolvedInputId] !== value) {
            next[resolvedInputId] = value;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
      entries.forEach(([inputId, value]) => {
        const resolvedInputId = resolveRuntimeInputId(inputId);
        stageGraphInputValue(resolvedInputId, value);
      });
    },
    [resolveRuntimeInputId, stageGraphInputValue, updateInputValues],
  );

  const handleResetAllInputValues = useCallback(() => {
    updateInputValues((previous) => {
      const defaults = createDefaultInputValues(
        managedStandardInputs.map((entry) => entry.input),
      );
      const previousKeys = Object.keys(previous);
      const defaultKeys = Object.keys(defaults);
      if (
        previousKeys.length === defaultKeys.length &&
        defaultKeys.every((key) => previous[key] === defaults[key])
      ) {
        return previous;
      }
      return defaults;
    });
  }, [managedStandardInputs, updateInputValues]);

  const handleSelectStandardInputRoots = useCallback(
    (nextRoots: string[]) => {
      const validRoots = new Set<string>(standardInputRoots);
      const normalized = Array.from(
        new Set(nextRoots.filter((root) => validRoots.has(root))),
      );
      setSelectedStandardInputRoots(normalized);
    },
    [standardInputRoots],
  );

  const handleSelectStandardInputSubgroups = useCallback(
    (nextSubgroups: string[]) => {
      const filtered = nextSubgroups.filter((token) =>
        allStandardInputSubgroups.has(token),
      );
      const normalized = Array.from(new Set(filtered));
      setSelectedStandardInputSubgroups(normalized);
    },
    [allStandardInputSubgroups],
  );

  const handleRenameShape = useCallback(
    (shapeId: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed) {
        return;
      }
      const renderable = world[shapeId];
      if (!renderable) {
        return;
      }
      const currentName = renderable.name ?? "";
      const shapeKind = renderable.type === "group" ? "group" : "shape";
      if (currentName === trimmed) {
        return;
      }
      const oldSlug = normalizeStandardRigGroup(currentName, shapeKind);
      const newSlug = normalizeStandardRigGroup(trimmed, shapeKind);

      setStoreState((state: VizijData) => {
        const current = state.world[shapeId];
        if (!current || current.name === trimmed) {
          return state;
        }

        const featureMap = current.features as Record<
          string,
          Feature | undefined
        >;
        const updatedFeatures: Record<string, Feature | undefined> = {
          ...featureMap,
        };
        const updatedAnimatables = { ...state.animatables };
        let featureChanged = false;
        let animatableChanged = false;

        const renameText = (
          value: string | undefined | null,
        ): string | undefined => {
          if (!value) {
            return value ?? undefined;
          }
          const trimmedValue = value.trim();
          if (trimmedValue === currentName) {
            return value.replace(trimmedValue, trimmed);
          }
          if (trimmedValue.startsWith(`${currentName} `)) {
            const suffix = trimmedValue.slice(currentName.length);
            return value.replace(trimmedValue, `${trimmed}${suffix}`);
          }
          return value;
        };

        Object.entries(featureMap).forEach(([featureKey, featureValue]) => {
          const feature = featureValue as Feature;
          if (!feature) {
            return;
          }
          if ("label" in feature) {
            const existingLabel = feature.label;
            const replacement = renameText(existingLabel);
            if (replacement && replacement !== existingLabel) {
              updatedFeatures[featureKey] = {
                ...feature,
                label: replacement,
              } as Feature;
              featureChanged = true;
            }
          }

          if (feature.animated) {
            const animId = (feature as AnimatedFeature).value;
            const descriptor = updatedAnimatables[animId];
            if (descriptor) {
              const renamedName = renameText(descriptor.name);
              const renamedOutput = renameText(descriptor.pub?.output);
              if (
                (renamedName && renamedName !== descriptor.name) ||
                (descriptor.pub?.output &&
                  renamedOutput !== descriptor.pub.output)
              ) {
                updatedAnimatables[animId] = {
                  ...descriptor,
                  name: renamedName ?? descriptor.name,
                  pub: descriptor.pub
                    ? {
                        ...descriptor.pub,
                        output: renamedOutput ?? descriptor.pub.output,
                      }
                    : descriptor.pub,
                } as typeof descriptor;
                animatableChanged = true;
              }
            }
          }
        });

        return {
          world: {
            ...state.world,
            [shapeId]: {
              ...current,
              name: trimmed,
              features: featureChanged
                ? (updatedFeatures as typeof current.features)
                : current.features,
            },
          },
          animatables: animatableChanged
            ? updatedAnimatables
            : state.animatables,
        } as Partial<VizijData>;
      });

      if (oldSlug !== newSlug) {
        renameInputsForShape(shapeId, oldSlug, newSlug, trimmed, currentName);
      } else {
        refreshAutoMetadataForShape(shapeId, trimmed);
      }
    },
    [renameInputsForShape, refreshAutoMetadataForShape, setStoreState, world],
  );

  const emitLoadPhase = useCallback(
    (update: FaceLoadPhaseUpdate) => {
      const operationId =
        update.operationId ??
        (update.substepId ? `${update.stepId}:${update.substepId}` : undefined);
      onLoadPhaseChange?.({
        ...update,
        operationId,
      });
    },
    [onLoadPhaseChange],
  );

  const handleImportGraphSpec = useRigGraphImport({
    faceId,
    animatables,
    animatableComponents,
    world,
    featureLabelOverrides,
    setAutoInputs,
    setCustomInputs,
    updateInputValues,
    setBindings,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    setFaceId: renameFaceId,
    skipPersistRef,
    persistedAutoInputsRef,
    lastLoadedFaceIdRef,
    openDiscrepancyReview,
    alertDialog,
    debugLog,
    pendingFaceRenameRef,
    onImportPhaseChange: emitLoadPhase,
  });

  useEffect(() => {
    graphRuntimeStore.setState({ handleImportGraphSpec });
  }, [graphRuntimeStore, handleImportGraphSpec]);

  const handleLinkChildInput = useCallback(
    (parentId: string, childId: string) => {
      linkChildInput({
        parentId,
        childId,
        updateInputBinding,
        standardInputsByIdRef,
        allStandardInputsRef,
      });
    },
    [allStandardInputsRef, standardInputsByIdRef, updateInputBinding],
  );

  const handleUnlinkChildInput = useCallback(
    (parentId: string, childId: string) => {
      unlinkChildInput({
        parentId,
        childId,
        updateInputBinding,
        standardInputsByIdRef,
        allStandardInputsRef,
      });
    },
    [allStandardInputsRef, standardInputsByIdRef, updateInputBinding],
  );

  const handleFaceIdChange = renameFaceId;

  useEffect(() => {
    graphRuntimeStore.setState({ handleFaceIdChange });
  }, [graphRuntimeStore, handleFaceIdChange]);

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
    selectionStore.setState({
      selectionStack: elementSelection,
      handleFocusSelectionIndex,
      handleClearSelection,
    });
  }, [
    elementSelection,
    handleClearSelection,
    handleFocusSelectionIndex,
    selectionStore,
  ]);

  useEffect(() => {
    setBindings((previous) =>
      reconcileBindings(previous, animatableComponents),
    );
  }, [animatableComponents]);

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
      setGraphWarning(null);
      emitLoadPhase({
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
        status: "pending",
      });
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      return;
    }

    emitLoadPhase({
      stepId: "runtime-stabilization",
      substepId: "settle-recompiles",
      status: "active",
    });

    const fatalIssues = rigGraphBuild.issues.fatal;
    if (fatalIssues.length > 0) {
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      setGraphStatus("error");
      setGraphError(
        fatalIssues.length === 1 ? fatalIssues[0] : fatalIssues.join("; "),
      );
      setGraphWarning(null);
      emitLoadPhase({
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
        status: "error",
      });
      return;
    }

    if (runtimeGraphSpec.blocked || !runtimeGraphSpec.runtimeSpec) {
      if (!skipRuntimeUnloadRef.current) {
        graphSummaryRef.current = null;
        graphIrRef.current = null;
        resetDrivenAnimatables();
        setGraphStatus("error");
      } else {
        setGraphStatus("ready");
      }
      setGraphError(
        runtimeGraphSpec.warning ?? "IR compile failed. Runtime apply blocked.",
      );
      setGraphWarning(null);
      emitLoadPhase({
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
        status: "error",
      });
      return;
    }

    graphSummaryRef.current = rigGraphBuild.summary;
    graphIrRef.current = rigGraphBuild.ir ?? null;
    if (__DEV__) {
      const signature = JSON.stringify({
        faceId,
        inputs: rigGraphBuild.summary.inputs.length,
        outputs: rigGraphBuild.summary.outputs.length,
        sampleInput: rigGraphBuild.summary.inputs[0] ?? null,
        sampleOutput: rigGraphBuild.summary.outputs[0] ?? null,
      });
      if (signature !== lastGraphSummaryLogSignatureRef.current) {
        lastGraphSummaryLogSignatureRef.current = signature;
        console.log("[rig-controller] graph summary", {
          faceId,
          inputs: rigGraphBuild.summary.inputs.length,
          outputs: rigGraphBuild.summary.outputs.length,
          sampleInput: rigGraphBuild.summary.inputs[0],
          sampleOutput: rigGraphBuild.summary.outputs[0],
          sampleOutputInAnimatables: rigGraphBuild.summary.outputs[0]
            ? Boolean(animatables[rigGraphBuild.summary.outputs[0]])
            : false,
        });
      }
    }
    setGraphStatus("ready");
    setGraphError(null);
    setGraphWarning(runtimeGraphSpec.warning ?? null);
    emitLoadPhase({
      stepId: "runtime-stabilization",
      substepId: "settle-recompiles",
      status: "complete",
    });
  }, [
    faceId,
    emitLoadPhase,
    resetDrivenAnimatables,
    rigGraphBuild,
    runtimeGraphSpec,
  ]);

  useEffect(() => {
    const summary = graphSummaryRef.current;
    if (graphStatus !== "ready" || !summary) {
      runtimeInputRoutesByCanonicalIdRef.current = new Map();
      runtimeInputGraphPathLookupRef.current = new Map();
      stagedRuntimeInputValuesRef.current = new Map();
      setGraphInputDefaults({});
      setRuntimeInputMapRevision((previous) => previous + 1);
      resetDrivenAnimatables();
      return;
    }

    const facePrefix = `rig/${faceId}/`;
    const summaryInputPaths = Array.isArray(summary.inputs)
      ? summary.inputs
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.replace(/^\/+/, ""))
      : [];

    const routesByCanonicalId = new Map<string, RuntimeInputRoute>();
    const graphPathLookupByInputId = new Map<string, string>();
    const defaults: Record<string, number> = {};
    const registerInputRoute = (
      inputId: string,
      graphPath: string,
      defaultValue: number,
    ) => {
      const canonicalInputId = resolveRuntimeInputId(inputId);
      if (!canonicalInputId) {
        return;
      }
      if (!routesByCanonicalId.has(canonicalInputId)) {
        routesByCanonicalId.set(canonicalInputId, {
          graphPath,
          defaultValue,
        });
      }
      graphPathLookupByInputId.set(canonicalInputId, graphPath);
      if (canonicalInputId !== inputId) {
        graphPathLookupByInputId.set(inputId, graphPath);
      }
      defaults[canonicalInputId] = defaultValue;
    };

    summaryInputPaths.forEach((graphPath) => {
      if (isPoseControlInputPath(graphPath)) {
        // Pose-control graph inputs are internal composition channels and
        // should not become editable direct-input routes.
        return;
      }
      let matched: StandardRigInput | undefined;
      let remainder = graphPath;
      const normalizedGraphPath = normalizeGraphPath(graphPath);
      if (normalizedGraphPath) {
        matched = rigOutputLookup.get(normalizedGraphPath);
      }
      if (!matched) {
        // Handle legacy/alternate graph path shapes when a direct
        // canonical lookup does not apply.
        if (graphPath.startsWith(facePrefix)) {
          remainder = graphPath.slice(facePrefix.length);
        } else if (graphPath.startsWith("rig/")) {
          const segments = graphPath.split("/");
          if (segments.length >= 3) {
            remainder = segments.slice(2).join("/");
          } else {
            remainder = segments.slice(1).join("/");
          }
        }
        remainder = remainder.replace(/^\/+/g, "");
        const candidatePaths = new Set<string>([
          `/${remainder}`,
          stripStandardInputPathPrefix(`/${remainder}`),
        ]);
        if (remainder.startsWith("autorig/")) {
          candidatePaths.add(
            `/rig/element/${remainder.slice("autorig/".length)}`,
          );
        }
        if (remainder.startsWith("rig/element/")) {
          candidatePaths.add(
            `/autorig/${remainder.slice("rig/element/".length)}`,
          );
        }
        if (remainder.startsWith("pose/control/")) {
          candidatePaths.add(
            `/autorig/${remainder.slice("pose/control/".length)}`,
          );
        }
        if (remainder.startsWith("rig/control/")) {
          candidatePaths.add(
            `/autorig/${remainder.slice("rig/control/".length)}`,
          );
        }
        for (const candidatePath of Array.from(candidatePaths)) {
          const normalizedCandidate =
            normalizeStandardRigInputPath(candidatePath);
          matched = standardInputsByPath.get(normalizedCandidate);
          if (matched) {
            break;
          }
        }
      }
      if (!matched) {
        const candidateId = deriveStandardRigInputIdFromPath(`/${remainder}`);
        matched = standardInputsById.get(candidateId);
      }
      if (matched) {
        registerInputRoute(matched.id, graphPath, matched.defaultValue ?? 0);
      }
    });

    if (faceId) {
      managedStandardInputs.forEach(({ input }) => {
        const canonicalInputId = resolveRuntimeInputId(input.id);
        if (routesByCanonicalId.has(canonicalInputId)) {
          return;
        }
        const fallbackPath = buildFallbackGraphPath(faceId, input);
        registerInputRoute(input.id, fallbackPath, input.defaultValue ?? 0);
      });
    }

    runtimeInputRoutesByCanonicalIdRef.current = routesByCanonicalId;
    runtimeInputGraphPathLookupRef.current = graphPathLookupByInputId;
    setGraphInputDefaults(defaults);
    setRuntimeInputMapRevision((previous) => previous + 1);
  }, [
    faceId,
    graphStatus,
    managedStandardInputs,
    resetDrivenAnimatables,
    resolveRuntimeInputId,
    standardInputsById,
    standardInputsByPath,
    rigOutputLookup,
  ]);

  useEffect(() => {
    stagedRuntimeInputValuesRef.current = new Map();
  }, [runtimeInputBridgeEpoch]);

  useEffect(() => {
    stageInputsFromState();
  }, [
    graphStatus,
    runtimeInputBridgeEpoch,
    runtimeInputMapRevision,
    stageInputsFromState,
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
      nextValues.delete(lookupKey);
      nextAnimatables[animId] = animatable;
    }

    return {
      appliedOverrides,
      nextAnimatables,
      nextValues,
      effectiveAnimatables: appliedOverrides ? nextAnimatables : animatables,
    };
  }, [animatables, namespace, values]);

  useEffect(() => {
    bindingAuthoringStore.setState({
      bindingIssues,
      featureLabelOverrides,
      featureFlags,
      standardInputSchema,
      managedStandardInputs,
      standardInputRoots,
      selectedStandardInputRoots,
      selectedStandardInputSubgroups,
      standardInputs,
      standardInputsById,
      standardInputsByPath,
      rigOutputLookup,
      validOutputTargets,
      inputValues,
      bindings,
      inputBindings,
      animatableComponents,
      handleInputValueChange,
      applyStandardInputBatch,
      handleResetAllInputValues,
      handleClearCachedState,
      handleBindingInputChange,
      handleResetBinding,
      applyBindingPatch,
      applyInputBindingPatch,
      handleCreateCustomStandardInput,
      handleLinkChildInput,
      handleUnlinkChildInput,
      handleRenameShape,
      handleUpdateStandardInput,
      handleDisableStandardInput,
      handleEnableStandardInput,
      handleDeleteCustomStandardInput,
      handleAddBindingSlot,
      handleRemoveBindingSlot,
      handleUpdateBindingExpression,
      handleUpdateBindingSlotAlias,
      handleEnsureParentBinding,
      handleBindingSlotValueTypeChange,
      handleParentBindingInputChange,
      handleParentAddBindingSlot,
      handleParentRemoveBindingSlot,
      handleParentBindingExpressionChange,
      handleParentBindingSlotAliasChange,
      handleParentBindingSlotValueTypeChange,
      handleParentResetBinding,
      handleEnableParentLocalControl,
      handleUpdateFeatureLabel,
      setFeatureLabelOverrides,
      setStandardInputSchema: handleSetStandardInputSchema,
      handleFeatureFlagChange,
      handleSelectStandardInputRoots,
      handleSelectStandardInputSubgroups,
      collectAnimatableExportState,
      hiddenDriverIds,
      handleHideDriver,
      handleShowDriver,
      handleShowAllDrivers,
      handleCreateParentDriverBinding,
      handleCloneStandardInputs,
    });
  }, [
    animatableComponents,
    applyStandardInputBatch,
    bindingAuthoringStore,
    bindingIssues,
    bindings,
    collectAnimatableExportState,
    featureFlags,
    featureLabelOverrides,
    handleAddBindingSlot,
    handleBindingInputChange,
    applyBindingPatch,
    applyInputBindingPatch,
    handleBindingSlotValueTypeChange,
    handleClearCachedState,
    handleCreateCustomStandardInput,
    handleDeleteCustomStandardInput,
    handleDisableStandardInput,
    handleEnableStandardInput,
    handleEnsureParentBinding,
    handleFeatureFlagChange,
    handleHideDriver,
    handleInputValueChange,
    handleLinkChildInput,
    handleCloneStandardInputs,
    handleParentAddBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingInputChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentRemoveBindingSlot,
    handleParentResetBinding,
    handleEnableParentLocalControl,
    handleShowAllDrivers,
    handleShowDriver,
    setFeatureLabelOverrides,
    handleRenameShape,
    handleResetAllInputValues,
    handleResetBinding,
    handleSelectStandardInputRoots,
    handleSelectStandardInputSubgroups,
    handleUnlinkChildInput,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleUpdateFeatureLabel,
    handleUpdateStandardInput,
    inputBindings,
    inputValues,
    managedStandardInputs,
    hiddenDriverIds,
    handleCreateParentDriverBinding,
    handleEnableParentLocalControl,
    rigOutputLookup,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    standardInputRoots,
    standardInputs,
    standardInputsById,
    standardInputsByPath,
    validOutputTargets,
  ]);
}
