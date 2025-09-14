/**
 * @fileoverview
 * Experimental store for handling rapidly-changing realtime data.
 * This is a first attempt to improve performance by separating realtime data
 * from the main application store.
 *
 * @remarks
 * Not currently in use. Requires synchronization with the main store
 * to handle events like setting values from controls.
 */

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

/**
 * Core data structure for realtime values
 */
export interface RealtimeData {
  /** Map of lookupId to raw values */
  values: Map<string, RawValue>;
}

/**
 * Actions available for manipulating realtime data
 */
export interface RealtimeActions {
  /**
   * Sets a value in the realtime store
   * @param id - The identifier for the value
   * @param namespace - The namespace the value belongs to
   * @param value - The raw value to store
   */
  setValue: (id: string, namespace: string, value: RawValue) => void;
}

export type RealtimeStoreSetter = (
  partial:
    | (RealtimeData & RealtimeActions)
    | Partial<RealtimeData & RealtimeActions>
    | ((
        state: RealtimeData & RealtimeActions,
      ) =>
        | (RealtimeData & RealtimeActions)
        | Partial<RealtimeData & RealtimeActions>),
  replace?: false | undefined,
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
