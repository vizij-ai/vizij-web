import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import type { ReactNode } from "react";
import {
  clearPersistedState,
  loadPersistedState,
  persistState,
} from "./storage";
import {
  DEFAULT_APP_STATE,
  type AnimationAsset,
  type AnimationTrack,
  type AppState,
  type GlbAsset,
  type GraphAsset,
  type RigPreset,
  type SimpleAnimationClip,
} from "./types";

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function requestLabel(message: string, defaultLabel: string): string {
  if (typeof window === "undefined") {
    return defaultLabel;
  }
  const response = window.prompt(message, defaultLabel);
  const trimmed = response?.trim();
  return trimmed ? trimmed : defaultLabel;
}

async function fileToDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function fileToJson<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

function normaliseAnimationClip(
  payload: unknown,
  fallbackName: string,
): Omit<SimpleAnimationClip, "id"> {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid animation clip payload.");
  }
  const raw = payload as Record<string, unknown>;
  const trackEntries = Array.isArray((raw as any).tracks)
    ? ((raw as any).tracks as unknown[])
    : [];
  const tracks: AnimationTrack[] = trackEntries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const track = entry as Record<string, unknown>;
      const channel = typeof track.channel === "string" ? track.channel : null;
      const keyframesRaw = Array.isArray(track.keyframes)
        ? (track.keyframes as unknown[])
        : [];
      if (!channel) {
        return null;
      }
      const keyframes = keyframesRaw
        .map((kf) => {
          if (!kf || typeof kf !== "object") {
            return null;
          }
          const snapshot = kf as Record<string, unknown>;
          const time = Number(snapshot.time);
          const value = Number(snapshot.value);
          if (!Number.isFinite(time) || !Number.isFinite(value)) {
            return null;
          }
          return { time, value };
        })
        .filter((kf): kf is AnimationTrack["keyframes"][number] => Boolean(kf))
        .sort((a, b) => a.time - b.time);
      if (!keyframes.length) {
        return null;
      }
      return {
        channel,
        keyframes,
      };
    })
    .filter((track): track is AnimationTrack => Boolean(track));

  const explicitDuration = Number((raw as any).duration);
  const computedDuration = tracks.reduce(
    (max, track) =>
      Math.max(max, track.keyframes[track.keyframes.length - 1]?.time ?? 0),
    0,
  );
  const duration =
    Number.isFinite(explicitDuration) && explicitDuration > 0
      ? explicitDuration
      : computedDuration || 1;

  const name =
    typeof (raw as any).name === "string"
      ? ((raw as any).name as string)
      : fallbackName.replace(/\.[^.]+$/, "");

  return {
    name,
    duration,
    tracks,
  };
}

const AppStateContext = createContext<AppStateContextValue | null>(null);

