import type { MutableRefObject, RefObject } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { produce, enableMapSet } from "immer";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Group, Mesh } from "three";
import { type RawValue, type AnimatableValue, getLookup } from "@vizij/utils";
import type { World } from "./types/world";
import { createNewElement } from "./actions/create-new-element";
import { removeFromTree } from "./actions/remove-children";
import type {
  VizijData,
  VizijActions,
  VizijStoreGetter,
  VizijStoreSetter,
} from "./store-types";
import { recordRenderCounter } from "./memoryInvestigation";
import { createAnimatable } from "./functions/create-animatable";
import { selectExportableGroupEntries } from "./functions/exportable-bodies";
import type { RenderableFeature } from "./types/renderable-feature";
import type { StaticFeature, GroupFeature, Selection } from "./types";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
enableMapSet();

export const VizijSlice = (set: VizijStoreSetter, get: VizijStoreGetter) => ({
  // worldRef: createRef<THREE.Group>(),
  world: {},
  animatables: {},
  values: new Map(),
  renderHit: false,
  preferences: {
    damping: false,
  },
  elementSelection: [],
  hoveredElement: null,
  slotConfig: {},
  clearSelection: () => {
    set({ elementSelection: [] });
  },
  updateElementSelection: (selection: Selection, _chain: string[]) => {
    set(
      produce((state: VizijData) => {
        state.elementSelection = [selection];
      }),
    );
  },
  setHoveredElement: (selection: Selection | null) => {
    set({ hoveredElement: selection });
  },
  onElementClick: (
    selection: Selection,
    _chain: string[],
    event: ThreeEvent<ReactMouseEvent>,
  ) => {
    event.stopPropagation();

    const makeKey = (sel: Selection) =>
      `${sel.namespace}__${sel.type}__${sel.id}`;

    const stack: Selection[] = [];
    const seen = new Set<string>();
    const push = (sel: Selection | undefined) => {
      if (!sel) return;
      if (!sel.id || !sel.namespace || !sel.type) return;
      const key = makeKey(sel);
      if (seen.has(key)) return;
      seen.add(key);
      stack.push(sel);
    };

    const intersections = (event.intersections ?? []) as Array<{
      object: THREE.Object3D & { userData?: Record<string, unknown> };
    }>;

    intersections.forEach((hit) => {
      const hitSelection = hit.object?.userData?.selection as
        | Selection
        | undefined;
      push(hitSelection);
    });

    if (stack.length === 0) {
      push(selection);
    }

    const stackKeys = new Set(stack.map(makeKey));
    const primary = stack[0];
    const primaryKey = makeKey(primary);

    set(
      produce((state: VizijData) => {
        if (event.metaKey) {
          const existing = state.elementSelection ?? [];
          const alreadySelected = existing.some(
            (item) => makeKey(item) === primaryKey,
          );

          const existingWithoutStack = existing.filter(
            (item) => !stackKeys.has(makeKey(item)),
          );

          if (alreadySelected) {
            state.elementSelection = existingWithoutStack;
          } else {
            state.elementSelection = [...stack, ...existingWithoutStack];
          }
        } else {
          state.elementSelection = stack;
        }
      }),
    );
  },
  getExportableBodies: (filterIds?: string[]) => {
    const worldData = get().world as World;
    const candidateGroups = selectExportableGroupEntries(
      worldData as Record<
        string,
        {
          id: string;
          type: string;
          parent?: string | null;
          root?: boolean;
          rootBounds?: unknown;
        }
      >,
      filterIds,
    );
    return candidateGroups.flatMap((entry) => {
      const refs = Object.values(
        (
          entry as {
            refs?: Record<string, { current?: Group | null }>;
          }
        ).refs ?? {},
      );
      const resolved = refs.find((ref) => ref?.current)?.current ?? null;
      return resolved ? [resolved] : [];
    });
  },
  setGeometry: (id: string, geometry: THREE.BufferGeometry) => {
    set(
      produce((state) => {
        state.world[id].geometry = geometry;
      }),
    );
  },
  setValue: (
    id: string,
    namespace: string,
    value: RawValue | ((current: RawValue | undefined) => RawValue | undefined),
  ) => {
    set(
      produce((state: VizijData) => {
        const lookupId = getLookup(namespace, id);
        if (typeof value === "function") {
          const current: RawValue | undefined = state.values.get(lookupId);
          if (current !== undefined) {
            if (value(current !== undefined)) {
              state.values.set(lookupId, value(current));
            }
          } else {
            const animatableLookup = state.animatables[id];
            const updatedValue = value(
              animatableLookup !== undefined
                ? animatableLookup.default
                : undefined,
            );
            if (updatedValue !== undefined) {
              state.values.set(lookupId, updatedValue);
            }
          }
        } else {
          state.values.set(lookupId, value);
        }
      }),
    );
  },
  setValues: (
    writes: Array<{
      id: string;
      namespace: string;
      value: RawValue;
    }> = [],
  ) => {
    if (writes.length === 0) {
      return;
    }
    set(
      produce((state: VizijData) => {
        writes.forEach(({ id, namespace, value }) => {
          const lookupId = getLookup(namespace, id);
          state.values.set(lookupId, value);
        });
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
  setOrigin: (
    id: string,
    origin: { translation?: THREE.Vector3; rotation?: THREE.Vector3 },
  ) => {
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
  setStaticFeature: (
    id: string,
    feature: RenderableFeature,
    value: RawValue,
  ) => {
    set(
      produce((state: VizijData) => {
        if (!state.world[id].features) {
          // state.world[id].features = {};
        }
        const entry = state.world[id];
        switch (entry.type) {
          case "group":
            (entry.features[feature as GroupFeature] as StaticFeature).value =
              value;
            state.world[id] = entry;
            break;
          default:
            break;
        }
      }),
    );
  },
  createAnimatable: (
    elementId: string,
    featureName: string,
    value: Partial<AnimatableValue>,
  ) => {
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
  setSlot: (
    parentId: string,
    parentNamespace: string,
    childId: string,
    childNamespace: string,
  ) => {
    set(
      produce((state) => {
        const parentLookupId = getLookup(parentNamespace, parentId);
        const childLookupId = getLookup(childNamespace, childId);
        state.slotConfig[parentLookupId] = childLookupId;
      }),
    );
  },
  setSlots: (slots: Record<string, string>, replace?: boolean) => {
    set(
      produce((state) => {
        if (replace) {
          state.slotConfig = slots;
        } else {
          state.slotConfig = { ...state.slotConfig, ...slots };
        }
      }),
    );
  },
  clearSlot: (parentId: string, parentNamespace: string) => {
    set(
      produce((state) => {
        const parentLookupId = getLookup(parentNamespace, parentId);
        delete state.slotConfig[parentLookupId];
      }),
    );
  },
  setVizij: (scene: World, animatables: Record<string, AnimatableValue>) => {
    recordRenderCounter("rootReplacementCount");
    set({
      world: scene,
      animatables,
    });
  },
  addWorldElements(
    world: World,
    animatables: Record<string, AnimatableValue>,
    replace?: boolean,
  ) {
    if (replace) {
      recordRenderCounter("rootReplacementCount");
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
  setReference: (
    id: string,
    namespace: string,
    ref: RefObject<Group | Mesh>,
  ) => {
    set(
      produce((state: VizijData) => {
        (state.world[id].refs[namespace] as MutableRefObject<Group>).current =
          ref.current as Group;
        if (ref.current?.children && state.world[id].refs[namespace].current) {
          state.world[id].refs[namespace].current.children =
            ref.current.children;
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
