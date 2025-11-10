import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useVizijStore,
  useVizijStoreSetter,
  type Selection,
  type VizijData,
  type Group,
  type World,
  type Feature,
  type AnimatedFeature,
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
  createDefaultInputValues,
  reconcileBindings,
  updateBindingWithInput,
  ensureBindingStructure,
  addBindingSlot,
  removeBindingSlot,
  updateBindingExpression,
  updateBindingSlotAlias,
  updateBindingSlotRemap,
  updateBindingSlotValueType,
  buildCanonicalBindingExpression,
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
  type BindingValueType,
} from "@vizij/node-graph-authoring";
import type { RemapSettings } from "@vizij/utils";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  deriveStandardRigInputIdFromPath,
  normalizeStandardRigInputPath,
  normalizeStandardRigGroup,
  STANDARD_RIG_INPUTS,
  stripStandardInputPathPrefix,
  type RigBindingDefinition,
  type RigBindingSlot,
  type StandardRigInput,
} from "@vizij/utils";
import {
  loadRigState,
  saveRigState,
  deleteRigState,
  type PersistedAutoStandardInput,
  type PersistedGraphInsight,
} from "../rig/persistence";
import { deriveAutoFaceId, sanitizeFaceId } from "../utils/faceId";
import { alertDialog, confirmDialog } from "../utils/dialogs";
import {
  buildAutoRigInputBlueprints,
  type AutoRigInputBlueprintMetadata,
} from "../rig/autoInputs";
import {
  buildRigGraphSpec,
  type BuildGraphResult,
  buildMachineReport,
  type MachineReport,
} from "@vizij/node-graph-authoring";
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
import { extractStandardInputSubgroups } from "../utils/standardInputs";

const __DEV__ = process.env.NODE_ENV !== "production";

const STANDARD_BLUEPRINT_PATHS = new Set(
  STANDARD_RIG_INPUTS.map((input) => normalizeStandardRigInputPath(input.path)),
);

const FEATURE_FLAG_DEFAULTS = {
  vectorAuthoringBeta: true,
  conditionalAuthoringBeta: true,
  irInspectorBeta: true,
} as const;

export type AuthoringFeatureFlag = keyof typeof FEATURE_FLAG_DEFAULTS;
type FeatureFlagState = Record<AuthoringFeatureFlag, boolean>;

const RIG_STATE_SCHEMA_VERSION = 3;

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

function replaceSlugInPath(
  path: string,
  oldSlug: string,
  newSlug: string,
): string {
  if (!path) {
    return path;
  }
  const normalized = normalizeStandardRigInputPath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return normalized;
  }
  const offset = segments[0] === "standard" ? 1 : 0;
  if (offset >= segments.length) {
    return normalized;
  }
  if (segments[offset] !== oldSlug) {
    return normalized;
  }
  segments[offset] = newSlug;
  return normalizeStandardRigInputPath(`/${segments.join("/")}`);
}

function clampNumberToRange(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.min(Math.max(value, low), high);
}

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
  disabled: boolean;
}

type StandardInputId = StandardRigInput["id"];

interface AutoInputState {
  input: StandardRigInput;
  metadata: AutoRigInputBlueprintMetadata;
  generatedLabel: string;
  generatedDefaultValue: number;
  generatedRange: { min: number; max: number };
  sourcePath: string;
  sourceId: string | undefined;
}

function remapBindingInputIds(
  binding: AnimatableBinding,
  target: BindingTarget,
  idRemap: Map<string, string>,
): AnimatableBinding {
  if (idRemap.size === 0) {
    return ensureBindingStructure(binding, target);
  }
  const ensured = ensureBindingStructure(binding, target);
  let changed = false;

  const remappedInputId =
    ensured.inputId && idRemap.has(ensured.inputId)
      ? (idRemap.get(ensured.inputId) ?? ensured.inputId)
      : ensured.inputId;
  if (remappedInputId !== ensured.inputId) {
    changed = true;
  }

  const remappedSlots = ensured.slots.map((slot) => {
    if (!slot.inputId) {
      return slot;
    }
    const mapped = idRemap.get(slot.inputId);
    if (!mapped || mapped === slot.inputId) {
      return slot;
    }
    changed = true;
    return {
      ...slot,
      inputId: mapped,
    };
  });

  if (!changed) {
    return ensured;
  }

  return ensureBindingStructure(
    {
      ...ensured,
      inputId: remappedInputId ?? null,
      slots: remappedSlots,
    },
    target,
  );
}

export interface RigController {
  faceId: string;
  setFaceId: (next: string) => void;
  graphStatus: "idle" | "loading" | "ready" | "error";
  graphError: string | null;
  bindingIssues: Map<string, readonly string[]>;
  featureLabelOverrides: Record<string, string>;
  featureFlags: FeatureFlagState;
  graphMachineReport: MachineReport | null;
  getGraphIr: () => BuildGraphResult["ir"] | null;
  managedStandardInputs: ManagedStandardInput[];
  standardInputRoots: string[];
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  graphInputDefaults: Record<string, number>;
  graphTimeSeconds: number;
  graphPlaybackState: "playing" | "paused";
  playGraph: () => void;
  pauseGraph: () => void;
  stopGraph: () => void;
  stepGraph: () => void;
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
  handleResetAllInputValues: () => void;
  handleClearCachedState: () => void;
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
  handleUnlinkChildInput: (parentId: string, childId: string) => void;
  handleRenameShape: (shapeId: string, value: string) => void;
  handleUpdateStandardInput: (
    inputId: string,
    updates: {
      path?: string;
      label?: string;
      defaultValue?: number;
    },
  ) => void;
  handleDisableStandardInput: (inputId: string) => void;
  handleEnableStandardInput: (inputId: string) => void;
  handleDeleteCustomStandardInput: (inputId: string) => void;
  handleAddBindingSlot: (targetId: string) => void;
  handleRemoveBindingSlot: (targetId: string, slotId: string) => void;
  handleUpdateBindingExpression: (targetId: string, expression: string) => void;
  handleUpdateBindingSlotAlias: (
    targetId: string,
    slotId: string,
    alias: string,
  ) => void;
  handleBindingSlotValueTypeChange: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  handleUpdateFeatureLabel: (
    featureId: string,
    defaultLabel: string,
    value: string,
  ) => void;
  handleFeatureFlagChange: (
    flag: AuthoringFeatureFlag,
    enabled: boolean,
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
  handleParentBindingSlotValueTypeChange: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  handleParentResetBinding: (targetId: string) => void;
  handleSelectStandardInputRoots: (roots: string[]) => void;
  handleSelectStandardInputSubgroups: (subgroups: string[]) => void;
  handleFaceIdChange: (value: string) => void;
  handleFocusSelectionIndex: (index: number) => void;
  handleClearSelection: () => void;
  handleImportGraphSpec: (
    spec: GraphSpec,
  ) => Promise<{ faceChanged: boolean; importedFaceId: string | null }>;
  setStoreState: ReturnType<typeof useVizijStoreSetter>;
  collectAnimatableExportState: () => {
    appliedOverrides: boolean;
    nextAnimatables: Record<string, AnimatableValue>;
    nextValues: Map<string, RawValue | undefined>;
    effectiveAnimatables: Record<string, AnimatableValue>;
  };
  applyStandardInputBatch: (
    updates: Record<StandardInputId, number>,
    options?: { replace?: boolean },
  ) => void;
  graphInsights: PersistedGraphInsight | null;
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
    step: stepRigGraph,
    setTime: setRigTime,
  } = useGraphInstance(undefined, { autoEval: false });

  const [graphStatus, setGraphStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphTimeSeconds, setGraphTimeSeconds] = useState(0);
  const graphTimeRef = useRef(0);
  const [graphPlaybackState, setGraphPlaybackState] = useState<
    "playing" | "paused"
  >("playing");
  const playbackStateRef = useRef<"playing" | "paused">("playing");

