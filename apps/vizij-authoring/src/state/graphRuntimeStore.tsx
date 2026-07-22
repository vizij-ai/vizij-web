import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type {
  BuildGraphResult,
  MachineReport,
} from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph";
import type { PoseRigConfig } from "@vizij/runtime-react";
import type { VizijStoreSetter, World } from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import type { PersistedGraphInsight } from "../rig/persistence";
import type {
  DiscrepancyResolutionResult,
  DiscrepancyReviewState,
} from "../types/discrepancy";

type GraphStatus = "idle" | "loading" | "ready" | "error";
type GraphPlaybackState = "playing" | "paused";

export interface GraphRuntimeState {
  faceId: string;
  faceSegment: string;
  faceRenameToken: string | null;
  graphStatus: GraphStatus;
  graphError: string | null;
  graphWarning?: string | null;
  graphSpec?: GraphSpec | null;
  poseGraphSpec?: GraphSpec | null;
  poseConfig?: PoseRigConfig | null;
  graphInputDefaults: Record<string, number>;
  world: World;
  animatables: Record<string, AnimatableValue>;
  values: Map<string, RawValue | undefined>;
  graphTimeSeconds: number;
  graphPlaybackState: GraphPlaybackState;
  graphPlaybackAvailable: boolean;
  graphFrameRate: number;
  graphInsights: PersistedGraphInsight | null;
  graphMachineReport: MachineReport | null;
  discrepancyReview: DiscrepancyReviewState | null;
  handleFaceIdChange: (value: string) => void;
  playGraph: () => void;
  pauseGraph: () => void;
  stopGraph: () => void;
  stepGraph: () => void;
  resolveDiscrepancyReview: (result: DiscrepancyResolutionResult) => void;
  getGraphIr: () => BuildGraphResult["ir"] | null;
  handleImportGraphSpec: (
    spec: GraphSpec,
    options?: {
      skipDiscrepancyCheck?: boolean;
      faceIdHint?: string;
      poseConfigHint?: PoseRigConfig | null;
    },
  ) => Promise<{ faceChanged: boolean; importedFaceId: string | null }>;
  setStoreState: VizijStoreSetter;
  setGraphPlaybackState: (state: GraphPlaybackState) => void;
  stageRuntimeInput?: (graphPath: string, value: number) => void;
  animateRuntimeValue?: (
    graphPath: string,
    value: number,
    duration: number,
  ) => void;
  runtimeViewReady: boolean;
  runtimeViewLoading: boolean;
  runtimeViewRootId: string | null;
  runtimeViewGraphCount: number;
  runtimeViewOutputCount: number;
}

type GraphRuntimeStoreUpdate =
  | Partial<GraphRuntimeState>
  | ((state: GraphRuntimeState) => Partial<GraphRuntimeState> | void);

export interface GraphRuntimeStore {
  getState: () => GraphRuntimeState;
  setState: (updater: GraphRuntimeStoreUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

const noop = () => undefined;

const defaultGraphRuntimeState: GraphRuntimeState = {
  faceId: "robot",
  faceSegment: "robot",
  faceRenameToken: null,
  graphStatus: "idle",
  graphError: null,
  graphWarning: null,
  graphSpec: null,
  poseGraphSpec: null,
  poseConfig: null,
  graphInputDefaults: {},
  world: {} as World,
  animatables: {} as Record<string, AnimatableValue>,
  values: new Map(),
  graphTimeSeconds: 0,
  graphPlaybackState: "paused",
  graphPlaybackAvailable: false,
  graphFrameRate: 0,
  graphInsights: null,
  graphMachineReport: null,
  discrepancyReview: null,
  handleFaceIdChange: noop,
  playGraph: noop,
  pauseGraph: noop,
  stopGraph: noop,
  stepGraph: noop,
  resolveDiscrepancyReview: noop,
  getGraphIr: () => null,
  handleImportGraphSpec: async () => ({
    faceChanged: false,
    importedFaceId: null,
  }),
  setStoreState: (() => undefined) as unknown as VizijStoreSetter,
  setGraphPlaybackState: noop,
  stageRuntimeInput: undefined,
  animateRuntimeValue: undefined,
  runtimeViewReady: false,
  runtimeViewLoading: false,
  runtimeViewRootId: null,
  runtimeViewGraphCount: 0,
  runtimeViewOutputCount: 0,
};

export function createGraphRuntimeStore(
  initialState?: Partial<GraphRuntimeState>,
): GraphRuntimeStore {
  let state: GraphRuntimeState = {
    ...defaultGraphRuntimeState,
    ...(initialState ?? {}),
  };
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState = (updater: GraphRuntimeStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const nextState = { ...state, ...patch } as GraphRuntimeState;

    // Check if any value actually changed
    const hasChanged = Object.keys(patch).some(
      (key) => (state as any)[key] !== (nextState as any)[key],
    );

    if (!hasChanged) {
      return;
    }
    state = nextState;
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

const GraphRuntimeStoreContext = createContext<GraphRuntimeStore | null>(null);

interface GraphRuntimeStoreProviderProps {
  store: GraphRuntimeStore;
  children: ReactNode;
}

export function GraphRuntimeStoreProvider({
  store,
  children,
}: GraphRuntimeStoreProviderProps) {
  return (
    <GraphRuntimeStoreContext.Provider value={store}>
      {children}
    </GraphRuntimeStoreContext.Provider>
  );
}

export function useGraphRuntimeStoreApi(): GraphRuntimeStore {
  const store = useContext(GraphRuntimeStoreContext);
  if (!store) {
    throw new Error(
      "GraphRuntimeStoreProvider is missing. Wrap components with RigControllerProvider.",
    );
  }
  return store;
}

export function useGraphRuntimeStore<T>(
  selector: (state: GraphRuntimeState) => T,
  equalityFn: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useGraphRuntimeStoreApi();
  const lastValueRef = useRef<T | undefined>(undefined);
  const subscribe = store.subscribe;
  const getSnapshot = () => selector(store.getState());
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const previous = lastValueRef.current;
  if (previous !== undefined && equalityFn(previous, value)) {
    return previous;
  }
  lastValueRef.current = value;
  return value;
}
