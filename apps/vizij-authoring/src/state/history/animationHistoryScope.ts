import { useAnimationStore, type AnimationTrack } from "../animationStore";
import type { HistoryManager, HistorySnapshot } from "./historyStore";

export const ANIMATION_HISTORY_SCOPE_ID = "animation-timeline";

interface AnimationHistorySnapshot extends HistorySnapshot {
  tracks: AnimationTrack[];
  duration: number;
  nextTrackOrdinal: number;
  nextKeyframeOrdinal: number;
}

/**
 * Registers the animation timeline document (tracks, keyframes, duration) as
 * an undo/redo scope. Transport state (current time, playing, speed) and
 * selection are not undoable.
 */
export function registerAnimationHistoryScope(
  history: HistoryManager,
): () => void {
  const unregister = history.registerScope({
    id: ANIMATION_HISTORY_SCOPE_ID,
    capture: (): AnimationHistorySnapshot => {
      const state = useAnimationStore.getState();
      return {
        tracks: state.tracks,
        duration: state.duration,
        nextTrackOrdinal: state.nextTrackOrdinal,
        nextKeyframeOrdinal: state.nextKeyframeOrdinal,
      };
    },
    restore: (snapshot) => {
      const typed = snapshot as AnimationHistorySnapshot;
      useAnimationStore.setState({
        tracks: typed.tracks,
        duration: typed.duration,
        nextTrackOrdinal: typed.nextTrackOrdinal,
        nextKeyframeOrdinal: typed.nextKeyframeOrdinal,
        selectedTrackId: null,
        selectedKeyframeId: null,
      });
    },
  });

  const unsubscribe = useAnimationStore.subscribe((state, previous) => {
    if (
      state.tracks !== previous.tracks ||
      state.duration !== previous.duration
    ) {
      history.notifyChange();
    }
  });

  return () => {
    unsubscribe();
    unregister();
  };
}
