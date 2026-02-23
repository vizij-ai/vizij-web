import { useRef } from "react";
import type { ReactNode } from "react";
import type { FaceLoadPhaseUpdate } from "../hooks/useVizijAssetLoader";
import { useRigController } from "../hooks/useRigController";
import {
  createGraphRuntimeStore,
  GraphRuntimeStoreProvider,
  useGraphRuntimeStore,
  useGraphRuntimeStoreApi,
  type GraphRuntimeState,
  type GraphRuntimeStore,
} from "./graphRuntimeStore";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
  useBindingAuthoringStore,
  type BindingAuthoringState,
  type BindingAuthoringStore,
} from "./bindingAuthoringStore";
import {
  SelectionStoreProvider,
  createSelectionStore,
  useSelectionStoreValue,
  type SelectionState,
  type SelectionStore,
} from "./selectionStore";

interface RigControllerProviderProps {
  namespace: string;
  rootId: string | null;
  sourceName: string | null;
  onLoadPhaseChange?: (update: FaceLoadPhaseUpdate) => void;
  children: ReactNode;
}

export function useGraphRuntime<T = GraphRuntimeState>(
  selector?: (state: GraphRuntimeState) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const resolvedSelector = (selector ?? ((state) => state as T)) as (
    state: GraphRuntimeState,
  ) => T;
  return useGraphRuntimeStore(resolvedSelector, equalityFn);
}

export { useGraphRuntimeStoreApi };

export function useBindingAuthoring<T = BindingAuthoringState>(
  selector?: (state: BindingAuthoringState) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const resolvedSelector = (selector ?? ((state) => state as T)) as (
    state: BindingAuthoringState,
  ) => T;
  return useBindingAuthoringStore(resolvedSelector, equalityFn);
}

export function useSelectionStore<T = SelectionState>(
  selector?: (state: SelectionState) => T,
  equalityFn?: (a: T, b: T) => boolean,
): T {
  const resolvedSelector = (selector ?? ((state) => state as T)) as (
    state: SelectionState,
  ) => T;
  return useSelectionStoreValue(resolvedSelector, equalityFn);
}

export function RigControllerProvider({
  namespace,
  rootId,
  sourceName,
  onLoadPhaseChange,
  children,
}: RigControllerProviderProps) {
  const graphRuntimeStoreRef = useRef<GraphRuntimeStore | null>(null);
  if (!graphRuntimeStoreRef.current) {
    graphRuntimeStoreRef.current = createGraphRuntimeStore();
  }
  const graphRuntimeStore = graphRuntimeStoreRef.current;

  const bindingAuthoringStoreRef = useRef<BindingAuthoringStore | null>(null);
  if (!bindingAuthoringStoreRef.current) {
    bindingAuthoringStoreRef.current = createBindingAuthoringStore();
  }
  const bindingAuthoringStore = bindingAuthoringStoreRef.current;

  const selectionStoreRef = useRef<SelectionStore | null>(null);
  if (!selectionStoreRef.current) {
    selectionStoreRef.current = createSelectionStore();
  }
  const selectionStore = selectionStoreRef.current;

  useRigController(
    { namespace, rootId, sourceName, onLoadPhaseChange },
    {
      graphRuntimeStore,
      bindingAuthoringStore,
      selectionStore,
    },
  );

  return (
    <GraphRuntimeStoreProvider store={graphRuntimeStore}>
      <BindingAuthoringStoreProvider store={bindingAuthoringStore}>
        <SelectionStoreProvider store={selectionStore}>
          {children}
        </SelectionStoreProvider>
      </BindingAuthoringStoreProvider>
    </GraphRuntimeStoreProvider>
  );
}
