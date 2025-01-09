import { useContext } from "react";
import { useStore } from "zustand";
import type { VizijData, VizijActions } from "../store-types";
import { VizijContext } from "../context";

/*
  @name useVizijStoreSubscription
  @description A hook used to access values in the store. Must be used within a VizijProvider. See the VizijData for the attributes and the VizijActions for the methods that can be accessed.

  @param selector A function that takes the store and returns the value you want to access.
*/
export function useVizijStore<T>(
  selector: (state: VizijData & VizijActions) => T,
): T {
  const store = useContext(VizijContext);
  if (!store) throw new Error("Missing VizijProvider in the tree");
  return useStore(store, selector);
}
