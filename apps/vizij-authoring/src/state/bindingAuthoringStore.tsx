import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type {
  BindingMap,
  BindingValueType,
  InputBindingMap,
  StandardInputValues,
} from "@vizij/node-graph-authoring";
import type {
  AnimatableComponent as AnimComponent,
  StandardRigInput,
} from "@vizij/utils";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { ManagedStandardInput } from "../types/standardInputs";
import type { SceneObjectNode } from "../scene/sceneGraph";
import type {
  VizijPipelineConfigMap,
  VizijPipelineMetadataV1,
} from "../utils/graphImport";
import {
  FEATURE_FLAG_DEFAULTS,
  type AuthoringFeatureFlag,
  type FeatureFlagState,
} from "../hooks/useFeatureLabels";

interface AnimatableExportState {
  appliedOverrides: boolean;
  nextAnimatables: Record<string, AnimatableValue>;
  nextValues: Map<string, RawValue | undefined>;
  effectiveAnimatables: Record<string, AnimatableValue>;
}

type BindingAuthoringStoreUpdate =
  | Partial<BindingAuthoringState>
  | ((state: BindingAuthoringState) => Partial<BindingAuthoringState> | void);

export interface BindingAuthoringState {
  bindingIssues: Map<string, readonly string[]>;
  featureLabelOverrides: Record<string, string>;
  featureFlags: FeatureFlagState;
  standardInputSchema: { id: string; version: string } | null;
  managedStandardInputs: ManagedStandardInput[];
  standardInputRoots: string[];
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  standardInputs: StandardRigInput[];
  standardInputsById: Map<string, StandardRigInput>;
  standardInputsByPath: Map<string, StandardRigInput>;
  rigOutputLookup: Map<string, StandardRigInput>;
  validOutputTargets: Set<string>;
  pipelineMetadataV1: VizijPipelineMetadataV1 | null;
  pipelineConfigByInputId: VizijPipelineConfigMap;
  inputValues: StandardInputValues;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  animatableComponents: AnimComponent[];
  handleInputValueChange: (inputId: string, value: number) => void;
  stageRuntimeGraphPathValue: (graphPath: string, value: number) => void;
  applyStandardInputBatch: (
    updates: Record<string, number>,
    options?: { replace?: boolean },
  ) => void;
  handleResetAllInputValues: () => void;
  handleClearCachedState: () => void;
  handleBindingInputChange: (
    targetId: string,
    inputId: string | null,
    slotId?: string,
  ) => void;
  handleResetBinding: (targetId: string) => void;
  applyBindingPatch: (updater: (bindings: BindingMap) => BindingMap) => void;
  applyInputBindingPatch: (
    updater: (bindings: InputBindingMap) => InputBindingMap,
  ) => void;
  handleCreateCustomStandardInput: (path: string) => StandardRigInput | null;
  handleLinkChildInput: (parentId: string, childId: string) => void;
  handleUnlinkChildInput: (parentId: string, childId: string) => void;
  handleRenameShape: (shapeId: string, value: string) => void;
  handleUpdateStandardInput: (
    inputId: string,
    updates: {
      path?: string;
      label?: string;
      sourceId?: string | null;
      defaultValue?: number;
      range?: { min?: number; max?: number };
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
  handleEnsureParentBinding: (targetId: string) => void;
  handleBindingSlotValueTypeChange: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  handleParentBindingInputChange: (
    targetId: string,
    inputId: string | null,
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
  handleEnableParentLocalControl: (targetId: string) => void;
  handleCloneStandardInputs: (
    inputIds: readonly string[],
    options?: { labelSuffix?: string; pathSuffix?: string },
  ) => Map<string, string>;
  handleUpdateFeatureLabel: (
    featureId: string,
    defaultLabel: string,
    value: string,
  ) => void;
  setFeatureLabelOverrides: (
    updater:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setStandardInputSchema: (
    schema:
      | { id: string; version: string }
      | null
      | ((
          prev: BindingAuthoringState["standardInputSchema"],
        ) => BindingAuthoringState["standardInputSchema"]),
  ) => void;
  handleFeatureFlagChange: (
    flag: AuthoringFeatureFlag,
    enabled: boolean,
  ) => void;
  handleSelectStandardInputRoots: (roots: string[]) => void;
  handleSelectStandardInputSubgroups: (groups: string[]) => void;
  collectAnimatableExportState: () => AnimatableExportState;
  sceneObjects: SceneObjectNode[];
  sceneObjectRoots: string[];
  hiddenDriverIds: Set<string>;
  handleHideDriver: (inputId: string) => void;
  handleShowDriver: (inputId: string) => void;
  handleShowAllDrivers: () => void;
  handleCreateParentDriverBinding: (
    targetId: string,
    upstreamId: string,
  ) => void;
  selectedRigId: string | null;
  handleSelectRig: (id: string | null) => void;
  selectedMaterialId: string | null;
  handleSelectMaterial: (id: string | null) => void;
}

export interface BindingAuthoringStore {
  getState: () => BindingAuthoringState;
  setState: (updater: BindingAuthoringStoreUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

const noop = () => undefined;

const defaultBindingAuthoringState: BindingAuthoringState = {
  bindingIssues: new Map(),
  featureLabelOverrides: {},
  featureFlags: { ...FEATURE_FLAG_DEFAULTS },
  standardInputSchema: { id: "vizij-standard-face", version: "v1" },
  managedStandardInputs: [],
  standardInputRoots: [],
  selectedStandardInputRoots: [],
  selectedStandardInputSubgroups: [],
  standardInputs: [],
  standardInputsById: new Map(),
  standardInputsByPath: new Map(),
  rigOutputLookup: new Map(),
  validOutputTargets: new Set(),
  pipelineMetadataV1: null,
  pipelineConfigByInputId: {},
  inputValues: {},
  bindings: {},
  inputBindings: {},
  animatableComponents: [],
  handleInputValueChange: noop,
  stageRuntimeGraphPathValue: noop,
  applyStandardInputBatch: noop,
  handleResetAllInputValues: noop,
  handleClearCachedState: noop,
  handleBindingInputChange: () => undefined,
  handleResetBinding: () => undefined,
  applyBindingPatch: () => undefined,
  applyInputBindingPatch: () => undefined,
  handleCreateCustomStandardInput: () => null,
  handleLinkChildInput: () => undefined,
  handleUnlinkChildInput: () => undefined,
  handleRenameShape: () => undefined,
  handleUpdateStandardInput: () => undefined,
  handleDisableStandardInput: () => undefined,
  handleEnableStandardInput: () => undefined,
  handleDeleteCustomStandardInput: () => undefined,
  handleAddBindingSlot: () => undefined,
  handleRemoveBindingSlot: () => undefined,
  handleUpdateBindingExpression: () => undefined,
  handleUpdateBindingSlotAlias: () => undefined,
  handleEnsureParentBinding: () => undefined,
  handleBindingSlotValueTypeChange: () => undefined,
  handleParentBindingInputChange: () => undefined,
  handleParentAddBindingSlot: () => undefined,
  handleParentRemoveBindingSlot: () => undefined,
  handleParentBindingExpressionChange: () => undefined,
  handleParentBindingSlotAliasChange: () => undefined,
  handleParentBindingSlotValueTypeChange: () => undefined,
  handleParentResetBinding: () => undefined,
  handleEnableParentLocalControl: () => undefined,
  handleCloneStandardInputs: () => new Map(),
  handleUpdateFeatureLabel: () => undefined,
  setFeatureLabelOverrides: () => undefined,
  setStandardInputSchema: () => undefined,
  handleFeatureFlagChange: () => undefined,
  handleSelectStandardInputRoots: () => undefined,
  handleSelectStandardInputSubgroups: () => undefined,
  collectAnimatableExportState: () => ({
    appliedOverrides: false,
    nextAnimatables: {},
    nextValues: new Map(),
    effectiveAnimatables: {},
  }),
  sceneObjects: [],
  sceneObjectRoots: [],
  hiddenDriverIds: new Set(),
  handleHideDriver: () => undefined,
  handleShowDriver: () => undefined,
  handleShowAllDrivers: () => undefined,
  handleCreateParentDriverBinding: () => undefined,
  selectedRigId: null,
  handleSelectRig: () => undefined,
  selectedMaterialId: null,
  handleSelectMaterial: () => undefined,
};

export function createBindingAuthoringStore(
  initialState?: Partial<BindingAuthoringState>,
): BindingAuthoringStore {
  let state: BindingAuthoringState = {
    ...defaultBindingAuthoringState,
    ...(initialState ?? {}),
  };
  const listeners = new Set<() => void>();

  const setState = (updater: BindingAuthoringStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const nextState = { ...state, ...patch } as BindingAuthoringState;

    // Check if any value actually changed
    const hasChanged = Object.keys(patch).some(
      (key) => (state as any)[key] !== (nextState as any)[key],
    );

    if (!hasChanged) {
      return;
    }
    state = nextState;
    listeners.forEach((listener) => listener());
  };

  state.handleSelectRig = (id: string | null) => {
    setState({ selectedRigId: id });
  };
  state.handleSelectMaterial = (id: string | null) => {
    setState({ selectedMaterialId: id });
  };

  return {
    getState: () => state,
    setState,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const BindingAuthoringStoreContext =
  createContext<BindingAuthoringStore | null>(null);

interface BindingAuthoringStoreProviderProps {
  store: BindingAuthoringStore;
  children: ReactNode;
}

export function BindingAuthoringStoreProvider({
  store,
  children,
}: BindingAuthoringStoreProviderProps) {
  return (
    <BindingAuthoringStoreContext.Provider value={store}>
      {children}
    </BindingAuthoringStoreContext.Provider>
  );
}

function useBindingAuthoringStoreApi(): BindingAuthoringStore {
  const store = useContext(BindingAuthoringStoreContext);
  if (!store) {
    throw new Error(
      "BindingAuthoringStoreProvider is missing. Wrap components with RigControllerProvider.",
    );
  }
  return store;
}

export function useBindingAuthoringStore<T>(
  selector: (state: BindingAuthoringState) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useBindingAuthoringStoreApi();
  const lastValueRef = useRef<T | undefined>(undefined);
  const subscribe = store.subscribe;
  const getSnapshot = () => selector(store.getState());
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const previous = lastValueRef.current;
  if (previous !== undefined && equalityFn(previous, value)) {
    return previous;
  }
  lastValueRef.current = value;
  return value;
}