  const [faceId, setFaceIdState] = useState<string>("robot");
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
  const [featureFlags, setFeatureFlags] = useState<FeatureFlagState>(
    FEATURE_FLAG_DEFAULTS,
  );
  const [graphInsights, setGraphInsights] =
    useState<PersistedGraphInsight | null>(null);

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
  const inputBindingsRef = useRef<InputBindingMap>(inputBindings);
  const allStandardInputsRef = useRef<Map<string, StandardRigInput>>(new Map());
  const disabledStandardInputIdsRef = useRef<Set<string>>(new Set());

  const drivenAnimatablesRef = useRef<Set<string>>(new Set());
  const graphSummaryRef = useRef<BuildGraphResult["summary"] | null>(null);
  const graphIrRef = useRef<BuildGraphResult["ir"] | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const graphInputBindingsRef = useRef<
    Array<{
      graphPath: string;
      inputId?: string;
      defaultValue: number;
    }>
  >([]);
  const graphInputBindingsByIdRef = useRef<Map<string, string>>(new Map());

  function buildFallbackGraphPath(
    faceId: string,
    input: StandardRigInput,
  ): string {
    const normalizedPath = normalizeStandardRigInputPath(input.path);
    const trimmed = normalizedPath.replace(/^\/+/, "");
    return trimmed.length > 0 ? `rig/${faceId}/${trimmed}` : `rig/${faceId}`;
  }
  const [graphInputDefaults, setGraphInputDefaults] = useState<
    Record<string, number>
  >({});
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
      const autoTargets = Array.from(autoInputsRef.current.entries()).filter(
        ([, entry]) => entry.metadata.elementId === shapeId,
      );
      const customTargets = customInputsRef.current.filter((input) => {
        const normalized = normalizeStandardRigInputPath(input.path);
        const segments = normalized.split("/").filter(Boolean);
        if (segments.length === 0) {
          return false;
        }
        const offset = segments[0] === "standard" ? 1 : 0;
        if (offset >= segments.length) {
          return false;
        }
        return segments[offset] === oldSlug;
      });

      type RenameRecord = {
        updatedInput: StandardRigInput;
        kind: "auto" | "custom";
        autoKey?: string;
        originalAutoState?: AutoInputState;
        updatedAutoState?: AutoInputState;
      };

      const renameRecords = new Map<string, RenameRecord>();

      autoTargets.forEach(([key, state]) => {
        const normalizedPath = normalizeStandardRigInputPath(state.input.path);
        const pathSegments = normalizedPath.split("/").filter(Boolean);
        if (pathSegments[0] === "standard") {
          return;
        }
        const renamedPath = replaceSlugInPath(normalizedPath, oldSlug, newSlug);
        if (renamedPath === normalizedPath) {
          return;
        }
        const updatedInput = createStandardRigInput({
          path: renamedPath,
          label: state.input.label,
          group: deriveGroupFromNormalizedPath(renamedPath),
          defaultValue: state.input.defaultValue,
          range: {
            min: state.input.range.min,
            max: state.input.range.max,
          },
          sourceId: state.input.sourceId,
          parentBinding: state.input.parentBinding ?? undefined,
          derivedChildren: state.input.derivedChildren ?? undefined,
        });
        const updatedSourcePath = replaceSlugInPath(
          state.sourcePath,
          oldSlug,
          newSlug,
        );
        const normalizedSourcePath =
          normalizeStandardRigInputPath(updatedSourcePath);
        const updatedAutoState: AutoInputState = {
          ...state,
          input: updatedInput,
          metadata: {
            ...state.metadata,
            elementName: shapeName,
            root:
              state.metadata.root === oldSlug ? newSlug : state.metadata.root,
          },
          sourcePath: updatedSourcePath,
          generatedLabel: deriveLabelFromNormalizedPath(normalizedSourcePath),
          sourceId: state.sourceId,
        };
        renameRecords.set(state.input.id, {
          updatedInput,
          kind: "auto",
          autoKey: key,
          originalAutoState: state,
          updatedAutoState,
        });
      });

      customTargets.forEach((input) => {
        const normalizedPath = normalizeStandardRigInputPath(input.path);
        const pathSegments = normalizedPath.split("/").filter(Boolean);
        if (pathSegments[0] === "standard") {
          return;
        }
        const renamedPath = replaceSlugInPath(normalizedPath, oldSlug, newSlug);
        if (renamedPath === normalizedPath) {
          return;
        }
        const updatedInput = createStandardRigInput({
          path: renamedPath,
          label: input.label,
          group: deriveGroupFromNormalizedPath(renamedPath),
          defaultValue: input.defaultValue,
          range: {
            min: input.range.min,
            max: input.range.max,
          },
          sourceId: input.sourceId,
          parentBinding: input.parentBinding ?? undefined,
          derivedChildren: input.derivedChildren ?? undefined,
        });
        renameRecords.set(input.id, {
          updatedInput,
          kind: "custom",
        });
      });

      if (renameRecords.size === 0) {
        refreshAutoMetadataForShape(shapeId, shapeName);
        return;
      }

      const idRemap = new Map<string, string>();
      renameRecords.forEach((record, oldId) => {
        if (record.updatedInput.id !== oldId) {
          idRemap.set(oldId, record.updatedInput.id);
        }
      });

      setCustomInputs((previous) => {
        let changed = false;
        const next = previous.map((input) => {
          const record = renameRecords.get(input.id);
          if (record && record.kind === "custom") {
            changed = true;
            return record.updatedInput;
          }
          return input;
        });
        return changed ? next : previous;
      });

      setAutoInputs((previous) => {
        let changed = false;
        const next = new Map<string, AutoInputState>();
        previous.forEach((entry, key) => {
          const record = renameRecords.get(entry.input.id);
          if (record && record.kind === "auto" && record.updatedAutoState) {
            changed = true;
            next.set(record.updatedInput.path, record.updatedAutoState);
          } else {
            let current = entry;
            if (entry.metadata.elementId === shapeId) {
              if (
                entry.metadata.elementName !== shapeName ||
                (entry.metadata.root === oldSlug && oldSlug !== newSlug)
              ) {
                current = {
                  ...entry,
                  metadata: {
                    ...entry.metadata,
                    elementName: shapeName,
                    root:
                      entry.metadata.root === oldSlug
                        ? newSlug
                        : entry.metadata.root,
                  },
                };
                changed = true;
              }
            }
            next.set(key, current);
          }
        });
        return changed ? next : previous;
      });

      const updatedInputs = new Map(allStandardInputsRef.current);
      renameRecords.forEach((record, oldId) => {
        updatedInputs.delete(oldId);
        updatedInputs.set(record.updatedInput.id, record.updatedInput);
      });
      allStandardInputsRef.current = updatedInputs;

      if (idRemap.size > 0) {
        setDisabledStandardInputIds((previous) =>
          previous.map((inputId) => idRemap.get(inputId) ?? inputId),
        );
        idRemap.forEach((newId, oldId) => {
          const cached = disabledInputBindingCacheRef.current.get(oldId);
          if (cached) {
            disabledInputBindingCacheRef.current.delete(oldId);
            disabledInputBindingCacheRef.current.set(newId, cached);
          }
        });
      }

      updateInputValues((previous) => {
        if (idRemap.size === 0) {
          return previous;
        }
        let changed = false;
        const next: StandardInputValues = {};
        Object.entries(previous).forEach(([inputId, value]) => {
          const remappedId = idRemap.get(inputId) ?? inputId;
          next[remappedId] = value;
          if (remappedId !== inputId) {
            changed = true;
          }
        });
        renameRecords.forEach((record) => {
          if (
            !Object.prototype.hasOwnProperty.call(next, record.updatedInput.id)
          ) {
            next[record.updatedInput.id] = record.updatedInput.defaultValue;
            changed = true;
          }
        });
        return changed ? next : previous;
      });

