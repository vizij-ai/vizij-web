import { cloneRawValue, getLookup } from "@vizij/utils";
import type { RawValue, AnimatableValue } from "@vizij/utils";
import type { VizijStoreSetter, VizijData } from "@vizij/render";
import { DEFAULT_NAMESPACE } from "../utils/constants";
import {
  buildDefaultAnimatable,
  isAnimatableReferencedElsewhere,
} from "../components/binding";
import type { FeatureEntry } from "./featureEntries";

function updateAnimatableDescriptor(
  setStoreState: VizijStoreSetter,
  animatableId: string,
  updater: (current: AnimatableValue) => AnimatableValue,
  options?: { newDefault?: RawValue },
) {
  setStoreState((state: VizijData) => {
    const current = state.animatables[animatableId];
    if (!current) {
      return state;
    }
    const updated = updater(current);
    if (updated === current) {
      return state;
    }
    const partial: Partial<VizijData> = {
      animatables: {
        ...state.animatables,
        [animatableId]: updated,
      },
    };
    if (options?.newDefault !== undefined) {
      const nextValues = new Map(state.values);
      nextValues.set(
        getLookup(DEFAULT_NAMESPACE, animatableId),
        options.newDefault,
      );
      partial.values = nextValues;
    }
    return { ...state, ...partial };
  });
}

function updateStaticFeature(
  setStoreState: VizijStoreSetter,
  entry: FeatureEntry,
  nextValue: RawValue,
) {
  setStoreState((state: VizijData) => {
    const renderable = state.world[entry.elementId];
    if (!renderable) {
      return state;
    }
    const nextFeatures = {
      ...renderable.features,
      [entry.featureKey]: {
        animated: false,
        value: nextValue,
      },
    };
    return {
      ...state,
      world: {
        ...state.world,
        [entry.elementId]: {
          ...renderable,
          features: nextFeatures,
        },
      },
    } as VizijData;
  });
}

function convertToAnimated(
  setStoreState: VizijStoreSetter,
  entry: FeatureEntry,
  baseValue: RawValue,
) {
  const descriptor = buildDefaultAnimatable(entry, baseValue);
  if (!descriptor) {
    return;
  }
  setStoreState((state: VizijData) => {
    const renderable = state.world[entry.elementId];
    if (!renderable) {
      return state;
    }
    const nextAnimatables = {
      ...state.animatables,
      [descriptor.id]: descriptor,
    };
    const nextFeatures = {
      ...renderable.features,
      [entry.featureKey]: {
        animated: true,
        value: descriptor.id,
      },
    };
    const nextValues = new Map(state.values);
    nextValues.set(
      getLookup(DEFAULT_NAMESPACE, descriptor.id),
      cloneRawValue(descriptor.default as RawValue),
    );
    return {
      ...state,
      animatables: nextAnimatables,
      values: nextValues,
      world: {
        ...state.world,
        [entry.elementId]: {
          ...renderable,
          features: nextFeatures,
        },
      },
    } as VizijData;
  });
}

function convertToStatic(setStoreState: VizijStoreSetter, entry: FeatureEntry) {
  if (!entry.descriptor || !entry.animatableId) {
    return;
  }
  const animatableId = entry.animatableId;
  const defaultValue = cloneRawValue(entry.descriptor.default as RawValue);
  setStoreState((state: VizijData) => {
    const renderable = state.world[entry.elementId];
    if (!renderable) {
      return state;
    }
    const nextAnimatables = { ...state.animatables };
    const nextFeatures = {
      ...renderable.features,
      [entry.featureKey]: {
        animated: false,
        value: defaultValue,
      },
    };
    const nextValues = new Map(state.values);
    const stillUsed = isAnimatableReferencedElsewhere(
      state.world as any,
      entry.elementId,
      entry.featureKey,
      animatableId,
    );
    if (!stillUsed) {
      delete nextAnimatables[animatableId];
      nextValues.delete(getLookup(DEFAULT_NAMESPACE, animatableId));
    }
    return {
      ...state,
      animatables: nextAnimatables,
      values: nextValues,
      world: {
        ...state.world,
        [entry.elementId]: {
          ...renderable,
          features: nextFeatures,
        },
      },
    } as VizijData;
  });
}

export function createFeatureMutations(setStoreState: VizijStoreSetter) {
  const toggleFeatureAnimation = (
    entry: FeatureEntry,
    makeAnimated: boolean,
  ) => {
    if (makeAnimated) {
      const base =
        entry.staticValue ??
        (entry.descriptor?.default as RawValue | undefined) ??
        0;
      convertToAnimated(setStoreState, entry, cloneRawValue(base));
    } else {
      convertToStatic(setStoreState, entry);
    }
  };

  const updateAnimatableDefault = (entry: FeatureEntry, value: RawValue) => {
    if (!entry.animatableId || !entry.descriptor) {
      return;
    }
    updateAnimatableDescriptor(
      setStoreState,
      entry.animatableId,
      (current) => ({
        ...current,
        default: value as never,
      }),
      { newDefault: value },
    );
  };

  return {
    toggleFeatureAnimation,
    updateStaticFeature: (entry: FeatureEntry, value: RawValue) =>
      updateStaticFeature(setStoreState, entry, value),
    updateAnimatableDefault,
    updateAnimatableDescriptor: (
      animatableId: string,
      updater: (current: AnimatableValue) => AnimatableValue,
      options?: { newDefault?: RawValue },
    ) =>
      updateAnimatableDescriptor(setStoreState, animatableId, updater, options),
  };
}
