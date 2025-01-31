import { MutableRefObject, type RefObject } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { produce, enableMapSet } from "immer";
import * as THREE from "three";
import { Group, Mesh } from "three";
import { type RawValue, type AnimatableValue, getLookup } from "@semio/utils";
import { World } from "./types/world";
import { createNewElement } from "./actions/create-new-element";
import { removeFromTree } from "./actions/remove-children";
import { VizijData, VizijActions, VizijStoreGetter, VizijStoreSetter } from "./store-types";
import { createAnimatable } from "./functions/create-animatable";
import { RenderableFeature } from "./types/renderable-feature";
import { BodyFeature } from "./types/body";
import { StaticFeature } from "./types/feature";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
enableMapSet();

export const VizijSlice = (set: VizijStoreSetter, get: VizijStoreGetter) => ({
  // worldRef: createRef<THREE.Group>(),
  world: {},
  animatables: {},
  values: new Map(),
  selection: null,
  renderHit: false,
  dragLock: null,
  preferences: {
    damping: false,
  },
  selectedWorldElement: "",
  setSelectedWorldElement: (id: string) => set({ selectedWorldElement: id }),
  getExportableBodies: (filterIds?: string[]) => {
    const worldData = get().world as World;
    if (!filterIds) {
      const bodies = Object.values(worldData)
        .filter((entry) => entry.type === "group" && entry.root)
        .map((entry) => {
          const firstNs = Object.keys(entry.refs)[0];
          const refGroup = entry.refs[firstNs].current!;
          return refGroup as unknown as Group;
        });
      return bodies;
    } else {
      const bodies = Object.values(worldData)
        .filter((entry) => entry.type === "group" && entry.root && filterIds.includes(entry.id))
        .map((entry) => {
          const firstNs = Object.keys(entry.refs)[0];
          const refGroup = entry.refs[firstNs].current!;
          return refGroup as unknown as Group;
        });
      return bodies;
    }
  },
  setGeometry: (id: string, geometry: THREE.BufferGeometry) => {
    set(
      produce((state) => {
        state.world[id].geometry = geometry;
      }),
    );
  },
  setValue: (id: string, namespace: string, value: RawValue) => {
    set(
      produce((state) => {
        const lookupId = getLookup(namespace, id);
        state.values.set(lookupId, value);
      }),
    );
  },
  setWorldElementName: (id: string, value: string) => {
    set(
      produce((state) => {
        state.world[id].name = value;
      }),
    );
  },
  setParent: (id: string, parent: string) => {
    set(
      produce((state) => {
        state.world[id].parent = parent;
      }),
    );
  },
  setChild: (id: string, child: string) => {
    set(
      produce((state) => {
        removeFromTree(state as VizijData, [child]);
        state.world[id].child = child;
      }),
    );
  },
  setChildren: (id: string, children: string[]) => {
    // Should only be setting bodies or shapes as children TODO Check
    set(
      produce((state) => {
        removeFromTree(state as VizijData, children);
        state.world[id].children = children;
      }),
    );
  },
  createGroup: (root: boolean) => {
    set(
      produce((state) => {
        createNewElement(state as VizijData, "group", root);
      }),
    );
  },
  setOrigin: (id: string, origin: { translation?: THREE.Vector3; rotation?: THREE.Vector3 }) => {
    const { translation, rotation } = origin;
    set(
      produce((state) => {
        if (!state.world[id].origin) {
          // state.world[id].origin = {};
        } else {
          if (rotation) state.world[id].origin.rotation = rotation;
          if (translation) state.world[id].origin.translation = translation;
        }
      }),
    );
  },
  setAxis: (id: string, axis: THREE.Vector3) => {
    set(
      produce((state) => {
        state.world[id].axis = axis;
      }),
    );
  },
  setTags: (id: string, tags: string[]) => {
    set(
      produce((state) => {
        state.world[id].tags = tags;
      }),
    );
  },
  setMaterial: (id: string, material: string) => {
    set(
      produce((state) => {
        state.world[id].material = material;
      }),
    );
  },
  setStaticFeature: (id: string, feature: RenderableFeature, value: RawValue) => {
    set(
      produce((state: VizijData) => {
        if (!state.world[id].features) {
          // state.world[id].features = {};
        }
        const entry = state.world[id];
        switch (entry.type) {
          case "group":
            (entry.features[feature as BodyFeature] as StaticFeature).value = value;
            state.world[id] = entry;
            break;
          default:
            break;
        }
      }),
    );
  },
  createAnimatable: (elementId: string, featureName: string, value: Partial<AnimatableValue>) => {
    set(
      produce((state) => {
        console.log("Creating animatable", elementId, featureName, value);
        const animatable = createAnimatable(value);
        if (!animatable) {
          return;
        }
        console.log("Created animatable", animatable);
        state.world[elementId].features[featureName] = {
          animated: true,
          value: animatable.id,
        };
        state.animatables[animatable.id] = animatable;
      }),
    );
  },
  createStatic: (elementId: string, featureName: string, value: RawValue) => {
    set(
      produce((state) => {
        state.world[elementId].features[featureName] = {
          animated: false,
          value,
        };
      }),
    );
  },
  setAnimatableValue: (id: string, value: AnimatableValue) => {
    set(
      produce((state) => {
        console.log("Setting animatable value", id, value);
        state.animatables[id] = value;
      }),
    );
  },
  setVizij: (scene: World, animatables: Record<string, AnimatableValue>) => {
    set({
      world: scene,
      animatables,
    });
  },
  select: (id: string | null) => set({ selection: id }),
  deselect: () => set({ selection: null }),
  setDragLock: (lock: string | null) => set({ dragLock: lock }),
  addWorldElements(world: World, animatables: Record<string, AnimatableValue>, replace?: boolean) {
    if (replace) {
      set({ world, animatables });
    } else {
      set((state) => ({
        world: { ...state.world, ...world },
        animatables: { ...state.animatables, ...animatables },
      }));
    }
  },
  setPreferences: (preferences: Partial<VizijData["preferences"]>) => {
    set((state) => ({
      preferences: { ...state.preferences, ...preferences },
    }));
  },
  setReference: (id: string, namespace: string, ref: RefObject<Group | Mesh>) => {
    set(
      produce((state: VizijData) => {
        switch (state.world[id].type) {
          case "ellipse":
            (state.world[id].refs[namespace] as MutableRefObject<Mesh>).current =
              ref.current as Mesh;
            break;
          case "rectangle":
            (state.world[id].refs[namespace] as MutableRefObject<Mesh>).current =
              ref.current as Mesh;
            break;
          case "group":
            (state.world[id].refs[namespace] as MutableRefObject<Group>).current =
              ref.current as Group;
            break;
        }
      }),
    );
  },
});

export const useDefaultVizijStore = create<VizijData & VizijActions>()(
  subscribeWithSelector((set, get) => ({
    ...VizijSlice(set, get),
  })),
);

export const createVizijStore = (initial?: Partial<VizijData & VizijActions>) =>
  create<VizijData & VizijActions>()(
    subscribeWithSelector((set, get) => ({
      ...VizijSlice(set, get),
      ...(initial ?? {}),
    })),
  );

export type VizijStore = typeof useDefaultVizijStore;