type Action =
  | { type: "set-glb"; payload: GlbAsset | null }
  | { type: "set-low-level"; payload: GraphAsset | null }
  | { type: "add-high-level"; payload: GraphAsset }
  | { type: "remove-high-level"; id: string }
  | { type: "set-rig-selection"; id: string; selected: boolean }
  | { type: "set-slider"; path: string; value: number }
  | { type: "reset-rig-sliders"; paths: string[] }
  | { type: "add-animation"; payload: AnimationAsset }
  | { type: "update-animation"; payload: AnimationAsset }
  | { type: "remove-animation"; id: string }
  | { type: "set-selected-animation"; id: string | null }
  | { type: "set-animation-weight"; id: string; weight: number }
  | { type: "add-rig-preset"; rigId: string; preset: RigPreset }
  | { type: "remove-rig-preset"; rigId: string; presetId: string }
  | { type: "clear" };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "set-glb":
      return { ...state, glb: action.payload };
    case "set-low-level":
      return { ...state, lowLevel: action.payload };
    case "add-high-level": {
      const exists = state.highLevel.some(
        (entry) => entry.id === action.payload.id,
      );
      const nextHighLevel = exists
        ? state.highLevel.map((entry) =>
            entry.id === action.payload.id ? action.payload : entry,
          )
        : [...state.highLevel, action.payload];
      const nextSelection = exists
        ? state.selectedRigIds
        : [...state.selectedRigIds, action.payload.id];
      return {
        ...state,
        highLevel: nextHighLevel,
        selectedRigIds: Array.from(new Set(nextSelection)),
        rigPresets: {
          ...state.rigPresets,
          [action.payload.id]: state.rigPresets[action.payload.id] ?? [],
        },
      };
    }
    case "remove-high-level": {
      const remaining = state.highLevel.filter(
        (entry) => entry.id !== action.id,
      );
      const nextSliderValues = { ...state.sliderValues };
      Object.keys(nextSliderValues).forEach((key) => {
        if (key.startsWith(`ui/${action.id}/`)) {
          delete nextSliderValues[key];
        }
      });
      const { [action.id]: _removedPresets, ...restPresets } = state.rigPresets;
      return {
        ...state,
        highLevel: remaining,
        selectedRigIds: state.selectedRigIds.filter((id) => id !== action.id),
        sliderValues: nextSliderValues,
        rigPresets: restPresets,
      };
    }
    case "set-rig-selection": {
      const isSelected = state.selectedRigIds.includes(action.id);
      if (action.selected) {
        if (isSelected) {
          return state;
        }
        return {
          ...state,
          selectedRigIds: [...state.selectedRigIds, action.id],
        };
      }
      if (!isSelected) {
        return state;
      }
      return {
        ...state,
        selectedRigIds: state.selectedRigIds.filter((id) => id !== action.id),
      };
    }
    case "set-slider":
      if (state.sliderValues[action.path] === action.value) {
        return state;
      }
      return {
        ...state,
        sliderValues: { ...state.sliderValues, [action.path]: action.value },
      };
    case "reset-rig-sliders": {
      if (!action.paths.length) {
        return state;
      }
      const nextSliderValues = { ...state.sliderValues };
      action.paths.forEach((path) => {
        delete nextSliderValues[path];
      });
      return {
        ...state,
        sliderValues: nextSliderValues,
      };
    }
    case "add-animation":
      return {
        ...state,
        animations: [...state.animations, action.payload],
        selectedAnimationId: action.payload.id,
      };
    case "update-animation":
      return {
        ...state,
        animations: state.animations.map((entry) =>
          entry.id === action.payload.id ? action.payload : entry,
        ),
      };
    case "remove-animation": {
      const remaining = state.animations.filter(
        (entry) => entry.id !== action.id,
      );
      const nextSelected =
        state.selectedAnimationId === action.id
          ? (remaining[0]?.id ?? null)
          : state.selectedAnimationId;
      return {
        ...state,
        animations: remaining,
        selectedAnimationId: nextSelected,
      };
    }
    case "set-selected-animation":
      return {
        ...state,
        selectedAnimationId: action.id,
      };
    case "set-animation-weight":
      return {
        ...state,
        animations: state.animations.map((entry) =>
          entry.id === action.id ? { ...entry, weight: action.weight } : entry,
        ),
      };
    case "add-rig-preset":
      return {
        ...state,
        rigPresets: {
          ...state.rigPresets,
          [action.rigId]: [
            ...(state.rigPresets[action.rigId] ?? []),
            action.preset,
          ],
        },
      };
    case "remove-rig-preset":
      return {
        ...state,
        rigPresets: {
          ...state.rigPresets,
          [action.rigId]: (state.rigPresets[action.rigId] ?? []).filter(
            (preset) => preset.id !== action.presetId,
          ),
        },
      };
    case "clear":
      return DEFAULT_APP_STATE;
    default:
      return state;
  }
}

type AppStateContextValue = {
  state: AppState;
  importGlb: (file: File) => Promise<void>;
  importLowLevel: (file: File) => Promise<void>;
  importHighLevel: (file: File) => Promise<void>;
  removeHighLevel: (id: string) => void;
  setRigSelection: (id: string, selected: boolean) => void;
  setSliderValue: (path: string, value: number) => void;
  resetRigSliders: (paths: string[]) => void;
  importAnimation: (file: File) => Promise<void>;
  createAnimation: (clip: SimpleAnimationClip, label: string) => void;
  removeAnimation: (id: string) => void;
  updateAnimation: (asset: AnimationAsset) => void;
  setSelectedAnimation: (id: string | null) => void;
  setAnimationWeight: (id: string, weight: number) => void;
  addRigPreset: (rigId: string, preset: RigPreset) => void;
  removeRigPreset: (rigId: string, presetId: string) => void;
  clearAll: () => void;
};

