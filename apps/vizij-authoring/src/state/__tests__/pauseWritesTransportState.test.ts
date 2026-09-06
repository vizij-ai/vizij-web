import { beforeEach, describe, expect, it } from "vitest";
import { useAnimationStore } from "../animationStore";

/**
 * Pause has to write the transport state locally, the way stop does.
 *
 * The runtime confirms a pause through the feedback loop, which only runs
 * while frames are being delivered. Relying on that confirmation alone leaves
 * the button reading "Pause" — with no way back to Play — whenever the
 * confirmation is slow or never arrives. Stop never had the problem because
 * it wrote the store itself and let the runtime catch up.
 */

beforeEach(() => {
  useAnimationStore.getState().stop();
});

describe("transport state after pause", () => {
  it("reports paused without waiting for the runtime", () => {
    const store = useAnimationStore.getState();
    store.play();
    expect(useAnimationStore.getState().isPlaying).toBe(true);

    store.pause();

    const state = useAnimationStore.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.transportPlaybackState).toBe("paused");
    // Paused is not stopped: the session stays live so Play resumes in place.
    expect(state.transportActive).toBe(true);
  });

  it("keeps the playhead where it was, unlike stop", () => {
    const store = useAnimationStore.getState();
    store.seek(2.5);
    store.play();
    store.pause();
    expect(useAnimationStore.getState().currentTime).toBeCloseTo(2.5, 10);

    useAnimationStore.getState().stop();
    expect(useAnimationStore.getState().currentTime).toBe(0);
  });
});
