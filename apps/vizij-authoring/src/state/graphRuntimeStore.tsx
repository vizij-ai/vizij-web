import { createContext, useContext, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type {
  BuildGraphResult,
  MachineReport,
} from "@vizij/node-graph-authoring";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { PoseRigConfig } from "@vizij/studio-support";
import type { VizijStoreSetter, World } from "@vizij/render";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import {
  parseAuthoringPreviewTarget,
  resolveAuthoringCompileTargetState,
  resolveAuthoringRuntimeErrorStates,
  type AuthoringRuntimeErrorSourceLike,
  type AuthoringPreviewCompileState,
  type AuthoringPreviewCompileStatus,
  type AuthoringPreviewTarget,
} from "@vizij/studio-support";
import type { PersistedGraphInsight } from "../rig/persistence";
import type {
  DiscrepancyResolutionResult,
  DiscrepancyReviewState,
} from "../types/discrepancy";

type GraphStatus = "idle" | "loading" | "ready" | "error";
type GraphPlaybackState = "playing" | "paused";

export interface AuthoringCompileTargetState {
  status: AuthoringPreviewCompileStatus;
  message: string | null;
  signature: string | null;
}

export type AuthoringCompileTargetStates = Record<
  AuthoringPreviewTarget,
  AuthoringCompileTargetState
>;

export const AUTHORING_COMPILE_TARGETS: readonly AuthoringPreviewTarget[] = [
  "runtime-graph",
  "animation",
  "motiongraph",
];

const AUTHORING_COMPILE_STATUS_RANK = {
  "runtime-error": 5,
  dirty: 4,
  compiling: 3,
  compiled: 2,
  registered: 1,
  idle: 0,
} as const satisfies Record<AuthoringPreviewCompileStatus, number>;

export interface VisibleAuthoringCompileState
  extends AuthoringCompileTargetState {
  target: AuthoringPreviewTarget | null;
}

export interface RuntimeBundleAcknowledgementLike {
  source: {
    key?: string | null;
    signature?: string | null;
  };
  graphCount: number;
}

export interface GraphRuntimeState {
  faceId: string;
  faceSegment: string;
  faceRenameToken: string | null;
  graphStatus: GraphStatus;
  graphError: string | null;
  graphWarning?: string | null;
  authoringCompileStatus: AuthoringPreviewCompileStatus;
  authoringCompileTarget: AuthoringPreviewTarget | null;
  authoringCompileMessage: string | null;
  authoringCompileSignature: string | null;
  authoringCompileTargets: AuthoringCompileTargetStates;
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

const defaultAuthoringCompileTargetState: AuthoringCompileTargetState = {
  status: "idle",
  message: null,
  signature: null,
};

export function createAuthoringCompileTargets(
  state: AuthoringCompileTargetState = defaultAuthoringCompileTargetState,
): AuthoringCompileTargetStates {
  return {
    "runtime-graph": { ...state },
    animation: { ...state },
    motiongraph: { ...state },
  };
}

export function applyAuthoringCompileState(
  graphRuntimeStore: GraphRuntimeStore,
  state: AuthoringPreviewCompileState,
) {
  graphRuntimeStore.setState({
    authoringCompileStatus: state.status,
    authoringCompileTarget: state.target,
    authoringCompileMessage: state.message ?? null,
    authoringCompileSignature: state.signature ?? null,
  });
}

export function resolveVisibleAuthoringCompileState(params: {
  authoringCompileTarget: AuthoringPreviewTarget | null;
  authoringCompileTargets: AuthoringCompileTargetStates;
}): VisibleAuthoringCompileState {
  const rankedTarget = [...AUTHORING_COMPILE_TARGETS].sort((left, right) => {
    const leftStatus = params.authoringCompileTargets[left]?.status ?? "idle";
    const rightStatus = params.authoringCompileTargets[right]?.status ?? "idle";
    const leftRank = AUTHORING_COMPILE_STATUS_RANK[leftStatus];
    const rightRank = AUTHORING_COMPILE_STATUS_RANK[rightStatus];

    if (leftRank !== rightRank) {
      return rightRank - leftRank;
    }

    if (params.authoringCompileTarget) {
      if (
        left === params.authoringCompileTarget &&
        right !== params.authoringCompileTarget
      ) {
        return -1;
      }
      if (
        right === params.authoringCompileTarget &&
        left !== params.authoringCompileTarget
      ) {
        return 1;
      }
    }

    return (
      AUTHORING_COMPILE_TARGETS.indexOf(left) -
      AUTHORING_COMPILE_TARGETS.indexOf(right)
    );
  })[0];
  const rankedState = rankedTarget
    ? params.authoringCompileTargets[rankedTarget]
    : null;

  if (!rankedTarget || !rankedState || rankedState.status === "idle") {
    return {
      target: null,
      status: "idle",
      message: null,
      signature: null,
    };
  }

  return {
    target: rankedTarget,
    ...rankedState,
  };
}

export function resolveRuntimeBundleAcknowledgementPatch(
  state: GraphRuntimeState,
  event: RuntimeBundleAcknowledgementLike,
): Partial<GraphRuntimeState> {
  const target = parseAuthoringPreviewTarget(event.source.key);
  const signature = event.source.signature ?? null;
  const baseUpdate = {
    runtimeViewGraphCount: event.graphCount,
  };
  if (!target) {
    return baseUpdate;
  }

  const targetState = state.authoringCompileTargets[target];
  const targetMatches =
    targetState?.signature === signature &&
    (targetState.status === "compiled" || targetState.status === "compiling");
  if (!targetMatches) {
    return baseUpdate;
  }

  const globalMatches =
    state.authoringCompileTarget === target &&
    state.authoringCompileSignature === signature &&
    (state.authoringCompileStatus === "compiled" ||
      state.authoringCompileStatus === "compiling");
  if (globalMatches) {
    return {
      ...baseUpdate,
      authoringCompileStatus: "registered",
      authoringCompileTarget: target,
      authoringCompileMessage: null,
      authoringCompileSignature: signature,
    };
  }

  return {
    ...baseUpdate,
    authoringCompileTargets: {
      ...state.authoringCompileTargets,
      [target]: {
        status: "registered",
        message: null,
        signature,
      },
    },
  };
}

export function resolveRuntimeErrorCompilePatch(
  state: GraphRuntimeState,
  error: {
    message: string;
    sources?: readonly AuthoringRuntimeErrorSourceLike[] | null;
  },
): Partial<GraphRuntimeState> | undefined {
  const errorStates = resolveAuthoringRuntimeErrorStates({
    sources: error.sources,
    fallbackTarget: state.authoringCompileTarget,
    fallbackSignature: state.authoringCompileSignature,
    message: error.message,
  });
  if (errorStates.length === 0) {
    return undefined;
  }

  const nextTargets = { ...state.authoringCompileTargets };
  errorStates.forEach((errorState) => {
    nextTargets[errorState.target] = {
      status: errorState.status,
      message: errorState.message ?? null,
      signature: errorState.signature ?? null,
    };
  });
  const activeError =
    errorStates.find(
      (errorState) => errorState.target === state.authoringCompileTarget,
    ) ?? errorStates[0];

  return {
    authoringCompileStatus: activeError.status,
    authoringCompileTarget: activeError.target,
    authoringCompileMessage: activeError.message ?? null,
    authoringCompileSignature: activeError.signature ?? null,
    authoringCompileTargets: nextTargets,
  };
}

const defaultGraphRuntimeState: GraphRuntimeState = {
  faceId: "robot",
  faceSegment: "robot",
  faceRenameToken: null,
  graphStatus: "idle",
  graphError: null,
  graphWarning: null,
  authoringCompileStatus: "idle",
  authoringCompileTarget: null,
  authoringCompileMessage: null,
  authoringCompileSignature: null,
  authoringCompileTargets: createAuthoringCompileTargets(),
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
    authoringCompileTargets: createAuthoringCompileTargets(),
    ...(initialState ?? {}),
  };
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState = (updater: GraphRuntimeStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const resolvedPatch =
      patch.authoringCompileTarget &&
      patch.authoringCompileStatus &&
      !patch.authoringCompileTargets
        ? (() => {
            const targetState = resolveAuthoringCompileTargetState({
              current:
                state.authoringCompileTargets[patch.authoringCompileTarget],
              status: patch.authoringCompileStatus,
              message: patch.authoringCompileMessage ?? null,
              signature: patch.authoringCompileSignature ?? null,
            });
            return {
              ...patch,
              authoringCompileStatus: targetState.status,
              authoringCompileMessage: targetState.message ?? null,
              authoringCompileSignature: targetState.signature ?? null,
              authoringCompileTargets: {
                ...state.authoringCompileTargets,
                [patch.authoringCompileTarget]: {
                  status: targetState.status,
                  message: targetState.message ?? null,
                  signature: targetState.signature ?? null,
                },
              },
            };
          })()
        : patch;
    const nextState = { ...state, ...resolvedPatch } as GraphRuntimeState;

    // Check if any value actually changed
    const hasChanged = Object.keys(resolvedPatch).some(
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
