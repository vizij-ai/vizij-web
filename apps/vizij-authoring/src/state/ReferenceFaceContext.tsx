import { createContext, useContext, type ReactNode } from "react";
import type { InputBindingMap } from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import type { VizijBundleExtension } from "@vizij/render";

export interface ReferenceFacePose {
  id: string;
  name: string;
  description?: string;
  group?: string | null;
  groupId?: string | null;
  groupIds?: string[];
  values: Record<string, number>;
}

export interface ReferenceFacePoseGroup {
  id: string;
  path: string;
  name: string;
  blendMode?: "average" | "additive";
}

export interface ReferenceFaceState {
  /** The reference face file loaded */
  file: File | null;
  /** Set the reference face file */
  setFile: (file: File | null) => void;
  /** Whether the reference face is loaded */
  isLoaded: boolean;
  /** Whether the reference face is currently loading */
  isLoading: boolean;
  /** Standard inputs available in the reference face's rig */
  standardInputs: StandardRigInput[];
  /** Map of input ID to StandardRigInput for quick lookup */
  standardInputsById: Map<string, StandardRigInput>;
  /** Set of input IDs that have bindings (connections to other nodes) */
  inputIdsWithBindings: Set<string>;
  /** Current input values */
  inputValues: Record<string, number>;
  /** Parsed pose definitions extracted from the reference bundle (if present). */
  referencePoses: ReferenceFacePose[];
  /** Parsed pose groups extracted from the reference bundle (if present). */
  referencePoseGroups: ReferenceFacePoseGroup[];
  /** Parent/input binding definitions parsed from the reference rig graph metadata. */
  referenceInputBindings: InputBindingMap;
  /** Reference input ID -> normalized path map from rig graph metadata. */
  referenceInputPathById: Record<string, string>;
  /** Handler to change an input value */
  handleInputValueChange: (inputId: string, value: number) => void;
  /** Handler to reset all input values to defaults */
  handleResetAllInputValues: () => void;

  // Handlers to be passed to ReferenceFaceRuntime
  onStandardInputsReady: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
  onLoadingStateChange: (isLoading: boolean, isLoaded: boolean) => void;
  onAnimateValueReady: (
    animateValue: ((path: string, value: number) => void) | undefined,
  ) => void;
  onStandardInputChange: (inputId: string, value: number) => void;
  onBundleReady: (bundle: VizijBundleExtension | null) => void;
}

const defaultState: ReferenceFaceState = {
  file: null,
  setFile: () => {},
  isLoaded: false,
  isLoading: false,
  standardInputs: [],
  standardInputsById: new Map(),
  inputIdsWithBindings: new Set(),
  inputValues: {},
  referencePoses: [],
  referencePoseGroups: [],
  referenceInputBindings: {},
  referenceInputPathById: {},
  handleInputValueChange: () => {},
  handleResetAllInputValues: () => {},
  onStandardInputsReady: () => {},
  onLoadingStateChange: () => {},
  onAnimateValueReady: () => {},
  onStandardInputChange: () => {},
  onBundleReady: () => {},
};

const ReferenceFaceContext = createContext<ReferenceFaceState>(defaultState);

interface ReferenceFaceProviderProps {
  value: ReferenceFaceState;
  children: ReactNode;
}

export function ReferenceFaceProvider({
  value,
  children,
}: ReferenceFaceProviderProps) {
  return (
    <ReferenceFaceContext.Provider value={value}>
      {children}
    </ReferenceFaceContext.Provider>
  );
}

export function useReferenceFace(): ReferenceFaceState {
  return useContext(ReferenceFaceContext);
}
