import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type {
  BindingMap,
  InputBindingMap,
  StandardInputValues,
} from "@vizij/node-graph-authoring";
import type {
  AnimatableComponent as AnimComponent,
  RigBindingDefinition,
  StandardRigInput,
} from "@vizij/utils";
import { planShapeInputRename } from "@vizij/studio-support";
import type { PersistedAutoStandardInput } from "../rig/persistence";
import type { AutoInputState } from "../types/autoInputs";

type AnimatableComponent = AnimComponent;

export interface ShapeRenameParams {
  shapeId: string;
  oldSlug: string;
  newSlug: string;
  shapeName: string;
  previousName: string;
  autoInputsRef: MutableRefObject<Map<string, AutoInputState>>;
  customInputsRef: MutableRefObject<StandardRigInput[]>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  setAutoInputs: Dispatch<SetStateAction<Map<string, AutoInputState>>>;
  allStandardInputsRef: MutableRefObject<Map<string, StandardRigInput>>;
  disabledStandardInputIdsRef: MutableRefObject<Set<string>>;
  setDisabledStandardInputIds: Dispatch<SetStateAction<string[]>>;
  disabledInputBindingCacheRef: MutableRefObject<
    Map<string, RigBindingDefinition>
  >;
  inputValuesRef: MutableRefObject<StandardInputValues>;
  updateInputValues: (
    updater: (prev: StandardInputValues) => StandardInputValues,
  ) => void;
  bindingsRef: MutableRefObject<BindingMap>;
  setBindings: Dispatch<SetStateAction<BindingMap>>;
  componentsByIdRef: MutableRefObject<Map<string, AnimatableComponent>>;
  inputBindingsRef: MutableRefObject<InputBindingMap>;
  setInputBindings: Dispatch<SetStateAction<InputBindingMap>>;
  pendingInputBindingDefinitionsRef: MutableRefObject<Record<
    string,
    RigBindingDefinition
  > | null>;
  persistedAutoInputsRef: MutableRefObject<
    Map<string, PersistedAutoStandardInput>
  >;
  refreshAutoMetadataForShape: (shapeId: string, shapeName: string) => void;
  selectedStandardInputRootsRef: MutableRefObject<readonly string[]>;
  setSelectedStandardInputRoots: Dispatch<SetStateAction<string[]>>;
  selectedStandardInputSubgroupsRef: MutableRefObject<readonly string[]>;
  setSelectedStandardInputSubgroups: Dispatch<SetStateAction<string[]>>;
  featureLabelOverridesRef: MutableRefObject<Record<string, string>>;
  setFeatureLabelOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  resolvePersistedAutoKey: (
    sourceId?: string | null,
    sourcePath?: string | null,
  ) => string | null;
}

export function applyShapeInputRename({
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
  disabledStandardInputIdsRef,
  setDisabledStandardInputIds,
  disabledInputBindingCacheRef,
  inputValuesRef,
  updateInputValues,
  bindingsRef,
  setBindings,
  componentsByIdRef,
  inputBindingsRef,
  setInputBindings,
  pendingInputBindingDefinitionsRef,
  persistedAutoInputsRef,
  refreshAutoMetadataForShape,
  selectedStandardInputRootsRef,
  setSelectedStandardInputRoots,
  selectedStandardInputSubgroupsRef,
  setSelectedStandardInputSubgroups,
  featureLabelOverridesRef,
  setFeatureLabelOverrides,
  resolvePersistedAutoKey,
}: ShapeRenameParams): Map<string, string> {
  const plan = planShapeInputRename<AutoInputState, PersistedAutoStandardInput>(
    {
      shapeId,
      oldSlug,
      newSlug,
      shapeName,
      previousName,
      autoInputs: autoInputsRef.current,
      customInputs: customInputsRef.current,
      allStandardInputs: allStandardInputsRef.current,
      disabledInputIds: Array.from(disabledStandardInputIdsRef.current),
      disabledInputBindingCache: disabledInputBindingCacheRef.current,
      inputValues: inputValuesRef.current,
      bindings: bindingsRef.current,
      componentsById: componentsByIdRef.current,
      inputBindings: inputBindingsRef.current,
      pendingInputBindingDefinitions: pendingInputBindingDefinitionsRef.current,
      persistedAutoInputs: persistedAutoInputsRef.current,
      selectedStandardInputRoots: selectedStandardInputRootsRef.current,
      selectedStandardInputSubgroups: selectedStandardInputSubgroupsRef.current,
      featureLabelOverrides: featureLabelOverridesRef.current,
      resolvePersistedAutoKey,
    },
  );

  if (!plan.changed) {
    refreshAutoMetadataForShape(shapeId, shapeName);
    return plan.inputIdMap;
  }

  setCustomInputs(plan.customInputs);
  setAutoInputs(plan.autoInputs);
  allStandardInputsRef.current = plan.allStandardInputs;
  setDisabledStandardInputIds(plan.disabledInputIds);
  disabledInputBindingCacheRef.current = plan.disabledInputBindingCache;
  updateInputValues(() => plan.inputValues);
  setBindings(plan.bindings);
  setInputBindings(plan.inputBindings);
  pendingInputBindingDefinitionsRef.current =
    plan.pendingInputBindingDefinitions;
  persistedAutoInputsRef.current = plan.persistedAutoInputs;
  setSelectedStandardInputRoots(plan.selectedStandardInputRoots);
  setSelectedStandardInputSubgroups(plan.selectedStandardInputSubgroups);
  setFeatureLabelOverrides(plan.featureLabelOverrides);

  return plan.inputIdMap;
}
