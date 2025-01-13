import { type RefObject } from "react";
import * as THREE from "three";
import { Group, Mesh } from "three";
import { RawValue, AnimatableValue } from "@semio/utils";
import { World } from "./types/world";
import { RenderableFeature } from "./types/renderable-feature";

export interface VizijData {
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  selection: string | null;
  // Remove after control refactor
  renderHit: boolean;
  dragLock: string | null;
  preferences: {
    damping: boolean;
  };
  selectedWorldElement: string;
}

export interface VizijActions {
  setValue: (id: string, namespace: string, value: RawValue) => void;
  setWorldElementName: (id: string, value: string) => void;
  setVizij: (scene: World, animatables: Record<string, AnimatableValue>) => void;
  select: (id: string | null) => void;
  deselect: () => void;
  setDragLock: (lock: string | null) => void;
  // Add world elements and animated values
  addWorldElements: (
    world: World,
    animatables: Record<string, AnimatableValue>,
    replace?: boolean,
  ) => void;
  setPreferences: (preferences: Partial<VizijData["preferences"]>) => void;
  getExportableBodies: (filterIds?: string[]) => Group[];
  setSelectedWorldElement: (id: string) => void;
  setOrigin: (
    id: string,
    origin: { translation?: THREE.Vector3; rotation?: THREE.Vector3 },
  ) => void;
  setAxis: (id: string, axis: THREE.Vector3) => void;
  setTags: (id: string, tags: string[]) => void;
  setStaticFeature: (id: string, feature: RenderableFeature, value: RawValue) => void;
  setAnimatableValue: (id: string, value: AnimatableValue) => void;
  setParent: (id: string, parent: string) => void;
  setChild: (id: string, child: string) => void;
  setChildren: (id: string, children: string[]) => void;
  setGeometry: (id: string, geometry: THREE.BufferGeometry) => void;
  setMaterial: (id: string, material: string) => void;
  setReference: (id: string, namespace: string, object: RefObject<Group | Mesh>) => void;
  createGroup: (root: boolean) => void;
  createAnimatable: (
    elementId: string,
    featureName: string,
    value: Partial<AnimatableValue>,
  ) => void;
  createStatic: (elementId: string, featureName: string, value: RawValue) => void;
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
