import { useMemo, useCallback } from "react";
import type { RawValue, AnimatableValue } from "@vizij/utils";
import type { BindingValueType } from "@vizij/node-graph-authoring";
import type { ShapeMaterial } from "@vizij/render";
import { useVizijStoreGetter } from "@vizij/render";
import { DEFAULT_NAMESPACE } from "../utils/constants";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../state/RigControllerProvider";
import type { SceneObjectNode, SceneObjectFeature } from "./sceneGraph";
import { createFeatureMutations } from "./featureMutations";
import type { FeatureEntry } from "./featureEntries";
import type { VectorComponent } from "./featureEntries";
import {
  assignMaterialToShape,
  buildSceneMaterials,
  deleteSceneNode,
  duplicateMaterialForShape,
  duplicateSceneNode,
  reparentSceneNodeWithPreservedWorld,
  type DuplicateNodeOptions,
  type SceneMaterial,
} from "./sceneEditing";

interface SceneComposer {
  objects: SceneObjectNode[];
  rootIds: string[];
  getNode: (id: string) => SceneObjectNode | undefined;
  getChildren: (parentId: string | null) => SceneObjectNode[];
  getBreadcrumb: (nodeId: string) => SceneObjectNode[];
  selectObject: (id: string) => void;
  setFeatureAnimated: (
    nodeId: string,
    featureId: string,
    makeAnimated: boolean,
  ) => void;
  setFeatureDefault: (
    nodeId: string,
    featureId: string,
    value: RawValue,
  ) => void;
  setStaticFeatureValue: (
    nodeId: string,
    featureId: string,
    value: RawValue,
  ) => void;
  setDriverInput: (
    targetId: string,
    inputId: string | null,
    options?: { slotId?: string },
  ) => void;
  addDriverSlot: (targetId: string) => void;
  removeDriverSlot: (targetId: string, slotId: string) => void;
  setDriverExpression: (targetId: string, expression: string) => void;
  setDriverSlotAlias: (targetId: string, slotId: string, alias: string) => void;
  setDriverSlotValueType: (
    targetId: string,
    slotId: string,
    valueType: BindingValueType,
  ) => void;
  updateAnimatableDescriptor: (
    animatableId: string,
    updater: (current: AnimatableValue) => AnimatableValue,
  ) => void;
  duplicateNode: (id: string, options?: DuplicateNodeOptions) => string | null;
  deleteNode: (id: string, options?: { includeChildren?: boolean }) => void;
  reparentNode: (id: string, parentId: string | null) => void;
  materials: SceneMaterial[];
  assignMaterial: (shapeId: string, materialId: string) => void;
  duplicateMaterial: (
    shapeId: string,
    options?: { label?: string; type?: ShapeMaterial },
  ) => void;
}

