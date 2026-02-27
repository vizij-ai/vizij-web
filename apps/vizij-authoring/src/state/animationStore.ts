import { create } from "zustand";
import type { VizijAnimationClipData } from "@vizij/render";
import type { ManagedStandardInput } from "../types/standardInputs";

export interface AnimationKeyframe {
  id: string;
  time: number; // in seconds
  value: number;
  interpolation?: "linear" | "step" | "smooth";
}

export interface AnimationTrack {
  id: string;
  variableId: string; // The StandardInput ID being driven
  label: string;
  color: string;
  keyframes: AnimationKeyframe[];
  renderableId?: string;
}

export interface AnimationClip {
  id: string;
  name: string;
  tracks: AnimationTrack[];
  duration: number;
}

interface AnimationState {
  animations: Record<string, AnimationClip>;
  activeAnimationId: string | null;

  currentTime: number; // in seconds
  isPlaying: boolean;
  loop: boolean;
  playSpeed: number;

  // Selection
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;

  // Actions
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setLoop: (loop: boolean) => void;

  // Animation Management
  selectAnimation: (id: string | null) => void;
  createAnimation: (name: string) => string;
  deleteAnimation: (id: string) => void;
  renameAnimation: (id: string, name: string) => void;
  setDuration: (duration: number) => void;

  // Track Management
  addTrack: (animationId: string, trackData: { variableId: string; label?: string; renderableId?: string }) => void;
  removeTrack: (trackId: string) => void;

  // Keyframe Management
  addKeyframe: (trackId: string, time: number, value: number) => void;
  removeKeyframe: (trackId: string, keyframeId: string) => void;
  updateKeyframe: (
    trackId: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;

  selectTrack: (trackId: string | null) => void;
  selectKeyframe: (keyframeId: string | null) => void;

  // Runtime
  tick: (deltaTime: number) => void;
  setPlaySpeed: (speed: number) => void;

  importExternalAnimations: (
    animations: VizijAnimationClipData[],
    managedStandardInputs?: ManagedStandardInput[],
  ) => void;
}

const DEFAULT_ANIM_ID = "default";

export const useAnimationStore = create<AnimationState>((set, get) => ({
  animations: {
    [DEFAULT_ANIM_ID]: {
      id: DEFAULT_ANIM_ID,
      name: "Default Animation",
      tracks: [],
      duration: 10,
    },
  },
  activeAnimationId: DEFAULT_ANIM_ID,
  currentTime: 0,
  isPlaying: false,
  loop: true,
  playSpeed: 1,
  selectedTrackId: null,
  selectedKeyframeId: null,

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  stop: () => set({ isPlaying: false, currentTime: 0 }),
  seek: (time) => {
    const activeAnimId = get().activeAnimationId;
    const duration = activeAnimId ? get().animations[activeAnimId]?.duration : 10;
    set({ currentTime: Math.max(0, Math.min(time, duration)) });
  },
  setLoop: (loop) => set({ loop }),

  selectAnimation: (activeAnimationId) =>
    set({ activeAnimationId, currentTime: 0, isPlaying: false }),

  createAnimation: (name) => {
    const id = `anim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    set((state) => ({
      animations: {
        ...state.animations,
        [id]: {
          id,
          name,
          tracks: [],
          duration: 10,
        },
      },
      activeAnimationId: id,
      currentTime: 0,
      isPlaying: false,
    }));
    return id;
  },

  deleteAnimation: (id) =>
    set((state) => {
      const nextAnimations = { ...state.animations };
      delete nextAnimations[id];
      const remainingIds = Object.keys(nextAnimations);
      return {
        animations: nextAnimations,
        activeAnimationId:
          state.activeAnimationId === id
            ? remainingIds[0] || null
            : state.activeAnimationId,
      };
    }),

  renameAnimation: (id, name) =>
    set((state) => ({
      animations: {
        ...state.animations,
        [id]: { ...state.animations[id], name },
      },
    })),

  setDuration: (duration) =>
    set((state) => {
      if (!state.activeAnimationId) return {};
      return {
        animations: {
          ...state.animations,
          [state.activeAnimationId]: {
            ...state.animations[state.activeAnimationId],
            duration,
          },
        },
      };
    }),

  addTrack: (animationId, trackData) =>
    set((state) => {
      const activeAnim = state.animations[animationId];
      if (!activeAnim) return {};

      const newTrack: AnimationTrack = {
        id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        variableId: trackData.variableId,
        label: trackData.label || trackData.variableId,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        keyframes: [],
        renderableId: trackData.renderableId,
      };

      return {
        animations: {
          ...state.animations,
          [animationId]: {
            ...activeAnim,
            tracks: [...activeAnim.tracks, newTrack],
          },
        },
      };
    }),

  removeTrack: (trackId) =>
    set((state) => {
      const activeId = state.activeAnimationId;
      if (!activeId) return {};
      const activeAnim = state.animations[activeId];

      return {
        animations: {
          ...state.animations,
          [activeId]: {
            ...activeAnim,
            tracks: activeAnim.tracks.filter((t) => t.id !== trackId),
          },
        },
        selectedTrackId:
          state.selectedTrackId === trackId ? null : state.selectedTrackId,
      };
    }),

  addKeyframe: (trackId, time, value) =>
    set((state) => {
      const activeId = state.activeAnimationId;
      if (!activeId) return {};
      const activeAnim = state.animations[activeId];
      const track = activeAnim.tracks.find((t) => t.id === trackId);
      if (!track) return {};

      const newKeyframe: AnimationKeyframe = {
        id: `kf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        time: Math.max(0, Math.min(time, activeAnim.duration)),
        value,
        interpolation: "linear",
      };

      const updatedTracks = activeAnim.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          keyframes: [...t.keyframes, newKeyframe].sort(
            (a, b) => a.time - b.time,
          ),
        };
      });

