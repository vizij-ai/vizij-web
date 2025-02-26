import { useContext, useEffect } from "react";
import type { VizijData, VizijActions } from "../store-types";
import { VizijContext } from "../context";

/*
  @name useVizijStoreSubscription
  @description A hook used to subscribe to changes in the store. Must be used within a VizijProvider.

  @param selector A function that takes the store and returns the value you want to access.
  @param listener A function that is called when the value returned by the selector changes.
*/
export function useVizijStoreSubscription<T>(
  selector: (state: VizijData & VizijActions) => T,
  listener: (state: T) => void,
): void {
  const store = useContext(VizijContext);
  if (!store) throw new Error("Missing VizijProvider in the tree");
  useEffect(() => {
    // Get the initial value
    const initialValue = selector(store.getState());
    // Call the listener with the initial value
    listener(initialValue);
    // returns the unsubscribe function
    return store.subscribe(selector, listener);
  }, [store, selector, listener]);
}
