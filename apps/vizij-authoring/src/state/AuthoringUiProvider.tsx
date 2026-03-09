import { createContext, useContext, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import type { WorkbenchView } from "../components/app/workbenchConfig";

export interface AuthoringUiState {
  activeWorkbench: WorkbenchView;
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  activeRiggingTab: RiggingTab;
  skipDiscrepancyCheck: boolean;
  activeRuntimeSource: RuntimeAuthoringSource;
  activeEditFocus: EditFocus;
  rotationDisplayMode: RotationDisplayMode;
}

export type AuthoringUiAction =
  | { type: "set-workbench"; payload: WorkbenchView }
  | { type: "set-include-bundle"; payload: boolean }
  | { type: "set-include-animations"; payload: boolean }
  | { type: "set-rigging-tab"; payload: RiggingTab }
  | { type: "set-skip-discrepancy-check"; payload: boolean }
  | { type: "set-active-runtime-source"; payload: RuntimeAuthoringSource }
  | { type: "set-edit-focus"; payload: EditFocus }
  | { type: "set-rotation-display-mode"; payload: RotationDisplayMode };

export type RiggingTab = "rigging" | "face";
export type RuntimeAuthoringSource =
  | "animation"
  | "procedural-animation-programming"
  | "none";
export type RotationDisplayMode = "radians" | "degrees";
export type EditFocus =
  | "default"
  | "pose-creation"
  | "pose-editing"
  | "animation"
  | "procedural-animation-programming"
  | "reference-face";

const INITIAL_UI_STATE: AuthoringUiState = {
  activeWorkbench: "import-export",
  includeVizijBundle: true,
  includeImportedAnimations: false,
  activeRiggingTab: "rigging",
  skipDiscrepancyCheck: true,
  activeRuntimeSource: "none",
  activeEditFocus: "default",
  rotationDisplayMode: "radians",
};

export function authoringUiReducer(
  state: AuthoringUiState,
  action: AuthoringUiAction,
): AuthoringUiState {
  switch (action.type) {
    case "set-workbench":
      if (state.activeWorkbench === action.payload) {
        return state;
      }
      return { ...state, activeWorkbench: action.payload };
    case "set-include-bundle": {
      if (state.includeVizijBundle === action.payload) {
        return state;
      }
      if (!action.payload) {
        return {
          ...state,
          includeVizijBundle: false,
          includeImportedAnimations: false,
        };
      }
      return { ...state, includeVizijBundle: true };
    }
    case "set-include-animations":
      if (state.includeImportedAnimations === action.payload) {
        return state;
      }
      if (!state.includeVizijBundle && action.payload) {
        return state;
      }
      return { ...state, includeImportedAnimations: action.payload };
    case "set-rigging-tab":
      if (state.activeRiggingTab === action.payload) {
        return state;
      }
      return { ...state, activeRiggingTab: action.payload };
    case "set-skip-discrepancy-check":
      if (state.skipDiscrepancyCheck === action.payload) {
        return state;
      }
      return { ...state, skipDiscrepancyCheck: action.payload };
    case "set-active-runtime-source":
      if (state.activeRuntimeSource === action.payload) {
        return state;
      }
      return { ...state, activeRuntimeSource: action.payload };
    case "set-edit-focus":
      if (state.activeEditFocus === action.payload) {
        return state;
      }
      return { ...state, activeEditFocus: action.payload };
    case "set-rotation-display-mode":
      if (state.rotationDisplayMode === action.payload) {
        return state;
      }
      return { ...state, rotationDisplayMode: action.payload };
    default:
      return state;
  }
}

interface AuthoringUiProviderProps {
  initialState?: Partial<AuthoringUiState>;
  children: ReactNode;
}

const AuthoringUiStateContext = createContext<AuthoringUiState | null>(null);
const AuthoringUiActionsContext = createContext<AuthoringUiActions | null>(
  null,
);

export interface AuthoringUiActions {
  setWorkbench: (view: WorkbenchView) => void;
  setIncludeVizijBundle: (value: boolean) => void;
  setIncludeImportedAnimations: (value: boolean) => void;
  setRiggingTab: (value: RiggingTab) => void;
  setSkipDiscrepancyCheck: (value: boolean) => void;
  setActiveRuntimeSource: (value: RuntimeAuthoringSource) => void;
  setEditFocus: (value: EditFocus) => void;
  setRotationDisplayMode: (value: RotationDisplayMode) => void;
}

export function AuthoringUiProvider({
  initialState,
  children,
}: AuthoringUiProviderProps) {
  const mergedInitial = { ...INITIAL_UI_STATE, ...initialState };
  const [state, dispatch] = useReducer(authoringUiReducer, mergedInitial);

  const actions = useMemo<AuthoringUiActions>(
    () => ({
      setWorkbench: (view) =>
        dispatch({ type: "set-workbench", payload: view }),
      setIncludeVizijBundle: (value) =>
        dispatch({ type: "set-include-bundle", payload: value }),
      setIncludeImportedAnimations: (value) =>
        dispatch({ type: "set-include-animations", payload: value }),
      setRiggingTab: (value) =>
        dispatch({ type: "set-rigging-tab", payload: value }),
      setSkipDiscrepancyCheck: (value) =>
        dispatch({ type: "set-skip-discrepancy-check", payload: value }),
      setActiveRuntimeSource: (value) =>
        dispatch({ type: "set-active-runtime-source", payload: value }),
      setEditFocus: (value) =>
        dispatch({ type: "set-edit-focus", payload: value }),
      setRotationDisplayMode: (value) =>
        dispatch({ type: "set-rotation-display-mode", payload: value }),
    }),
    [],
  );

  return (
    <AuthoringUiStateContext.Provider value={state}>
      <AuthoringUiActionsContext.Provider value={actions}>
        {children}
      </AuthoringUiActionsContext.Provider>
    </AuthoringUiStateContext.Provider>
  );
}

function useContextValue<T>(context: T | null, name: string): T {
  if (!context) {
    throw new Error(`${name} must be used within AuthoringUiProvider`);
  }
  return context;
}

export function useAuthoringUiState(): AuthoringUiState {
  return useContextValue(
    useContext(AuthoringUiStateContext),
    "useAuthoringUiState",
  );
}

export function useAuthoringUiActions(): AuthoringUiActions {
  return useContextValue(
    useContext(AuthoringUiActionsContext),
    "useAuthoringUiActions",
  );
}