      setBindings((previous) => {
        if (idRemap.size === 0) {
          return previous;
        }
        let changed = false;
        const next: BindingMap = {};
        Object.entries(previous).forEach(([targetId, binding]) => {
          if (!binding) {
            return;
          }
          const component = componentsByIdRef.current.get(targetId);
          if (!component) {
            next[targetId] = binding;
            return;
          }
          const target = bindingTargetFromComponent(component);
          const remapped = remapBindingInputIds(binding, target, idRemap);
          next[targetId] = remapped;
          if (remapped !== binding) {
            changed = true;
          }
        });
        return changed ? next : previous;
      });

      setInputBindings((previous) => {
        if (idRemap.size === 0) {
          return previous;
        }
        let changed = false;
        const next: InputBindingMap = {};
        Object.entries(previous).forEach(([targetId, binding]) => {
          const remappedKey = idRemap.get(targetId) ?? targetId;
          const targetInput = updatedInputs.get(remappedKey);
          if (!targetInput) {
            return;
          }
          const remapped = remapBindingInputIds(
            binding,
            bindingTargetFromInput(targetInput),
            idRemap,
          );
          if (remappedKey !== targetId || remapped !== binding) {
            changed = true;
          }
          next[remappedKey] = remapped;
        });
        return changed ? next : previous;
      });

      const pending = pendingInputBindingDefinitionsRef.current;
      if (pending && idRemap.size > 0) {
        const nextDefinitions: Record<string, RigBindingDefinition> = {};
        Object.entries(pending).forEach(([targetId, definition]) => {
          const remappedKey = idRemap.get(targetId) ?? targetId;
          const targetInput = updatedInputs.get(remappedKey);
          if (!targetInput) {
            return;
          }
          const target = bindingTargetFromInput(targetInput);
          const remapped = remapBindingInputIds(
            bindingFromDefinition(target, definition),
            target,
            idRemap,
          );
          nextDefinitions[remappedKey] = bindingToDefinition(remapped);
        });
        pendingInputBindingDefinitionsRef.current = nextDefinitions;
      }

      const persistedOverrides = persistedAutoInputsRef.current;
      renameRecords.forEach((record) => {
        if (record.kind !== "auto" || !record.originalAutoState) {
          return;
        }
        const originalKey = resolvePersistedAutoKey(
          record.originalAutoState.sourceId,
          record.originalAutoState.sourcePath,
        );
        if (originalKey) {
          persistedOverrides.delete(originalKey);
        }
        if (!record.updatedAutoState) {
          return;
        }
        const newKey = resolvePersistedAutoKey(
          record.updatedAutoState.sourceId,
          record.updatedAutoState.sourcePath,
        );
        if (!newKey) {
          return;
        }
        persistedOverrides.set(newKey, {
          id: record.updatedInput.id,
          path: record.updatedInput.path,
          sourcePath: record.updatedAutoState.sourcePath,
          sourceId: record.updatedAutoState.sourceId,
          group:
            record.updatedInput.group !== newSlug
              ? record.updatedInput.group
              : undefined,
          label:
            record.updatedInput.label !== record.updatedAutoState.generatedLabel
              ? record.updatedInput.label
              : undefined,
          defaultValue:
            record.updatedInput.defaultValue !==
            record.updatedAutoState.generatedDefaultValue
              ? record.updatedInput.defaultValue
              : undefined,
          range:
            record.updatedInput.range.min !==
              record.updatedAutoState.generatedRange.min ||
            record.updatedInput.range.max !==
              record.updatedAutoState.generatedRange.max
              ? {
                  min: record.updatedInput.range.min,
                  max: record.updatedInput.range.max,
                }
              : undefined,
        });
      });

      setSelectedStandardInputRoots((previous) => {
        if (previous.length === 0) {
          return previous;
        }
        let changed = false;
        const next = previous.map((root) => {
          if (root === oldSlug) {
            changed = true;
            return newSlug;
          }
          return root;
        });
        if (!changed) {
          return previous;
        }
        return Array.from(new Set(next));
      });

      setSelectedStandardInputSubgroups((previous) => {
        if (previous.length === 0 || oldSlug === newSlug) {
          return previous;
        }
        let changed = false;
        const next = previous.map((token) => {
          if (token.startsWith(`${oldSlug}/`)) {
            changed = true;
            return `${newSlug}/${token.slice(oldSlug.length + 1)}`;
          }
          return token;
        });
        if (!changed) {
          return previous;
        }
        return Array.from(new Set(next));
      });

      setFeatureLabelOverrides((previous) => {
        if (Object.keys(previous).length === 0) {
          return previous;
        }
        let changed = false;
        const next = { ...previous };
        Object.entries(previous).forEach(([featureId, value]) => {
          if (!featureId.startsWith(`${shapeId}:`)) {
            return;
          }
          if (!value) {
            return;
          }
          const trimmedValue = value.trim();
          let replacement: string | null = null;
          if (trimmedValue === previousName) {
            replacement = shapeName;
          } else if (trimmedValue.startsWith(`${previousName} `)) {
            replacement = `${shapeName}${trimmedValue.slice(previousName.length)}`;
          }
          if (replacement && replacement !== value) {
            next[featureId] = replacement;
            changed = true;
          }
        });
        return changed ? next : previous;
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

  const disabledInputSet = useMemo(
    () => new Set(disabledStandardInputIds),
    [disabledStandardInputIds],
  );

  const managedStandardInputs = useMemo<ManagedStandardInput[]>(() => {
    const entries: ManagedStandardInput[] = [];
    const handledAutoKeys = new Set<string>();
    const autoInputsBySourceId = new Map<string, AutoInputState>();
    const autoInputsBySourcePath = new Map<string, AutoInputState>();

    autoInputs.forEach((entry) => {
      if (entry.sourceId) {
        autoInputsBySourceId.set(entry.sourceId, entry);
      }
      autoInputsBySourcePath.set(entry.sourcePath, entry);
    });

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
      const entry =
        (blueprint.sourceId && autoInputsBySourceId.get(blueprint.sourceId)) ??
        autoInputsBySourcePath.get(blueprint.path) ??
        autoInputs.get(blueprint.path);
      if (!entry) {
        return;
      }
      const handledKey = resolvePersistedAutoKey(
        entry.sourceId,
        entry.sourcePath,
      );
      if (handledKey) {
        handledAutoKeys.add(handledKey);
      }
      entries.push({
        input: enhanceInput(entry.input),
        source: "auto",
        metadata: entry.metadata,
        disabled: disabledInputSet.has(entry.input.id),
      });
    });

    autoInputs.forEach((entry) => {
      const handledKey = resolvePersistedAutoKey(
        entry.sourceId,
        entry.sourcePath,
      );
      if (handledKey && handledAutoKeys.has(handledKey)) {
        return;
      }
      entries.push({
        input: enhanceInput(entry.input),
        source: "auto",
        metadata: entry.metadata,
        disabled: disabledInputSet.has(entry.input.id),
      });
    });

    customInputs.forEach((input) => {
      entries.push({
        input: enhanceInput(input),
        source: "custom",
        disabled: disabledInputSet.has(input.id),
      });
    });

    return entries;
  }, [
    autoBlueprints,
    autoInputs,
    customInputs,
    inputBindings,
    derivedChildrenMap,
    disabledInputSet,
  ]);

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

