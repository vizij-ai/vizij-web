import {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
  type AnimationClipLike,
} from "@vizij/studio-support";

export type HostAnimationFallbackClipState = {
  id: string;
  time: number;
  duration: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
  resolve: (() => void) | null;
  completion: Promise<void> | null;
};

export type HostAnimationFallbackAdvanceResult = {
  activeCount: number;
  completedIds: string[];
  removedIds: string[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function resolveFallbackClipDuration(clip: unknown, fallbackDuration: number) {
  const candidate = isObject(clip) && isObject(clip.clip) ? clip.clip : clip;
  return resolveClipDurationSeconds(
    candidate as AnimationClipLike | undefined,
    fallbackDuration,
  );
}

function resolveFallbackCompletion(state: HostAnimationFallbackClipState) {
  state.resolve?.();
  state.resolve = null;
  state.completion = null;
}

export function createHostAnimationFallbackPlayback<TClip>(args: {
  resolveClipById: (id: string) => TClip | null | undefined;
  writeClipOutputs: (
    clip: TClip,
    state: HostAnimationFallbackClipState,
  ) => void;
  clearClipOutputs: (id: string) => void;
  resolveClipPromise?: (state: HostAnimationFallbackClipState) => void;
  resolveClipDuration?: (clip: TClip, fallbackDuration: number) => number;
}) {
  const resolveClipPromise =
    args.resolveClipPromise ?? resolveFallbackCompletion;
  const resolveClipDuration =
    args.resolveClipDuration ?? resolveFallbackClipDuration;

  return {
    advance({
      states,
      dt,
      hostOwnsClipOutputs,
      animationSystemActive,
    }: {
      states: Map<string, HostAnimationFallbackClipState>;
      dt: number;
      hostOwnsClipOutputs: boolean;
      animationSystemActive: boolean;
    }): HostAnimationFallbackAdvanceResult {
      const completedIds: string[] = [];
      const removedIds: string[] = [];
      const toDelete: string[] = [];

      states.forEach((state, key) => {
        const clip = args.resolveClipById(state.id);
        if (!clip) {
          toDelete.push(key);
          removedIds.push(key);
          resolveClipPromise(state);
          return;
        }

        state.duration = resolveClipDuration(clip, state.duration);

        const { time, completed } = advanceClipTime(
          {
            time: state.time,
            duration: state.duration,
            speed: state.speed,
            loop: state.loop,
            playing: state.playing,
          },
          dt,
        );
        state.time = clampAnimationTime(time, state.duration);

        if (hostOwnsClipOutputs && (state.playing || completed)) {
          args.writeClipOutputs(clip, state);
        }

        if (completed) {
          toDelete.push(key);
          completedIds.push(key);
          resolveClipPromise(state);
        }
      });

      toDelete.forEach((key) => {
        states.delete(key);
        if (hostOwnsClipOutputs && animationSystemActive) {
          args.clearClipOutputs(key);
        }
      });

      return { activeCount: states.size, completedIds, removedIds };
    },
  };
}