export function useSceneComposer(): SceneComposer {
  const sceneObjects = useBindingAuthoring((state) => state.sceneObjects);
  const sceneObjectRoots = useBindingAuthoring(
    (state) => state.sceneObjectRoots,
  );
  const handleBindingInputChange = useBindingAuthoring(
    (state) => state.handleBindingInputChange,
  );
  const handleAddBindingSlot = useBindingAuthoring(
    (state) => state.handleAddBindingSlot,
  );
  const handleRemoveBindingSlot = useBindingAuthoring(
    (state) => state.handleRemoveBindingSlot,
  );
  const handleUpdateBindingExpression = useBindingAuthoring(
    (state) => state.handleUpdateBindingExpression,
  );
  const handleUpdateBindingSlotAlias = useBindingAuthoring(
    (state) => state.handleUpdateBindingSlotAlias,
  );
  const handleBindingSlotValueTypeChange = useBindingAuthoring(
    (state) => state.handleBindingSlotValueTypeChange,
  );
  const applyInputBindingPatch = useBindingAuthoring(
    (state) => state.applyInputBindingPatch,
  );
  const bindings = useBindingAuthoring((state) => state.bindings);
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const handleCloneStandardInputs = useBindingAuthoring(
    (state) => state.handleCloneStandardInputs,
  );
  const featureLabelOverrides = useBindingAuthoring(
    (state) => state.featureLabelOverrides,
  );
  const setFeatureLabelOverrides = useBindingAuthoring(
    (state) => state.setFeatureLabelOverrides,
  );
  const applyBindingPatch = useBindingAuthoring(
    (state) => state.applyBindingPatch,
  );
  const setStoreState = useGraphRuntime((state) => state.setStoreState);
  const world = useGraphRuntime((state) => state.world);
  const animatables = useGraphRuntime((state) => state.animatables);
  const getVizijState = useVizijStoreGetter();

  const {
    toggleFeatureAnimation,
    updateAnimatableDefault,
    updateStaticFeature,
    updateAnimatableDescriptor,
  } = useMemo(() => createFeatureMutations(setStoreState), [setStoreState]);

  const nodesById = useMemo(() => {
    const lookup = new Map<string, SceneObjectNode>();
    sceneObjects.forEach((node) => {
      lookup.set(node.id, node);
    });
    return lookup;
  }, [sceneObjects]);

  const materials = useMemo(
    () => buildSceneMaterials({ world, animatables }),
    [animatables, world],
  );

  const rootNodes = useMemo(() => {
    return sceneObjectRoots
      .map((id) => nodesById.get(id))
      .filter((node): node is SceneObjectNode => Boolean(node));
  }, [nodesById, sceneObjectRoots]);

  const selectObject = useCallback(
    (id: string) => {
      setStoreState((state) => {
        const renderable = state.world[id];
        if (!renderable) {
          return state;
        }
        const selectionType: "shape" | "group" | "ellipse" | "rectangle" =
          renderable.type === "group"
            ? "group"
            : renderable.type === "ellipse"
              ? "ellipse"
              : renderable.type === "rectangle"
                ? "rectangle"
                : "shape";
        return {
          ...state,
          elementSelection: [
            {
              id,
              type: selectionType,
              namespace: DEFAULT_NAMESPACE,
            },
          ],
        };
      });
    },
    [setStoreState],
  );

  const findFeature = useCallback(
    (
      nodeId: string,
      featureId: string,
    ): [SceneObjectNode, SceneObjectFeature] | null => {
      const node = sceneObjects.find((entry) => entry.id === nodeId);
      if (!node) {
        return null;
      }
      const feature = node.features.find((feat) => feat.id === featureId);
      if (!feature) {
        return null;
      }
      return [node, feature];
    },
    [sceneObjects],
  );

  const getNode = useCallback((id: string) => nodesById.get(id), [nodesById]);

  const getChildren = useCallback(
    (parentId: string | null) => {
      if (parentId === null) {
        return rootNodes;
      }
      const parent = nodesById.get(parentId);
      if (!parent) {
        return [];
      }
      return parent.childIds
        .map((childId) => nodesById.get(childId))
        .filter((child): child is SceneObjectNode => Boolean(child));
    },
    [nodesById, rootNodes],
  );

  const getBreadcrumb = useCallback(
    (nodeId: string) => {
      const crumbs: SceneObjectNode[] = [];
      let current = nodesById.get(nodeId) ?? null;
      while (current) {
        crumbs.unshift(current);
        if (!current.parentId) {
          break;
        }
        current = nodesById.get(current.parentId) ?? null;
      }
      return crumbs;
    },
    [nodesById],
  );

  const toFeatureEntry = useCallback(
    (
      node: SceneObjectNode,
      feature: SceneObjectFeature,
    ): FeatureEntry | null => {
      if (feature.type === "number") {
        return {
          id: feature.id,
          elementId: node.id,
          elementName: node.name,
          elementType: node.type,
          featureKey: feature.key,
          defaultLabel: feature.defaultLabel,
          featureLabel: feature.label,
          animated: feature.animated,
          animatableId: feature.animatableId,
          descriptor: feature.descriptor,
          staticValue: feature.staticValue,
          type: "number",
        };
      }

      const components: readonly VectorComponent[] = feature.components
        .map((component) => component.componentKey)
        .filter((value): value is VectorComponent => Boolean(value));
      if (!feature.descriptorType) {
        return null;
      }
      return {
        id: feature.id,
        elementId: node.id,
        elementName: node.name,
        elementType: node.type,
        featureKey: feature.key,
        defaultLabel: feature.defaultLabel,
        featureLabel: feature.label,
        animated: feature.animated,
        animatableId: feature.animatableId,
        descriptor: feature.descriptor,
        staticValue: feature.staticValue,
        type: "vector3",
        vector: {
          descriptorType: feature.descriptorType,
          components,
        },
      };
    },
    [],
  );

  const setFeatureAnimated = useCallback(
    (nodeId: string, featureId: string, makeAnimated: boolean) => {
      const tuple = findFeature(nodeId, featureId);
      if (!tuple) {
        return;
      }
      const entry = toFeatureEntry(...tuple);
      if (!entry) {
        return;
      }
      toggleFeatureAnimation(entry, makeAnimated);
    },
    [findFeature, toggleFeatureAnimation, toFeatureEntry],
  );

  const setFeatureDefault = useCallback(
    (nodeId: string, featureId: string, value: RawValue) => {
      const tuple = findFeature(nodeId, featureId);
      if (!tuple) {
        return;
      }
      const entry = toFeatureEntry(...tuple);
      if (!entry) {
        return;
      }
      updateAnimatableDefault(entry, value);
    },
    [findFeature, toFeatureEntry, updateAnimatableDefault],
  );

  const setStaticFeatureValue = useCallback(
    (nodeId: string, featureId: string, value: RawValue) => {
      const tuple = findFeature(nodeId, featureId);
      if (!tuple) {
        return;
      }
      const entry = toFeatureEntry(...tuple);
      if (!entry) {
        return;
      }
      updateStaticFeature(entry, value);
    },
    [findFeature, toFeatureEntry, updateStaticFeature],
  );

  const setDriverInput = useCallback(
    (
      targetId: string,
      inputId: string | null,
      options?: { slotId?: string },
    ) => {
      handleBindingInputChange(targetId, inputId, options?.slotId);
    },
    [handleBindingInputChange],
  );

  const addDriverSlot = useCallback(
    (targetId: string) => {
      handleAddBindingSlot(targetId);
    },
    [handleAddBindingSlot],
  );

  const removeDriverSlot = useCallback(
    (targetId: string, slotId: string) => {
      handleRemoveBindingSlot(targetId, slotId);
    },
    [handleRemoveBindingSlot],
  );

  const setDriverExpression = useCallback(
    (targetId: string, expression: string) => {
      handleUpdateBindingExpression(targetId, expression);
    },
    [handleUpdateBindingExpression],
  );

  const setDriverSlotAlias = useCallback(
    (targetId: string, slotId: string, alias: string) => {
      handleUpdateBindingSlotAlias(targetId, slotId, alias);
    },
    [handleUpdateBindingSlotAlias],
  );

  const setDriverSlotValueType = useCallback(
    (targetId: string, slotId: string, valueType: BindingValueType) => {
      handleBindingSlotValueTypeChange(targetId, slotId, valueType);
    },
    [handleBindingSlotValueTypeChange],
  );

  const applySceneUpdate = useCallback(
    (result: {
      world: any;
      animatables: Record<string, AnimatableValue>;
      values: Map<string, RawValue | undefined>;
      bindings: typeof bindings;
      featureLabelOverrides?: Record<string, string>;
      driverScaleAdjustments?: Map<string, number>;
    }) => {
      setStoreState((state) => {
        const prunedSelection =
          state.elementSelection?.filter((entry) => result.world[entry.id]) ??
          [];
        return {
          ...state,
          world: result.world,
          animatables: result.animatables,
          values: result.values,
          elementSelection: prunedSelection,
        };
      });
      if (applyBindingPatch) {
        applyBindingPatch((previous) => result.bindings ?? previous);
      }
      if (setFeatureLabelOverrides && result.featureLabelOverrides) {
        setFeatureLabelOverrides(result.featureLabelOverrides);
      }

      if (
        result.driverScaleAdjustments &&
        result.driverScaleAdjustments.size > 0
      ) {
        const pendingValues: Record<string, number> = {};
        result.driverScaleAdjustments.forEach((factor, inputId) => {
          const input = standardInputsById.get(inputId);
          if (!input || !Number.isFinite(factor) || factor === 0) {
            return;
          }
          const nextRange = {
            min:
              typeof input.range.min === "number"
                ? input.range.min / factor
                : input.range.min,
            max:
              typeof input.range.max === "number"
                ? input.range.max / factor
                : input.range.max,
          };
          if (
            typeof nextRange.min === "number" &&
            typeof nextRange.max === "number" &&
            nextRange.min > nextRange.max
          ) {
            const tmp = nextRange.min;
            nextRange.min = nextRange.max;
            nextRange.max = tmp;
          }
          const nextDefault =
            typeof input.defaultValue === "number"
              ? input.defaultValue / factor
              : input.defaultValue;
          handleUpdateStandardInput(inputId, {
            defaultValue: nextDefault,
            range: nextRange,
          });
          const currentValue = inputValues[inputId];
          if (typeof currentValue === "number") {
            pendingValues[inputId] = currentValue / factor;
          }
        });
        if (Object.keys(pendingValues).length > 0) {
          applyStandardInputBatch(pendingValues);
        }
      }
    },
    [
      applyBindingPatch,
      handleInputValueChange,
      handleUpdateStandardInput,
      applyStandardInputBatch,
      inputValues,
      setFeatureLabelOverrides,
      setStoreState,
      standardInputsById,
    ],
  );

  const cloneInputBindingsForMap = useCallback(
    (mapping: Map<string, string>) => {
      if (!applyInputBindingPatch || mapping.size === 0) {
        return;
      }
      applyInputBindingPatch((previous) => {
        let changed = false;
        const next: typeof previous = { ...previous };
        mapping.forEach((newId, oldId) => {
          const binding = previous[oldId];
          if (!binding) return;
          const remap = (id?: string | null): string | null =>
            id ? (mapping.get(id) ?? id) : null;
          const cloned = {
            ...binding,
            targetId: newId,
            inputId: remap(binding.inputId),
            slots: binding.slots.map((slot) => ({
              ...slot,
              inputId: remap(slot.inputId),
            })),
          };
          next[newId] = cloned;
          changed = true;
        });
        return changed ? next : previous;
      });
    },
    [applyInputBindingPatch],
  );

  const duplicateNode = useCallback(
    (id: string, options?: DuplicateNodeOptions) => {
      const vizij = getVizijState();
      const result = duplicateSceneNode(
        {
          world: vizij.world,
          animatables: vizij.animatables,
          values: vizij.values,
          bindings,
          featureLabelOverrides,
          namespace: DEFAULT_NAMESPACE,
        },
        id,
        {
          ...options,
          cloneInputs: (inputIds) =>
            handleCloneStandardInputs(Array.from(inputIds)),
        },
      );
      if (!result) {
        return null;
      }
      applySceneUpdate(result);
      if (result.clonedInputMap && result.clonedInputMap.size > 0) {
        cloneInputBindingsForMap(result.clonedInputMap);
      }
      return result.newRootId;
    },
    [
      applySceneUpdate,
      bindings,
      featureLabelOverrides,
      getVizijState,
      handleCloneStandardInputs,
      cloneInputBindingsForMap,
    ],
  );

  const deleteNode = useCallback(
    (id: string, options?: { includeChildren?: boolean }) => {
      const vizij = getVizijState();
      const result = deleteSceneNode(
        {
          world: vizij.world,
          animatables: vizij.animatables,
          values: vizij.values,
          bindings,
          featureLabelOverrides,
          namespace: DEFAULT_NAMESPACE,
        },
        id,
        options,
      );
      if (!result) {
        return;
      }
      applySceneUpdate(result);
    },
    [applySceneUpdate, bindings, featureLabelOverrides, getVizijState],
  );

  const reparentNode = useCallback(
    (id: string, parentId: string | null) => {
      const vizij = getVizijState();
      const result = reparentSceneNodeWithPreservedWorld(
        {
          world: vizij.world,
          animatables: vizij.animatables,
          values: vizij.values,
          bindings,
          featureLabelOverrides,
          namespace: DEFAULT_NAMESPACE,
        },
        id,
        parentId,
      );
      if (!result) {
        return;
      }
      applySceneUpdate(result);
    },
    [applySceneUpdate, bindings, featureLabelOverrides, getVizijState],
  );

  const assignMaterial = useCallback(
    (shapeId: string, materialId: string) => {
      const vizij = getVizijState();
      const result = assignMaterialToShape(
        {
          world: vizij.world,
          animatables: vizij.animatables,
          values: vizij.values,
          bindings,
          featureLabelOverrides,
          namespace: DEFAULT_NAMESPACE,
        },
        shapeId,
        materialId,
      );
      if (!result) {
        return;
      }
      applySceneUpdate(result);
    },
    [applySceneUpdate, bindings, featureLabelOverrides, getVizijState],
  );

  const duplicateMaterial = useCallback(
    (shapeId: string, options?: { label?: string; type?: ShapeMaterial }) => {
      const vizij = getVizijState();
      const result = duplicateMaterialForShape(
        {
          world: vizij.world,
          animatables: vizij.animatables,
          values: vizij.values,
          bindings,
          featureLabelOverrides,
          namespace: DEFAULT_NAMESPACE,
        },
        shapeId,
        options,
      );
      if (!result) {
        return;
      }
      applySceneUpdate(result);
    },
    [applySceneUpdate, bindings, featureLabelOverrides, getVizijState],
  );

  return {
    objects: sceneObjects,
    rootIds: sceneObjectRoots,
    getNode,
    getChildren,
    getBreadcrumb,
    selectObject,
    setFeatureAnimated,
    setFeatureDefault,
    setStaticFeatureValue,
    setDriverInput,
    addDriverSlot,
    removeDriverSlot,
    setDriverExpression,
    setDriverSlotAlias,
    setDriverSlotValueType,
    updateAnimatableDescriptor,
    duplicateNode,
    deleteNode,
    reparentNode,
    materials,
    assignMaterial,
    duplicateMaterial,
  };
}
