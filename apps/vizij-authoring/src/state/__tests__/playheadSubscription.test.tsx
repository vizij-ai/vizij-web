import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { useCallback } from "react";
import { useAnimationStore, getCurrentPlayheadTime } from "../animationStore";

/**
 * The playhead moves 60 times a second during playback. Anything that
 * *subscribes* to it re-renders 60 times a second, and any `useCallback`
 * that lists it as a dependency gets a new identity 60 times a second —
 * which invalidates every memo downstream of it.
 *
 * Most readers of the playhead are event handlers: "insert a key here",
 * "save this frame as a pose", "start playing from here". They want the value
 * at the moment they fire, not a subscription. These tests pin that
 * distinction, because the cost of getting it wrong is invisible — the code
 * is correct either way, it just re-renders the app on every frame.
 */

afterEach(cleanup);

beforeEach(() => {
  useAnimationStore.setState({ currentTime: 0 });
});

// Each tick is flushed separately: batching them into one act() would make a
// component that re-renders on every frame look like it re-rendered once, and
// the "does not re-render" assertions below would pass against the bug.
function advancePlayhead(times: number) {
  for (let index = 1; index <= times; index += 1) {
    act(() => {
      useAnimationStore.setState({ currentTime: index / 60 });
    });
  }
}

describe("reading the playhead from an event handler", () => {
  it("does not re-render, and does not churn the handler's identity", () => {
    let renders = 0;
    const handlers = new Set<() => number>();

    function Consumer() {
      renders += 1;
      // The shape every playhead-reading event handler should have.
      const insertKeyHere = useCallback(() => getCurrentPlayheadTime(), []);
      handlers.add(insertKeyHere);
      return null;
    }

    render(<Consumer />);
    expect(renders).toBe(1);

    advancePlayhead(60);

    expect(renders).toBe(1);
    expect(handlers.size).toBe(1);
  });

  it("still reads the live value when it fires", () => {
    let read: (() => number) | null = null;

    function Consumer() {
      const insertKeyHere = useCallback(() => getCurrentPlayheadTime(), []);
      read = insertKeyHere;
      return null;
    }

    render(<Consumer />);
    advancePlayhead(30);

    expect(read).not.toBeNull();
    expect(read!()).toBeCloseTo(0.5, 10);
  });
});

describe("subscribing to the playhead", () => {
  it("re-renders on every tick — which is why only clocks may do it", () => {
    let renders = 0;

    function Clock() {
      renders += 1;
      useAnimationStore((state) => state.currentTime);
      return null;
    }

    render(<Clock />);
    advancePlayhead(10);

    expect(renders).toBe(11);
  });
});
