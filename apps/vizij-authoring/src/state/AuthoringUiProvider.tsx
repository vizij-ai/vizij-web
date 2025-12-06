import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { WorkbenchView } from "../components/app/workbenchConfig";

export interface AuthoringUiState {
  activeWorkbench: WorkbenchView;
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  activeRiggingTab: RiggingTab;
}

export type AuthoringUiAction =
  | { type: "set-workbench"; payload: WorkbenchView }
  | { type: "set-include-bundle"; payload: boolean }
  | { type: "set-include-animations"; payload: boolean }
  | { type: "set-rigging-tab"; payload: RiggingTab };

export type RiggingTab = "rigging" | "face";

const INITIAL_UI_STATE: AuthoringUiState = {
  activeWorkbench: "import-export",
  includeVizijBundle: true,
  includeImportedAnimations: false,
  activeRiggingTab: "rigging",
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
