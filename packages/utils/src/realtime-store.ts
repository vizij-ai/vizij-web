import { createContext } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { enableMapSet, produce } from "immer";
import * as THREE from "three";
import { RawValue } from "./animated-values";
import { getLookup } from "./namespace";

/* This code is not currently used, but it is a first attempt to move the rapidly-changing
 * realtime data into a separate store to improve performance. Synchronizing this store with
 * the main store would have to be done to handle events like setting a value from a control.
 */

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
enableMapSet();

export interface RealtimeData {
  values: Map<string, RawValue>;
}

export interface RealtimeActions {
  setValue: (id: string, namespace: string, value: RawValue) => void;
}

export type RealtimeStoreSetter = (
  partial:
    | (RealtimeData & RealtimeActions)
    | Partial<RealtimeData & RealtimeActions>
    | ((
        state: RealtimeData & RealtimeActions,
      ) => (RealtimeData & RealtimeActions) | Partial<RealtimeData & RealtimeActions>),
  replace?: boolean | undefined,
) => void;

export type RealtimeStoreGetter = () => RealtimeData & RealtimeActions;

export const RealtimeSlice = (set: RealtimeStoreSetter) => ({
  values: new Map<string, RawValue>(),
  setValue: (id: string, namespace: string, value: RawValue) => {
    set(
      produce((state: RealtimeData) => {
        const lookupId = getLookup(id, namespace);
        state.values.set(lookupId, value);
      }),
    );
  },
});

export const useRealtimeStore = create<RealtimeData & RealtimeActions>()(
  subscribeWithSelector(RealtimeSlice),
);

export type RealtimeStore = typeof useRealtimeStore;

// This creates a context where the single app store is stored.
export const RealtimeContext = createContext<RealtimeStore | null>(null);