  const elementRootLookup = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    managedStandardInputs.forEach((entry) => {
      const elementId = entry.metadata?.elementId;
      if (!elementId) {
        return;
      }
      const root = entry.metadata?.root ?? entry.input.group ?? GROUP_FALLBACK;
      if (!root) {
        return;
      }
      const bucket = grouped.get(elementId);
      if (bucket) {
        bucket.add(root);
      } else {
        grouped.set(elementId, new Set([root]));
      }
    });
    const lookup = new Map<string, readonly string[]>();
    grouped.forEach((roots, elementId) => {
      lookup.set(elementId, Array.from(roots));
    });
    return lookup;
  }, [managedStandardInputs]);

  const allStandardInputSubgroups = useMemo(() => {
    const set = new Set<string>();
    managedStandardInputs.forEach((entry) => {
      const root = entry.metadata?.root ?? entry.input.group ?? GROUP_FALLBACK;
      extractStandardInputSubgroups(entry.input.path, root).forEach(
        (subgroup) => {
          if (subgroup) {
            set.add(subgroup);
          }
        },
      );
    });
    return set;
  }, [managedStandardInputs]);

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
    const filtered = selectedStandardInputRoots.filter((root) =>
      validRoots.has(root),
    );
    if (filtered.length !== selectedStandardInputRoots.length) {
      setSelectedStandardInputRoots(filtered);
    }
  }, [selectedStandardInputRoots, standardInputRoots]);

  useEffect(() => {
    if (!Array.isArray(elementSelection)) {
      return;
    }
    const relevantSelection = elementSelection.filter(
      (entry) => entry.namespace === namespace,
    );
    if (relevantSelection.length === 0) {
      if (viewerSelectionActiveRef.current) {
        viewerSelectionActiveRef.current = false;
        setSelectedStandardInputRoots((previous) => {
          if (previous.length === 0) {
            return previous;
          }
          return [];
        });
      }
      return;
    }

    const candidateRoots = new Set<string>();

    relevantSelection.forEach((selection) => {
      const mappedRoots = elementRootLookup.get(selection.id);
      if (mappedRoots) {
        mappedRoots.forEach((root) => {
          if (root) {
            candidateRoots.add(root);
          }
        });
      }
      const renderable = world[selection.id];
      if (renderable && typeof renderable === "object") {
        const baseName =
          typeof renderable.name === "string" &&
          renderable.name.trim().length > 0
            ? renderable.name
            : renderable.id;
        const normalized = normalizeStandardRigGroup(baseName, "");
        if (normalized) {
          candidateRoots.add(normalized);
        }
      }
    });

    const orderedRoots = standardInputRoots.filter((root) =>
      candidateRoots.has(root),
    );

    viewerSelectionActiveRef.current = true;

    setSelectedStandardInputRoots((previous) => {
      if (
        previous.length === orderedRoots.length &&
        previous.every((value, index) => value === orderedRoots[index])
      ) {
        return previous;
      }
      return orderedRoots;
    });
  }, [
    elementRootLookup,
    elementSelection,
    namespace,
    standardInputRoots,
    world,
  ]);

  useEffect(() => {
    if (selectedStandardInputSubgroups.length === 0) {
      return;
    }
    const filtered = selectedStandardInputSubgroups.filter((token) =>
      allStandardInputSubgroups.has(token),
    );
    if (filtered.length !== selectedStandardInputSubgroups.length) {
      setSelectedStandardInputSubgroups(filtered);
    }
  }, [allStandardInputSubgroups, selectedStandardInputSubgroups]);

  const standardInputs = useMemo(
    () => managedStandardInputs.map((entry) => entry.input),
    [managedStandardInputs],
  );

  const standardInputsById = useMemo(
    () => new Map(standardInputs.map((input) => [input.id, input])),
    [standardInputs],
  );

  const standardInputsByPath = useMemo(() => {
    const entries = new Map<string, StandardRigInput>();
    standardInputs.forEach((input) => {
      const normalized = normalizeStandardRigInputPath(input.path);
      entries.set(normalized, input);
      const stripped = stripStandardInputPathPrefix(normalized);
      if (stripped !== normalized) {
        entries.set(stripped, input);
      }
    });
    return entries;
  }, [standardInputs]);

  const standardInputMetadataById = useMemo(() => {
    const entries = new Map<
      string,
      { source?: "auto" | "custom" | "preset"; root?: string }
    >();
    managedStandardInputs.forEach((entry) => {
      const isPreset = entry.metadata?.elementType === "standard";
      const source: "auto" | "custom" | "preset" | undefined = isPreset
        ? "preset"
        : entry.source;
      entries.set(entry.input.id, {
        source,
        root: entry.metadata?.root ?? entry.input.group,
      });
    });
    return entries;
  }, [managedStandardInputs]);

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
      inputMetadata: standardInputMetadataById,
    });
  }, [
    animatableComponents,
    animatables,
    bindings,
    inputBindings,
    faceId,
    standardInputsById,
    standardInputMetadataById,
  ]);

  const runtimeGraphSpec = useMemo<{
    spec: GraphSpec;
    source: "legacy" | "ir";
  } | null>(() => {
    if (!rigGraphBuild) {
      return null;
    }
    if (rigGraphBuild.ir) {
      try {
        const compiled = rigGraphBuild.ir.compile({ preferLegacySpec: false });
        if (compiled?.spec) {
          if (compiled.issues && compiled.issues.length > 0) {
            // eslint-disable-next-line no-console -- diagnostics for IR compile
            console.warn(
              "[vizij-authoring] IR runtime compile reported issues",
              compiled.issues,
            );
          }
          return {
            spec: compiled.spec,
            source: "ir",
          };
        }
      } catch (error) {
        // eslint-disable-next-line no-console -- diagnostics for IR compile
        console.error(
          "[vizij-authoring] Failed to compile IR graph for runtime",
          error,
        );
      }
    }
    return {
      spec: rigGraphBuild.spec,
      source: "legacy",
    };
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

  const graphMachineReport = useMemo(
    () => (rigGraphBuild ? buildMachineReport(rigGraphBuild) : null),
    [rigGraphBuild],
  );

  const getGraphIr = useCallback(() => graphIrRef.current, []);

  useEffect(() => {
    if (!rigGraphBuild) {
      return;
    }
    setGraphInsights(createGraphInsightSnapshot(rigGraphBuild));
  }, [rigGraphBuild]);

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

  const cancelAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameTimeRef.current = null;
  }, []);

  const applyGraphOutputs = useCallback(
    (result: unknown) => {
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
    },
    [animatables, namespace, resetDrivenAnimatables, setValue],
  );

  const stageInputsFromState = useCallback(
    (options?: { clear?: boolean }) => {
      if (graphStatus !== "ready") {
        return;
      }
      const bindingEntries = graphInputBindingsByIdRef.current;
      if (
        bindingEntries.size === 0 &&
        graphInputBindingsRef.current.length === 0
      ) {
        return;
      }
      if (options?.clear) {
        clearRigStaged();
      }
      const currentValues = inputValuesRef.current;
      if (__DEV__) {
        // eslint-disable-next-line no-console -- debug logger
        console.debug("[vizij] stage all inputs", {
          count:
            bindingEntries.size > 0
              ? bindingEntries.size
              : graphInputBindingsRef.current.length,
          clear: options?.clear ?? false,
        });
      }
      if (bindingEntries.size > 0) {
        bindingEntries.forEach((graphPath, inputId) => {
          const stored = currentValues[inputId];
          const fallbackInput = standardInputsById.get(inputId);
          const value =
            typeof stored === "number" && Number.isFinite(stored)
              ? stored
              : (fallbackInput?.defaultValue ?? 0);
          stageRigInput(graphPath, { float: value });
        });
        return;
      }
      graphInputBindingsRef.current.forEach(
        ({ graphPath, inputId, defaultValue }) => {
          const stored = inputId ? currentValues[inputId] : undefined;
          const value =
            typeof stored === "number" && Number.isFinite(stored)
              ? stored
              : defaultValue;
          stageRigInput(graphPath, { float: value });
        },
      );
    },
    [clearRigStaged, graphStatus, stageRigInput, standardInputsById],
  );

  const evaluateGraphNow = useCallback(() => {
    if (graphStatus !== "ready") {
      return;
    }
    stageInputsFromState();
    const result = evalRigGraph();
    applyGraphOutputs(result);
  }, [applyGraphOutputs, evalRigGraph, graphStatus, stageInputsFromState]);

  const runGraphStep = useCallback(
    (deltaSeconds: number) => {
      if (graphStatus !== "ready") {
        return;
      }
      const clampedDelta = Math.max(deltaSeconds, 0);
      graphTimeRef.current += clampedDelta;
      setGraphTimeSeconds(graphTimeRef.current);
      setRigTime(graphTimeRef.current);
      stageInputsFromState();
      stepRigGraph(clampedDelta);
      const result = evalRigGraph();
      applyGraphOutputs(result);
    },
    [
      applyGraphOutputs,
      evalRigGraph,
      graphStatus,
      setRigTime,
      stageInputsFromState,
      stepRigGraph,
    ],
  );

  const runAnimationFrame = useCallback(
    (timestamp: number) => {
      if (playbackStateRef.current !== "playing") {
        animationFrameRef.current = null;
        return;
      }
      const last = lastFrameTimeRef.current ?? timestamp;
      lastFrameTimeRef.current = timestamp;
      const deltaSeconds = Math.max((timestamp - last) / 1000, 0);
      runGraphStep(deltaSeconds);
      animationFrameRef.current = requestAnimationFrame(runAnimationFrame);
    },
    [runGraphStep],
  );

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
    if (autoInputs.size === 0) {
      return;
    }
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
          (blueprint.sourceId &&
            autoInputsBySourceId.get(blueprint.sourceId)) ??
          autoInputs.get(blueprint.path);
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
      if (graphStatus !== "ready") {
        if (__DEV__) {
          console.warn(
            "[vizij] skipped staging input while graph not ready",
            inputId,
            value,
          );
        }
        return;
      }
      let graphPath = graphInputBindingsByIdRef.current.get(inputId) ?? null;
      if (!graphPath) {
        const input = standardInputsById.get(inputId);
        if (input) {
          graphPath = buildFallbackGraphPath(faceId, input);
          graphInputBindingsByIdRef.current.set(inputId, graphPath);
        }
      }
      if (!graphPath) {
        if (__DEV__) {
          console.warn("[vizij] no graph input binding for", inputId, value);
        }
        return;
      }
      stageRigInput(graphPath, { float: value });
      if (__DEV__) {
        // eslint-disable-next-line no-console -- debug logger
        console.debug("[vizij] staged input", {
          inputId,
          graphPath,
          value,
          fallback: !graphInputBindingsRef.current.some(
            (binding) => binding.graphPath === graphPath,
          ),
        });
      }
    },
    [faceId, graphStatus, stageRigInput, standardInputsById],
  );

  const handleInputValueChange = useCallback(
    (inputId: string, value: number) => {
      updateInputValues((previous) => ({
        ...previous,
        [inputId]: value,
      }));
      stageGraphInputValue(inputId, value);
      evaluateGraphNow();
    },
    [evaluateGraphNow, stageGraphInputValue, updateInputValues],
  );

  const applyStandardInputBatch = useCallback(
    (
      updates: Record<StandardInputId, number>,
      options?: { replace?: boolean },
    ) => {
      if (!updates || typeof updates !== "object") {
        return;
      }
      const entries = Object.entries(updates).filter(([inputId]) =>
        standardInputsById.has(inputId),
      ) as Array<[StandardInputId, number]>;
      if (entries.length === 0) {
        return;
      }
      updateInputValues((previous) => {
        if (options?.replace) {
          const next: StandardInputValues = {};
          const entryIds = new Set<StandardInputId>();
          let changed = false;
          entries.forEach(([inputId, value]) => {
            entryIds.add(inputId);
            next[inputId] = value;
            if (!changed && previous[inputId] !== value) {
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
          if (next[inputId] !== value) {
            next[inputId] = value;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
      entries.forEach(([inputId, value]) => {
        stageGraphInputValue(inputId, value);
      });
      evaluateGraphNow();
    },
    [
      evaluateGraphNow,
      stageGraphInputValue,
      standardInputsById,
      updateInputValues,
    ],
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

  const handleClearCachedState = useCallback(() => {
    if (!faceId) {
      return;
    }
    deleteRigState(faceId);
    persistedAutoInputsRef.current = new Map();
    pendingInputBindingDefinitionsRef.current = null;
    skipPersistRef.current = true;
    setCustomInputs([]);
    setAutoInputs(new Map());
    setInputBindings({});
    setBindings(createDefaultBindings(animatableComponents));
    updateInputValues(() => ({}));
    setSelectedStandardInputRoots([]);
    setSelectedStandardInputSubgroups([]);
    setFeatureLabelOverrides({});
    setTimeout(() => {
      skipPersistRef.current = false;
      rebuildAutoInputs();
    }, 0);
  }, [animatableComponents, faceId, rebuildAutoInputs, updateInputValues]);

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
        const nextBinding = maybeAutoAliasSlot(
          updated,
          target,
          targetSlotId,
          inputMeta,
        );
        if (nextBinding === current) {
          return previous;
        }
        return {
          ...previous,
          [targetId]: nextBinding,
        };
      });
    },
    [componentsById, maybeAutoAliasSlot, standardInputsById],
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

  const handleFeatureFlagChange = useCallback(
    (flag: AuthoringFeatureFlag, enabled: boolean) => {
      setFeatureFlags((previous) => {
        if (previous[flag] === enabled) {
          return previous;
        }
        return {
          ...previous,
          [flag]: enabled,
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
      updateInputValues((previous) => ({
        ...previous,
        [created.id]: created.defaultValue,
      }));
      return created;
    },
    [],
  );

  const handleUpdateStandardInput = useCallback(
    (
      inputId: string,
      updates: {
        path?: string;
        label?: string;
        sourceId?: string | null;
        defaultValue?: number;
      },
    ) => {
      const autoEntry = Array.from(autoInputsRef.current.entries()).find(
        ([, entry]) => entry.input.id === inputId,
      );
      if (autoEntry) {
        const [entryKey, entryState] = autoEntry;
        const wantsPath = updates.path !== undefined;
        const wantsLabel = updates.label !== undefined;
        const wantsSourceId = updates.sourceId !== undefined;
        const wantsDefaultValue =
          typeof updates.defaultValue === "number" &&
          Number.isFinite(updates.defaultValue);
        if (!wantsPath && !wantsLabel && !wantsSourceId && !wantsDefaultValue) {
          return;
        }

        let normalizedPath = entryState.input.path;
        if (wantsPath) {
          const trimmedPath = updates.path?.trim() ?? "";
          if (!trimmedPath) {
            alertDialog("Path cannot be empty.");
            return;
          }
          normalizedPath = normalizeStandardRigInputPath(trimmedPath);
          const duplicateAuto = Array.from(
            autoInputsRef.current.entries(),
          ).some(
            ([, candidate]) =>
              candidate.input.id !== inputId &&
              normalizeStandardRigInputPath(candidate.input.path) ===
                normalizedPath,
          );
          if (duplicateAuto) {
            alertDialog(
              `Another standard input already uses the path "${normalizedPath}".`,
            );
            return;
          }
          const duplicateCustom = customInputsRef.current.some(
            (input) =>
              input.id !== inputId &&
              normalizeStandardRigInputPath(input.path) === normalizedPath,
          );
          if (duplicateCustom) {
            alertDialog(
              `Another standard input already uses the path "${normalizedPath}".`,
            );
            return;
          }
        }

        const trimmedLabel =
          wantsLabel && updates.label !== undefined
            ? updates.label.trim()
            : undefined;
        const nextLabel =
          trimmedLabel !== undefined
            ? trimmedLabel.length > 0
              ? trimmedLabel
              : deriveLabelFromNormalizedPath(normalizedPath)
            : entryState.input.label;
        const nextGroup = wantsPath
          ? deriveGroupFromNormalizedPath(normalizedPath)
          : entryState.input.group;
        const nextRoot = wantsPath
          ? deriveGroupFromNormalizedPath(normalizedPath)
          : (entryState.metadata.root ??
            entryState.input.group ??
            GROUP_FALLBACK);
        const normalizedDefaultValue = wantsDefaultValue
          ? clampNumberToRange(
              updates.defaultValue as number,
              entryState.input.range.min,
              entryState.input.range.max,
            )
          : entryState.input.defaultValue;
        const nextSourceId =
          wantsSourceId && updates.sourceId === null
            ? undefined
            : wantsSourceId && updates.sourceId !== undefined
              ? (() => {
                  const trimmed = updates.sourceId?.trim() ?? "";
                  return trimmed.length > 0 ? trimmed : undefined;
                })()
              : entryState.input.sourceId;

        if (
          normalizedPath === entryState.input.path &&
          nextLabel === entryState.input.label &&
          nextGroup === entryState.input.group &&
          nextSourceId === entryState.input.sourceId &&
          normalizedDefaultValue === entryState.input.defaultValue
        ) {
          return;
        }

        setAutoInputs((previous) => {
          const current = previous.get(entryKey);
          if (!current) {
            return previous;
          }
          const updatedInput = createStandardRigInput({
            id: current.input.id,
            path: normalizedPath,
            label: nextLabel,
            group: nextGroup,
            defaultValue: normalizedDefaultValue,
            range: {
              min: current.input.range.min,
              max: current.input.range.max,
            },
            sourceId: nextSourceId,
            parentBinding: current.input.parentBinding ?? undefined,
            derivedChildren: current.input.derivedChildren ?? undefined,
          });
          const updatedEntry: AutoInputState = {
            ...current,
            input: updatedInput,
            metadata: {
              ...current.metadata,
              root: nextRoot,
            },
            sourceId: nextSourceId ?? "",
          };
          const next = new Map(previous);
          next.delete(entryKey);
          next.set(updatedInput.path, updatedEntry);
          return next;
        });

        const persistedOverrides = persistedAutoInputsRef.current;
        const oldKey = resolvePersistedAutoKey(
          entryState.input.sourceId,
          entryState.sourcePath,
        );
        const newKey = resolvePersistedAutoKey(
          nextSourceId,
          entryState.sourcePath,
        );
        if (oldKey && oldKey !== newKey) {
          persistedOverrides.delete(oldKey);
        }
        if (newKey) {
          persistedOverrides.set(newKey, {
            id: entryState.input.id,
            path: normalizedPath,
            sourcePath: entryState.sourcePath,
            sourceId: nextSourceId,
            group:
              nextGroup !==
              deriveGroupFromNormalizedPath(
                normalizeStandardRigInputPath(entryState.sourcePath),
              )
                ? nextGroup
                : undefined,
            label:
              nextLabel !== entryState.generatedLabel ? nextLabel : undefined,
            defaultValue:
              normalizedDefaultValue !== entryState.generatedDefaultValue
                ? normalizedDefaultValue
                : undefined,
            range:
              entryState.input.range.min !== entryState.generatedRange.min ||
              entryState.input.range.max !== entryState.generatedRange.max
                ? {
                    min: entryState.input.range.min,
                    max: entryState.input.range.max,
                  }
                : undefined,
          });
        }
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
        const wantsDefaultValue =
          typeof updates.defaultValue === "number" &&
          Number.isFinite(updates.defaultValue);
        const normalizedDefaultValue = wantsDefaultValue
          ? clampNumberToRange(
              updates.defaultValue as number,
              current.range.min,
              current.range.max,
            )
          : current.defaultValue;
        if (
          normalizedPath === current.path &&
          nextLabel === current.label &&
          normalizedDefaultValue === current.defaultValue
        ) {
          return previous;
        }
        const nextGroup = deriveGroupFromNormalizedPath(normalizedPath);
        const updated = createStandardRigInput({
          id: current.id,
          path: normalizedPath,
          label: nextLabel,
          group: nextGroup,
          defaultValue: normalizedDefaultValue,
          range: {
            min: current.range.min,
            max: current.range.max,
          },
          sourceId:
            updates.sourceId === undefined
              ? current.sourceId
              : updates.sourceId === null
                ? undefined
                : (() => {
                    const trimmed = updates.sourceId.trim();
                    return trimmed.length > 0 ? trimmed : undefined;
                  })(),
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

  const setFaceId = useCallback((next: string) => {
    setFaceIdState(sanitizeFaceId(next));
  }, []);

  const canonicalBindingExpression = useCallback(
    (binding: AnimatableBinding): string => {
      return buildCanonicalBindingExpression(binding);
    },
    [],
  );

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
    [maybeAutoAliasSlot, updateInputBinding],
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
      if (currentName === trimmed) {
        return;
      }
      const oldSlug = normalizeStandardRigGroup(currentName, "shape");
      const newSlug = normalizeStandardRigGroup(trimmed, "shape");

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

  const handleImportGraphSpec = useCallback(
    async (
      spec: GraphSpec,
    ): Promise<{ faceChanged: boolean; importedFaceId: string | null }> => {
      try {
        const rehydrated = rehydrateRigDataFromGraph(spec, {
          faceId,
          animatables,
          components: animatableComponents,
        });

        const importedFaceIdRaw = rehydrated.sourceFaceId;
        const importedFaceId =
          importedFaceIdRaw && importedFaceIdRaw.trim().length > 0
            ? sanitizeFaceId(importedFaceIdRaw)
            : null;
        const faceChangedDuringImport =
          !!importedFaceId && importedFaceId !== faceId;
        const normalizedInputMetadata = new Map<
          string,
          { source?: "auto" | "custom" | "preset"; root?: string }
        >();
        rehydrated.inputMetadata.forEach((metadata, inputId) => {
          const source =
            metadata.source === "auto" ||
            metadata.source === "custom" ||
            metadata.source === "preset"
              ? metadata.source
              : undefined;
          normalizedInputMetadata.set(inputId, {
            source,
            root: metadata.root,
          });
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
        const inputsBySourceId = new Map<string, StandardRigInput>();
        rehydrated.standardInputs.forEach((input) => {
          if (input.sourceId) {
            inputsBySourceId.set(input.sourceId, input);
          }
        });
        const nextAutoInputs = new Map<string, AutoInputState>();
        const missingBlueprintPaths: string[] = [];

        blueprint.blueprints.forEach((entry) => {
          let input: StandardRigInput | undefined;
          if (entry.sourceId) {
            input = inputsBySourceId.get(entry.sourceId);
          }
          if (!input) {
            input = inputsByPath.get(entry.path);
          }
          if (!input) {
            missingBlueprintPaths.push(entry.path);
            return;
          }
          if (entry.sourceId) {
            inputsBySourceId.delete(entry.sourceId);
          }
          inputsByPath.delete(input.path);
          const resolvedSourceId = input.sourceId ?? entry.sourceId;
          nextAutoInputs.set(entry.path, {
            input,
            metadata: entry.metadata,
            generatedLabel: entry.input.label,
            generatedDefaultValue: entry.input.defaultValue,
            generatedRange: {
              min: entry.input.range.min,
              max: entry.input.range.max,
            },
            sourcePath: entry.path,
            sourceId: resolvedSourceId,
          });
        });

        const nextCustomInputs = Array.from(inputsByPath.values()).sort(
          (a, b) => a.label.localeCompare(b.label),
        );

        if (missingBlueprintPaths.length > 0) {
          console.warn(
            "[vizij-authoring] Missing inputs while importing graph.",
            missingBlueprintPaths,
          );
        }

        const nextInputValues: StandardInputValues = {};
        rehydrated.standardInputs.forEach((input) => {
          nextInputValues[input.id] = input.defaultValue;
        });

        const resolvedFaceId = importedFaceId ?? faceId ?? "face";
        const rebuiltSpec = buildRigGraphSpec({
          faceId: resolvedFaceId,
          animatables,
          components: animatableComponents,
          bindings: rehydrated.bindings,
          inputsById: new Map(
            rehydrated.standardInputs.map((input) => [input.id, input]),
          ),
          inputBindings: rehydrated.inputBindings,
          inputMetadata: normalizedInputMetadata,
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
            return { faceChanged: false, importedFaceId: null };
          }
        }

        skipPersistRef.current = true;
        persistedAutoInputsRef.current = new Map();
        setAutoInputs(nextAutoInputs);
        setCustomInputs(nextCustomInputs);
        updateInputValues(() => nextInputValues);
        setBindings(rehydrated.bindings);
        setInputBindings(rehydrated.inputBindings);
        setSelectedStandardInputRoots([]);
        setSelectedStandardInputSubgroups([]);
        setTimeout(() => {
          skipPersistRef.current = false;
        }, 0);

        if (importedFaceId && importedFaceId !== faceId) {
          lastLoadedFaceIdRef.current = importedFaceId;
          setFaceId(importedFaceId);
        }

        if (missingBlueprintPaths.length > 0) {
          alertDialog(
            `The imported graph is missing auto-generated inputs for ${missingBlueprintPaths
              .map((path) => `"${path}"`)
              .join(", ")}.`,
          );
        }
        return {
          faceChanged: faceChangedDuringImport,
          importedFaceId: importedFaceId ?? null,
        };
      } catch (error) {
        alertDialog(
          `Failed to import graph: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return { faceChanged: false, importedFaceId: null };
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
      updateInputValues,
      setBindings,
      setInputBindings,
      setSelectedStandardInputRoots,
      setSelectedStandardInputSubgroups,
      setFaceId,
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

  const handleUnlinkChildInput = useCallback(
    (parentId: string, childId: string) => {
      updateInputBinding(
        childId,
        createDefaultParentBinding,
        (binding, target) => {
          const slotIdsToClear = new Set<string>();
          if (binding.inputId === parentId) {
            slotIdsToClear.add(binding.slots[0]?.id ?? PRIMARY_SLOT_ID);
          }
          binding.slots.forEach((slot) => {
            if (slot.inputId === parentId) {
              slotIdsToClear.add(slot.id);
            }
          });
          if (slotIdsToClear.size === 0) {
            return binding;
          }
          let nextBinding = binding;
          slotIdsToClear.forEach((slotId) => {
            nextBinding = updateBindingWithInput(
              nextBinding,
              target,
              undefined,
              slotId,
            );
          });
          return nextBinding;
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
          const rawSourcePath = descriptor.sourcePath ?? descriptor.path;
          const normalizedSourcePath = normalizeStandardRigInputPath(
            rawSourcePath ?? "/custom/input",
          );
          const isPresetBlueprint =
            STANDARD_BLUEPRINT_PATHS.has(normalizedSourcePath);
          const canonicalSourcePath = isPresetBlueprint
            ? normalizedSourcePath
            : stripStandardInputPathPrefix(normalizedSourcePath);
          const rawPath =
            descriptor.path ?? descriptor.sourcePath ?? "/custom/input";
          const normalizedPath = normalizeStandardRigInputPath(rawPath);
          const canonicalPath = isPresetBlueprint
            ? normalizedPath
            : stripStandardInputPathPrefix(normalizedPath);
          const canonicalId = createStandardRigInputFromPath(canonicalPath).id;
          const resolvedId = descriptor.id ?? canonicalId;
          if (descriptor.id && resolvedId && descriptor.id !== resolvedId) {
            idMismatches.push(
              `${descriptor.id} → ${resolvedId} (${canonicalPath})`,
            );
          }
          const derivedGroup = deriveGroupFromNormalizedPath(canonicalPath);
          let resolvedGroup: string;
          if (isPresetBlueprint) {
            resolvedGroup =
              descriptor.group && descriptor.group.length > 0
                ? descriptor.group
                : "standard";
          } else if (descriptor.group && descriptor.group !== "standard") {
            resolvedGroup = descriptor.group;
          } else if (derivedGroup && derivedGroup !== "standard") {
            resolvedGroup = derivedGroup;
          } else {
            const fallback =
              descriptor.group && descriptor.group.length > 0
                ? descriptor.group
                : derivedGroup;
            resolvedGroup =
              !fallback || fallback === "standard" ? "custom" : fallback;
          }
          const persistedKey = resolvePersistedAutoKey(
            descriptor.sourceId,
            canonicalSourcePath,
          );
          if (!persistedKey) {
            return;
          }
          autoEntries.set(persistedKey, {
            id: resolvedId,
            path: canonicalPath,
            sourceId: descriptor.sourceId,
            sourcePath: canonicalSourcePath,
            group: resolvedGroup,
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
      updateInputValues(() => persisted.inputValues ?? {});
      setDisabledStandardInputIds(
        Array.isArray(persisted.disabledStandardInputIds)
          ? persisted.disabledStandardInputIds
          : [],
      );

      const persistedBindings: BindingMap = {};
      Object.entries(persisted.bindings).forEach(([key, binding]) => {
        if (!binding) {
          return;
        }
        persistedBindings[key] = binding;
      });
      setBindings(reconcileBindings(persistedBindings, animatableComponents));
      setSelectedStandardInputRoots(
        Array.isArray(persisted.selectedStandardInputRoots)
          ? persisted.selectedStandardInputRoots
          : [],
      );
      setSelectedStandardInputSubgroups(
        Array.isArray(persisted.selectedStandardInputSubgroups)
          ? persisted.selectedStandardInputSubgroups
          : [],
      );
      setFeatureLabelOverrides(persisted.featureLabels ?? {});
      setFeatureFlags({
        ...FEATURE_FLAG_DEFAULTS,
        ...(persisted.featureFlags ?? {}),
      });
      setGraphInsights(persisted.graphInsights ?? null);
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
      updateInputValues(() => ({}));
      setDisabledStandardInputIds([]);
      setBindings(createDefaultBindings(animatableComponents));
      setSelectedStandardInputRoots([]);
      setSelectedStandardInputSubgroups([]);
      setFeatureLabelOverrides({});
      setFeatureFlags({ ...FEATURE_FLAG_DEFAULTS });
      setGraphInsights(null);
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
    autoInputs.forEach((entry) => {
      const sourceNormalized = normalizeStandardRigInputPath(entry.sourcePath);
      const sourceGroup = deriveGroupFromNormalizedPath(sourceNormalized);
      persistedAuto.push({
        id: entry.input.id,
        path: entry.input.path,
        sourceId: entry.sourceId,
        sourcePath: entry.sourcePath,
        group:
          entry.input.group !== sourceGroup ? entry.input.group : undefined,
        label:
          entry.input.label !== entry.generatedLabel
            ? entry.input.label
            : undefined,
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
      selectedStandardInputSubgroups:
        selectedStandardInputSubgroups.length > 0
          ? selectedStandardInputSubgroups
          : undefined,
      disabledStandardInputIds:
        disabledStandardInputIds.length > 0
          ? disabledStandardInputIds
          : undefined,
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
      featureFlags,
      graphInsights: graphInsights ?? undefined,
      schemaVersion: RIG_STATE_SCHEMA_VERSION,
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
    selectedStandardInputSubgroups,
    disabledStandardInputIds,
    featureFlags,
    graphInsights,
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
    if (!rigGraphBuild || !runtimeGraphSpec) {
      setGraphStatus("idle");
      setGraphError(null);
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
      return;
    }

    const fatalIssues = rigGraphBuild.issues.fatal;
    if (fatalIssues.length > 0) {
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
      setGraphStatus("error");
      setGraphError(
        fatalIssues.length === 1 ? fatalIssues[0] : fatalIssues.join("; "),
      );
      return;
    }

    let cancelled = false;

    setGraphStatus("loading");
    setGraphError(null);

    (async () => {
      try {
        await loadRigGraph(runtimeGraphSpec.spec);
        if (cancelled) {
          return;
        }
        graphSummaryRef.current = rigGraphBuild.summary;
        graphIrRef.current = rigGraphBuild.ir ?? null;
        setGraphStatus("ready");
        setGraphError(null);
      } catch (err) {
        if (cancelled) {
          return;
        }
        graphSummaryRef.current = null;
        graphIrRef.current = null;
        setGraphStatus("error");
        setGraphError(err instanceof Error ? err.message : String(err));
        resetDrivenAnimatables();
      }
    })();

    return () => {
      cancelled = true;
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      unloadRigGraph();
      clearRigStaged();
    };
  }, [
    clearRigStaged,
    loadRigGraph,
    faceId,
    resetDrivenAnimatables,
    rigGraphBuild,
    runtimeGraphSpec,
    unloadRigGraph,
  ]);

  useEffect(() => {
    const summary = graphSummaryRef.current;
    if (graphStatus !== "ready" || !summary) {
      graphInputBindingsRef.current = [];
      graphInputBindingsByIdRef.current = new Map();
      setGraphInputDefaults({});
      resetDrivenAnimatables();
      return;
    }

    clearRigStaged();

    const facePrefix = `rig/${faceId}/`;
    const summaryInputPaths = Array.isArray(summary.inputs)
      ? summary.inputs
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.replace(/^\/+/, ""))
      : [];

    const sliderBindings: Array<{
      graphPath: string;
      inputId?: string;
      defaultValue: number;
    }> = [];
    const defaults: Record<string, number> = {};
    const matchedSliderIds = new Set<string>();
    const unmatchedGraphInputs: string[] = [];

    summaryInputPaths.forEach((graphPath) => {
      let remainder = graphPath;
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
      const candidatePaths = [
        `/${remainder}`,
        stripStandardInputPathPrefix(`/${remainder}`),
      ];
      let matched: StandardRigInput | undefined;
      for (const candidatePath of candidatePaths) {
        const normalizedCandidate =
          normalizeStandardRigInputPath(candidatePath);
        matched = standardInputsByPath.get(normalizedCandidate);
        if (matched) {
          break;
        }
      }
      if (!matched) {
        const candidateId = deriveStandardRigInputIdFromPath(`/${remainder}`);
        matched = standardInputsById.get(candidateId);
      }
      if (matched) {
        matchedSliderIds.add(matched.id);
        defaults[matched.id] = matched.defaultValue ?? 0;
        sliderBindings.push({
          graphPath,
          inputId: matched.id,
          defaultValue: matched.defaultValue ?? 0,
        });
      } else {
        unmatchedGraphInputs.push(graphPath);
      }
    });

    const bindingMap = new Map<string, string>();
    sliderBindings.forEach((binding) => {
      if (binding.inputId) {
        bindingMap.set(binding.inputId, binding.graphPath);
      }
    });

    if (faceId) {
      managedStandardInputs.forEach(({ input }) => {
        if (bindingMap.has(input.id)) {
          return;
        }
        const fallbackPath = buildFallbackGraphPath(faceId, input);
        sliderBindings.push({
          graphPath: fallbackPath,
          inputId: input.id,
          defaultValue: input.defaultValue ?? 0,
        });
        bindingMap.set(input.id, fallbackPath);
      });
    }

    graphInputBindingsRef.current = sliderBindings;
    const nextBindingMap = new Map<string, string>();
    bindingMap.forEach((path, inputId) => {
      nextBindingMap.set(inputId, path);
    });
    graphInputBindingsByIdRef.current = nextBindingMap;
    // if (__DEV__) {
    //   console.groupCollapsed(
    //     "[vizij] graph inputs",
    //     sliderBindings.length,
    //     "/",
    //     summaryInputPaths.length,
    //   );
    //   console.debug("face", faceId);
    //   const missingSliderIds = managedStandardInputs
    //     .map(({ input }) => input.id)
    //     .filter((id) => !matchedSliderIds.has(id));
    //   console.debug("missing slider bindings", missingSliderIds.slice(0, 10));
    //   console.debug(
    //     "unmatched graph inputs",
    //     unmatchedGraphInputs.slice(0, 10),
    //   );
    //   if (typeof window !== "undefined") {
    //     (window as any).__vizijGraphInputs = sliderBindings;
    //   }
    //   console.groupEnd();
    // }
    setGraphInputDefaults(defaults);
  }, [
    clearRigStaged,
    faceId,
    graphStatus,
    managedStandardInputs,
    resetDrivenAnimatables,
    standardInputsById,
    standardInputsByPath,
  ]);

  useEffect(() => {
    if (graphStatus !== "ready") {
      playbackStateRef.current = "paused";
      setGraphPlaybackState("paused");
      cancelAnimationLoop();
      graphTimeRef.current = 0;
      setGraphTimeSeconds(0);
      setRigTime(0);
      return;
    }

    if (graphPlaybackState === "playing") {
      playbackStateRef.current = "playing";
      if (animationFrameRef.current === null) {
        lastFrameTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(runAnimationFrame);
      }
    } else {
      playbackStateRef.current = "paused";
      cancelAnimationLoop();
    }
  }, [
    cancelAnimationLoop,
    graphPlaybackState,
    graphStatus,
    runAnimationFrame,
    setRigTime,
  ]);

  const playGraph = useCallback(() => {
    if (graphStatus !== "ready") {
      return;
    }
    setGraphPlaybackState("playing");
  }, [graphStatus]);

  const pauseGraph = useCallback(() => {
    setGraphPlaybackState("paused");
  }, []);

  const stopGraph = useCallback(() => {
    setGraphPlaybackState("paused");
    playbackStateRef.current = "paused";
    cancelAnimationLoop();
    graphTimeRef.current = 0;
    setGraphTimeSeconds(0);
    setRigTime(0);
    resetDrivenAnimatables();
  }, [cancelAnimationLoop, resetDrivenAnimatables, setRigTime]);

  const stepGraph = useCallback(() => {
    if (graphStatus !== "ready") {
      return;
    }
    if (graphPlaybackState === "playing") {
      setGraphPlaybackState("paused");
    }
    runGraphStep(1 / 60);
  }, [graphPlaybackState, graphStatus, runGraphStep]);

  useEffect(() => {
    stageInputsFromState({ clear: true });
  }, [graphInputDefaults, graphStatus, stageInputsFromState]);

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
    featureFlags,
    graphMachineReport,
    getGraphIr,
    managedStandardInputs,
    standardInputRoots,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    standardInputs,
    standardInputsById,
    graphInputDefaults,
    graphTimeSeconds,
    graphPlaybackState,
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
    applyStandardInputBatch,
    handleResetAllInputValues,
    handleClearCachedState,
    handleBindingInputChange,
    handleBindingRemapChange,
    handleResetBinding,
    handleCreateCustomStandardInput,
    handleLinkChildInput,
    handleUnlinkChildInput,
    handleRenameShape,
    handleEnsureParentBinding,
    handleUpdateStandardInput,
    handleDisableStandardInput,
    handleEnableStandardInput,
    handleDeleteCustomStandardInput,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleBindingSlotValueTypeChange,
    handleUpdateFeatureLabel,
    handleFeatureFlagChange,
    handleParentBindingInputChange,
    handleParentBindingRemapChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentResetBinding,
    handleSelectStandardInputRoots,
    handleSelectStandardInputSubgroups,
    handleFaceIdChange,
    handleFocusSelectionIndex,
    handleClearSelection,
    handleImportGraphSpec,
    setStoreState,
    collectAnimatableExportState,
    playGraph,
    pauseGraph,
    stopGraph,
    stepGraph,
    graphInsights,
  };
}
