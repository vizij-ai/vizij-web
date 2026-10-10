import type * as THREE from "three";
import type { RawValue, AnimatableValue } from "@vizij/utils";
import type { World, Selection, RenderableFeature } from "./types";

export interface VizijData {
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  preferences: {
    damping: boolean;
  };
  elementSelection: Selection[];
}

export interface VizijActions {
  setValue: (
    id: string,
    namespace: string,
    value: RawValue | ((current: RawValue | undefined) => RawValue | undefined),
  ) => void;
  setValues: (
    writes: Array<{
      id: string;
      namespace: string;
      value: RawValue;
    }>,
  ) => void;
  setWorldElementName: (id: string, value: string) => void;
  setVizij: (
    scene: World,
    animatables: Record<string, AnimatableValue>,
  ) => void;
  addWorldElements: (
    world: World,
    animatables: Record<string, AnimatableValue>,
    replace?: boolean,
  ) => void;
  setPreferences: (preferences: Partial<VizijData["preferences"]>) => void;
  updateElementSelection: (selection: Selection, chain: string[]) => void;
  clearSelection: () => void;
  setOrigin: (
    id: string,
    origin: { translation?: THREE.Vector3; rotation?: THREE.Vector3 },
  ) => void;
  setAxis: (id: string, axis: THREE.Vector3) => void;
  setTags: (id: string, tags: string[]) => void;
  setStaticFeature: (
    id: string,
    feature: RenderableFeature,
    value: RawValue,
  ) => void;
  setAnimatableValue: (id: string, value: AnimatableValue) => void;
  setParent: (id: string, parent: string) => void;
  setChild: (id: string, child: string) => void;
  setChildren: (id: string, children: string[]) => void;
  setGeometry: (id: string, geometry: THREE.BufferGeometry) => void;
  setMaterial: (id: string, material: string) => void;
  createGroup: (root: boolean) => void;
  createAnimatable: (
    elementId: string,
    featureName: string,
    value: Partial<AnimatableValue>,
  ) => void;
  createStatic: (
    elementId: string,
    featureName: string,
    value: RawValue,
  ) => void;
}

export type VizijStoreSetter = (
  partial:
    | (VizijData & VizijActions)
    | Partial<VizijData & VizijActions>
    | ((
        state: VizijData & VizijActions,
      ) => (VizijData & VizijActions) | Partial<VizijData & VizijActions>),
  replace?: false | undefined,
) => void;

export type VizijStoreGetter = () => VizijData & VizijActions;
