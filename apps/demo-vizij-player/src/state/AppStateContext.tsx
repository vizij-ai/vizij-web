import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import type { ReactNode } from "react";
import { createBrowserSafeId } from "@vizij/utils";
import {
  loadPersistedState,
  persistState,
  createPersistedState,
} from "./storage";
import {
  DEFAULT_PLAYBACK_SELECTION,
  DEFAULT_PLAYER_STATE,
  type DemoFaceSource,
  type DemoPanelId,
  type DemoPlayerState,
  type DemoSampleId,
  type DemoTheme,
} from "./types";

function createUploadId(): string {
  return createBrowserSafeId();
}

type Action =
  | { type: "select-sample"; id: DemoSampleId }
  | { type: "select-upload"; payload: DemoFaceSource & { kind: "upload" } }
  | { type: "clear-source" }
  | { type: "set-theme"; theme: DemoTheme }
  | { type: "set-animation"; id: string | null }
  | { type: "set-program"; id: string | null }
  | { type: "set-pose-group"; id: string | null }
  | { type: "set-panel"; panel: DemoPanelId; visible: boolean };

function reducer(state: DemoPlayerState, action: Action): DemoPlayerState {
  switch (action.type) {
    case "select-sample":
      return {
        ...state,
        source: { kind: "sample", id: action.id },
        playbackSelection: { ...DEFAULT_PLAYBACK_SELECTION },
      };
    case "select-upload":
      return {
        ...state,
        source: action.payload,
        playbackSelection: { ...DEFAULT_PLAYBACK_SELECTION },
      };
    case "clear-source":
      return {
        ...state,
        source: null,
        playbackSelection: { ...DEFAULT_PLAYBACK_SELECTION },
      };
    case "set-theme":
      if (state.theme === action.theme) {
        return state;
      }
      return {
        ...state,
        theme: action.theme,
      };
    case "set-animation":
      if (state.playbackSelection.animationId === action.id) {
        return state;
      }
      return {
        ...state,
        playbackSelection: {
          ...state.playbackSelection,
          animationId: action.id,
        },
      };
    case "set-program":
      if (state.playbackSelection.programId === action.id) {
        return state;
      }
      return {
        ...state,
        playbackSelection: {
          ...state.playbackSelection,
          programId: action.id,
        },
      };
    case "set-pose-group":
      if (state.playbackSelection.poseGroupId === action.id) {
        return state;
      }
      return {
        ...state,
        playbackSelection: {
          ...state.playbackSelection,
          poseGroupId: action.id,
        },
      };
    case "set-panel":
      if (state.panels[action.panel] === action.visible) {
        return state;
      }
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: action.visible,
        },
      };
    default:
      return state;
  }
}

type AppStateContextValue = {
  state: DemoPlayerState;
  selectSample: (id: DemoSampleId) => void;
  selectUpload: (file: File) => void;
  clearSource: () => void;
  setTheme: (theme: DemoTheme) => void;
  toggleTheme: () => void;
  setSelectedAnimation: (id: string | null) => void;
  setSelectedProgram: (id: string | null) => void;
  setSelectedPoseGroup: (id: string | null) => void;
  setPanelVisibility: (panel: DemoPanelId, visible: boolean) => void;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

function buildInitialState(): DemoPlayerState {
  const persisted = loadPersistedState();
  return {
    ...DEFAULT_PLAYER_STATE,
    source: persisted.source,
    playbackSelection: persisted.playbackSelection,
    panels: persisted.panels,
    theme: persisted.theme,
  };
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, buildInitialState);

  useEffect(() => {
    persistState(
      createPersistedState(
        state.source,
        state.playbackSelection,
        state.panels,
        state.theme,
      ),
    );
  }, [state]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const selectSample = useCallback((id: DemoSampleId) => {
    dispatch({ type: "select-sample", id });
  }, []);

  const selectUpload = useCallback((file: File) => {
    const label = file.name.replace(/\.[^.]+$/, "") || "Uploaded face";
    dispatch({
      type: "select-upload",
      payload: {
        kind: "upload",
        id: createUploadId(),
        label,
        fileName: file.name,
        file,
      },
    });
  }, []);

  const clearSource = useCallback(() => {
    dispatch({ type: "clear-source" });
  }, []);

  const setTheme = useCallback((theme: DemoTheme) => {
    dispatch({ type: "set-theme", theme });
  }, []);

  const toggleTheme = useCallback(() => {
    dispatch({
      type: "set-theme",
      theme: state.theme === "dark" ? "light" : "dark",
    });
  }, [state.theme]);

  const setSelectedAnimation = useCallback((id: string | null) => {
    dispatch({ type: "set-animation", id });
  }, []);

  const setSelectedProgram = useCallback((id: string | null) => {
    dispatch({ type: "set-program", id });
  }, []);

  const setSelectedPoseGroup = useCallback((id: string | null) => {
    dispatch({ type: "set-pose-group", id });
  }, []);

  const setPanelVisibility = useCallback(
    (panel: DemoPanelId, visible: boolean) => {
      dispatch({ type: "set-panel", panel, visible });
    },
    [],
  );

  const value = useMemo<AppStateContextValue>(
    () => ({
      state,
      selectSample,
      selectUpload,
      clearSource,
      setTheme,
      toggleTheme,
      setSelectedAnimation,
      setSelectedProgram,
      setSelectedPoseGroup,
      setPanelVisibility,
    }),
    [
      clearSource,
      selectSample,
      selectUpload,
      setTheme,
      setPanelVisibility,
      setSelectedAnimation,
      setSelectedPoseGroup,
      setSelectedProgram,
      state,
      toggleTheme,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