      return {
        animations: {
          ...state.animations,
          [activeId]: {
            ...activeAnim,
            tracks: updatedTracks,
          },
        },
      };
    }),

  removeKeyframe: (trackId, keyframeId) =>
    set((state) => {
      const activeId = state.activeAnimationId;
      if (!activeId) return {};
      const activeAnim = state.animations[activeId];

      return {
        animations: {
          ...state.animations,
          [activeId]: {
            ...activeAnim,
            tracks: activeAnim.tracks.map((t) => {
              if (t.id !== trackId) return t;
              return {
                ...t,
                keyframes: t.keyframes.filter((k) => k.id !== keyframeId),
              };
            }),
          },
        },
      };
    }),

  updateKeyframe: (trackId, keyframeId, updates) =>
    set((state) => {
      const activeId = state.activeAnimationId;
      if (!activeId) return {};
      const activeAnim = state.animations[activeId];

      return {
        animations: {
          ...state.animations,
          [activeId]: {
            ...activeAnim,
            tracks: activeAnim.tracks.map((t) => {
              if (t.id !== trackId) return t;
              return {
                ...t,
                keyframes: t.keyframes
                  .map((k) => (k.id === keyframeId ? { ...k, ...updates } : k))
                  .sort((a, b) => a.time - b.time),
              };
            }),
          },
        },
      };
    }),

  selectTrack: (selectedTrackId) => set({ selectedTrackId }),
  selectKeyframe: (selectedKeyframeId) => set({ selectedKeyframeId }),

  tick: (deltaTime) => {
    const state = get();
    if (!state.isPlaying || !state.activeAnimationId) return;

    const activeAnim = state.animations[state.activeAnimationId];
    if (!activeAnim) return;

    let nextTime = state.currentTime + deltaTime * state.playSpeed;
    if (nextTime > activeAnim.duration) {
      if (state.loop) {
        nextTime = nextTime % activeAnim.duration;
      } else {
        nextTime = activeAnim.duration;
        set({ isPlaying: false });
      }
    }
    set({ currentTime: nextTime });
  },

  setPlaySpeed: (playSpeed) => set({ playSpeed }),

  importExternalAnimations: (
    animations: VizijAnimationClipData[],
    managedStandardInputs?: any[],
  ) =>
    set((state) => {
      if (animations.length === 0) return {};

      const nextAnimations = { ...state.animations };
      let lastImportedId = state.activeAnimationId;

      const reverseLookup = new Map<string, any>();
      if (managedStandardInputs) {
        console.log(`[animationStore] Building reverse lookup map from ${managedStandardInputs.length} drivers`);
        managedStandardInputs.forEach((d: any) => {
          if (d.metadata) {
            const { elementId, elementName, featureKey, componentKey } = d.metadata;
            const compSuffix = componentKey ? `:${componentKey}` : "";

            if (elementId) {
              const k1 = `${elementId}:${featureKey}${compSuffix}`;
              reverseLookup.set(k1, d);
              console.log(`[animationStore] Map Entry (elementId): "${k1}" -> ${d.input.id}`);
            }
            if (elementName && elementName !== elementId) {
              const k2 = `${elementName}:${featureKey}${compSuffix}`;
              reverseLookup.set(k2, d);
              console.log(`[animationStore] Map Entry (elementName): "${k2}" -> ${d.input.id}`);
            }

            // Add lowercase fallbacks
            if (elementId) {
              reverseLookup.set(`${elementId.toLowerCase()}:${featureKey.toLowerCase()}${compSuffix}`, d);
            }
            if (elementName && elementName !== elementId) {
              reverseLookup.set(`${elementName.toLowerCase()}:${featureKey.toLowerCase()}${compSuffix}`, d);
            }
          }
        });
      }

      animations.forEach((animData) => {
        const id = `anim-ext-${Date.now()}-${animData.id || Math.random().toString(36).substr(2, 5)}`;
        const newTracks: AnimationTrack[] = [];

        animData.tracks.forEach((track) => {
          const componentSuffixes = ["x", "y", "z", "w"];
          const numComponents = track.valueSize;

          for (let c = 0; c < numComponents; c++) {
            const elementIdMatch = track.componentId.split(":")[0];
            const featureKeyMatch = track.feature;
            const componentSuffix = numComponents > 1 ? componentSuffixes[c] || c : undefined;
            const lookupKey = componentSuffix ? `${elementIdMatch}:${featureKeyMatch}:${componentSuffix}` : `${elementIdMatch}:${featureKeyMatch}`;
            const lookupKeyLower = componentSuffix ? `${elementIdMatch.toLowerCase()}:${featureKeyMatch.toLowerCase()}:${componentSuffix}` : `${elementIdMatch.toLowerCase()}:${featureKeyMatch.toLowerCase()}`;

            let variableId = track.componentId; // Fallback
            let valueOffset = 0;
            let valueScale = 1;

            if (managedStandardInputs) {
              const driver = reverseLookup.get(lookupKey) || reverseLookup.get(lookupKeyLower);
              if (driver) {
                variableId = driver.input.id;
                console.log(`[animationStore] Resolved GLB track ${lookupKey} to matched driver ${driver.input.id}`);

                const firstVal = track.values[c];
                const rigDefault = driver.input.defaultValue || 0;

                if (!variableId.includes("morph") && !variableId.includes("weights")) {
                  valueOffset = rigDefault - firstVal;
                }
              } else {
                console.warn(`[animationStore] Could not find matched driver for GLB track: ${lookupKey}`);
                const featurePath = track.componentId.replace(/:/g, "/");
                const suffix = componentSuffix ? `/${componentSuffix}` : "";
                variableId = `${featurePath}${suffix}`;
              }
            } else {
              const featurePath = track.componentId.replace(/:/g, "/");
              const suffix = componentSuffix ? `/${componentSuffix}` : "";
              variableId = `${featurePath}${suffix}`;
            }

            const keyframes: AnimationKeyframe[] = [];
            for (let i = 0; i < track.times.length; i++) {
              const rawVal = track.values[i * track.valueSize + c];
              keyframes.push({
                id: `kf-ext-${Date.now()}-${i}-${c}-${Math.random().toString(36).substr(2, 5)}`,
                time: track.times[i],
                value: (rawVal + valueOffset) * valueScale,
                interpolation: (track.interpolation?.toLowerCase() as any) || "linear",
              });
            }

            const renderableId = track.componentId.split(":")[0];
            const suffixStr = componentSuffix ? `/${componentSuffix}` : "";

            newTracks.push({
              id: `track-ext-${Date.now()}-${track.componentId}-${c}-${Math.random().toString(36).substr(2, 5)}`,
              variableId,
              label: `${track.nodeName || "Node"} - ${track.feature}${suffixStr}`,
              color: `hsl(${Math.random() * 360}, 70%, 50%)`,
              keyframes,
              renderableId,
            });
          }
        });

        nextAnimations[id] = {
          id,
          name: animData.name || `Imported ${animData.index + 1}`,
          tracks: newTracks,
          duration: animData.duration,
        };
        console.log(`[animationStore] Imported animation "${nextAnimations[id].name}" with ${newTracks.length} tracks. First track variableId: ${newTracks[0]?.variableId}`);
        lastImportedId = id;
      });

      return {
        animations: nextAnimations,
        activeAnimationId: lastImportedId,
        currentTime: 0,
        isPlaying: false,
      };
    }),
}));

// Helper to evaluate a track at a specific time
export function evaluateTrack(track: AnimationTrack, time: number): number {
  if (track.keyframes.length === 0) return 0;

  let prevKeyframe = track.keyframes[0];
  let nextKeyframe = track.keyframes[0];

  if (time <= track.keyframes[0].time) {
    return track.keyframes[0].value;
  }

  if (time >= track.keyframes[track.keyframes.length - 1].time) {
    return track.keyframes[track.keyframes.length - 1].value;
  }

  for (let i = 0; i < track.keyframes.length - 1; i++) {
    if (
      time >= track.keyframes[i].time &&
      time <= track.keyframes[i + 1].time
    ) {
      prevKeyframe = track.keyframes[i];
      nextKeyframe = track.keyframes[i + 1];
      break;
    }
  }

  const duration = nextKeyframe.time - prevKeyframe.time;
  if (duration <= 0) return prevKeyframe.value;

  const t = (time - prevKeyframe.time) / duration;

  return prevKeyframe.value + (nextKeyframe.value - prevKeyframe.value) * t;
}
