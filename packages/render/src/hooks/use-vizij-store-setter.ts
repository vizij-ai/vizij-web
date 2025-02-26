import { useContext } from "react";
import { VizijContext } from "../context";

/*
  @name useVizijStoreSetter
  @description A hook used to access the store's setState method. Must be used within a VizijProvider.
*/
export function useVizijStoreSetter() {
  const store = useContext(VizijContext);
  if (!store) throw new Error("Missing VizijProvider in the tree");
  return store.setState;
}
