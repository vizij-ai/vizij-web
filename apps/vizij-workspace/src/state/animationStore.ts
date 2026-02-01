import { create } from "zustand";

export interface AnimationKeyframe {
    id: string;
    time: number; // in seconds
    value: number;
    interpolation?: "linear" | "step" | "smooth";
}

export interface AnimationTrack {
    id: string;
    variableId: string; // The StandardInput ID being driven
    label?: string;
    color?: string;
    keyframes: AnimationKeyframe[];
}

interface AnimationState {
    tracks: AnimationTrack[];
    currentTime: number; // in seconds
    duration: number; // in seconds
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
    setDuration: (duration: number) => void;
    setLoop: (loop: boolean) => void;

    addTrack: (variableId: string, label?: string) => void;
    removeTrack: (trackId: string) => void;

    addKeyframe: (trackId: string, time: number, value: number) => void;
    removeKeyframe: (trackId: string, keyframeId: string) => void;
    updateKeyframe: (trackId: string, keyframeId: string, updates: Partial<AnimationKeyframe>) => void;

    selectTrack: (trackId: string | null) => void;
    selectKeyframe: (keyframeId: string | null) => void;

    // Runtime
    tick: (deltaTime: number) => void;
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
    tracks: [],
    currentTime: 0,
    duration: 10,
    isPlaying: false,
    loop: true,
    playSpeed: 1,
    selectedTrackId: null,
    selectedKeyframeId: null,

    play: () => set({ isPlaying: true }),
    pause: () => set({ isPlaying: false }),
    stop: () => set({ isPlaying: false, currentTime: 0 }),
    seek: (time) => set({ currentTime: Math.max(0, Math.min(time, get().duration)) }),
    setDuration: (duration) => set({ duration }),
    setLoop: (loop) => set({ loop }),

    addTrack: (variableId, label) =>
        set((state) => {
            // Prevent duplicates
            if (state.tracks.some((t) => t.variableId === variableId)) return {};

            const newTrack: AnimationTrack = {
                id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                variableId,
                label: label || variableId,
                color: `hsl(${Math.random() * 360}, 70%, 50%)`,
                keyframes: [],
            };
            return { tracks: [...state.tracks, newTrack] };
        }),

    removeTrack: (trackId) =>
        set((state) => ({
            tracks: state.tracks.filter((t) => t.id !== trackId),
            selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
        })),

    addKeyframe: (trackId, time, value) =>
        set((state) => {
            const track = state.tracks.find((t) => t.id === trackId);
            if (!track) return {};

            const newKeyframe: AnimationKeyframe = {
                id: `kf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                time: Math.max(0, Math.min(time, state.duration)),
                value,
                interpolation: "linear",
            };

            const updatedTracks = state.tracks.map((t) => {
                if (t.id !== trackId) return t;
                return {
                    ...t,
                    keyframes: [...t.keyframes, newKeyframe].sort((a, b) => a.time - b.time),
                };
            });

            return { tracks: updatedTracks };
        }),

    removeKeyframe: (trackId, keyframeId) =>
        set((state) => ({
            tracks: state.tracks.map((t) => {
                if (t.id !== trackId) return t;
                return {
                    ...t,
                    keyframes: t.keyframes.filter((k) => k.id !== keyframeId),
                };
            }),
        })),

    updateKeyframe: (trackId, keyframeId, updates) =>
        set((state) => ({
            tracks: state.tracks.map((t) => {
                if (t.id !== trackId) return t;
                return {
                    ...t,
                    keyframes: t.keyframes
                        .map((k) => (k.id === keyframeId ? { ...k, ...updates } : k))
                        .sort((a, b) => a.time - b.time),
                };
            }),
        })),

    selectTrack: (selectedTrackId) => set({ selectedTrackId }),
    selectKeyframe: (selectedKeyframeId) => set({ selectedKeyframeId }),

    tick: (deltaTime) => {
        const state = get();
        if (!state.isPlaying) return;

        let nextTime = state.currentTime + deltaTime * state.playSpeed;
        if (nextTime > state.duration) {
            if (state.loop) {
                nextTime = nextTime % state.duration;
            } else {
                nextTime = state.duration;
                set({ isPlaying: false });
            }
        }
        set({ currentTime: nextTime });
    },
}));

// Helper to evaluate a track at a specific time
export function evaluateTrack(track: AnimationTrack, time: number): number {
    if (track.keyframes.length === 0) return 0;

    // Find the keyframe just before or at the time
    // This is a simple linear search, can be optimized
    let prevKeyframe = track.keyframes[0];
    let nextKeyframe = track.keyframes[0];

    if (time <= track.keyframes[0].time) {
        return track.keyframes[0].value;
    }

    if (time >= track.keyframes[track.keyframes.length - 1].time) {
        return track.keyframes[track.keyframes.length - 1].value;
    }

    for (let i = 0; i < track.keyframes.length - 1; i++) {
        if (time >= track.keyframes[i].time && time <= track.keyframes[i + 1].time) {
            prevKeyframe = track.keyframes[i];
            nextKeyframe = track.keyframes[i + 1];
            break;
        }
    }

    const duration = nextKeyframe.time - prevKeyframe.time;
    if (duration <= 0) return prevKeyframe.value;

    const t = (time - prevKeyframe.time) / duration;

    // Linear interpolation for now
    return prevKeyframe.value + (nextKeyframe.value - prevKeyframe.value) * t;
}