export function AppStateProvider({ children }: { children: ReactNode }) {
  const persisted = useMemo(() => loadPersistedState(), []);
  const [state, dispatch] = useReducer(reducer, persisted.state);
  const bundleKeyRef = useRef<string | null>(persisted.bundleKey ?? null);

  useEffect(() => {
    const key = persistState(state);
    if (key) {
      bundleKeyRef.current = key;
    }
  }, [state]);

  const importGlb = useCallback(async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const defaultLabel = file.name.replace(/\.[^.]+$/, "") || "Face";
    const label = requestLabel("Enter a label for the GLB asset", defaultLabel);
    const asset: GlbAsset = {
      id: createId(),
      label,
      fileName: file.name,
      dataUrl,
      size: file.size,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "set-glb", payload: asset });
  }, []);

  const importLowLevel = useCallback(async (file: File) => {
    const spec = await fileToJson<Record<string, unknown>>(file);
    const defaultLabel = file.name.replace(/\.[^.]+$/, "") || "Low-Level Rig";
    const label = requestLabel(
      "Enter a label for the low-level rig graph",
      defaultLabel,
    );
    const asset: GraphAsset = {
      id: createId(),
      label,
      fileName: file.name,
      spec,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "set-low-level", payload: asset });
  }, []);

  const importHighLevel = useCallback(async (file: File) => {
    const spec = await fileToJson<Record<string, unknown>>(file);
    const defaultLabel = file.name.replace(/\.[^.]+$/, "") || "High-Level Rig";
    const label = requestLabel(
      "Enter a label for the high-level rig",
      defaultLabel,
    );
    const asset: GraphAsset = {
      id: createId(),
      label,
      fileName: file.name,
      spec,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "add-high-level", payload: asset });
  }, []);

  const removeHighLevel = useCallback((id: string) => {
    dispatch({ type: "remove-high-level", id });
  }, []);

  const setRigSelection = useCallback((id: string, selected: boolean) => {
    dispatch({ type: "set-rig-selection", id, selected });
  }, []);

  const setSliderValue = useCallback((path: string, value: number) => {
    dispatch({ type: "set-slider", path, value });
  }, []);

  const resetRigSliders = useCallback((paths: string[]) => {
    dispatch({ type: "reset-rig-sliders", paths });
  }, []);

  const importAnimation = useCallback(async (file: File) => {
    const raw = await fileToJson<unknown>(file);
    const clipId = createId();
    const parsed = normaliseAnimationClip(raw, file.name);
    const defaultLabel =
      parsed.name || file.name.replace(/\.[^.]+$/, "") || "Animation";
    const label = requestLabel(
      "Enter a label for the animation clip",
      defaultLabel,
    );
    const clip: SimpleAnimationClip = {
      id: clipId,
      name: label,
      duration: parsed.duration,
      tracks: parsed.tracks,
    };
    const asset: AnimationAsset = {
      id: clipId,
      label,
      fileName: file.name,
      clip,
      weight: 1,
      updatedAt: new Date().toISOString(),
    };
    dispatch({ type: "add-animation", payload: asset });
  }, []);

  const createAnimation = useCallback(
    (clip: SimpleAnimationClip, label: string) => {
      const clipId = clip.id || createId();
      const resolvedLabel = label || clip.name || "Animation";
      const safeFileName = `${resolvedLabel.replace(/\s+/g, "_").toLowerCase() || "animation"}.json`;
      const resolvedClip: SimpleAnimationClip = {
        ...clip,
        id: clipId,
        name: resolvedLabel,
      };
      const asset: AnimationAsset = {
        id: clipId,
        label: resolvedLabel,
        fileName: safeFileName,
        clip: resolvedClip,
        weight: 1,
        updatedAt: new Date().toISOString(),
      };
      dispatch({ type: "add-animation", payload: asset });
    },
    [],
  );

  const removeAnimation = useCallback((id: string) => {
    dispatch({ type: "remove-animation", id });
  }, []);

  const updateAnimation = useCallback((asset: AnimationAsset) => {
    dispatch({ type: "update-animation", payload: asset });
  }, []);

  const setSelectedAnimation = useCallback((id: string | null) => {
    dispatch({ type: "set-selected-animation", id });
  }, []);

  const setAnimationWeight = useCallback((id: string, weight: number) => {
    dispatch({ type: "set-animation-weight", id, weight });
  }, []);

  const addRigPreset = useCallback((rigId: string, preset: RigPreset) => {
    dispatch({ type: "add-rig-preset", rigId, preset });
  }, []);

  const removeRigPreset = useCallback((rigId: string, presetId: string) => {
    dispatch({ type: "remove-rig-preset", rigId, presetId });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "clear" });
    clearPersistedState(bundleKeyRef.current);
    bundleKeyRef.current = null;
  }, []);

  const value: AppStateContextValue = useMemo(
    () => ({
      state,
      importGlb,
      importLowLevel,
      importHighLevel,
      removeHighLevel,
      setRigSelection,
      setSliderValue,
      resetRigSliders,
      importAnimation,
      createAnimation,
      removeAnimation,
      updateAnimation,
      setSelectedAnimation,
      setAnimationWeight,
      addRigPreset,
      removeRigPreset,
      clearAll,
    }),
    [
      state,
      importGlb,
      importLowLevel,
      importHighLevel,
      removeHighLevel,
      setRigSelection,
      setSliderValue,
      resetRigSliders,
      importAnimation,
      createAnimation,
      removeAnimation,
      updateAnimation,
      setSelectedAnimation,
      setAnimationWeight,
      addRigPreset,
      removeRigPreset,
      clearAll,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateContextValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return ctx;
}
