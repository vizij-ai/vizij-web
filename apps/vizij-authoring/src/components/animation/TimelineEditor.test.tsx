import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatKeyframeTime } from "../../utils/animationTimeDisplay";
import { TimelineEditor } from "./TimelineEditor";

/**
 * Guards the interaction that broke when `TrackRow` stopped calling
 * `stopPropagation` so row clicks could seek: the tracks container's deselect
 * handler fired for *any* descendant click, so selecting a track immediately
 * deselected it again — and double-click-to-add-keyframe bails on an empty
 * selection, so it went dead.
 */

const state = {
  tracks: [
    {
      id: "track-1",
      label: "Jaw Open",
      variableId: "jaw.open",
      channel: "/propsrig/jaw/open",
      color: "#fff",
      interpolation: "linear" as const,
      keyframes: [{ id: "kf-1", time: 0.25, value: 0.5 }],
    },
  ],
  duration: 1,
  currentTime: 0,
  selectedTrackId: "track-1" as string | null,
  selectedKeyframeId: null as string | null,
  transportPlaybackState: "stopped" as const,
  selectTrack: vi.fn(),
  selectKeyframe: vi.fn(),
  seek: vi.fn(),
  addKeyframe: vi.fn(),
  updateKeyframe: vi.fn(),
  removeKeyframe: vi.fn(),
  setScrubbing: vi.fn(),
};

vi.mock("../../state/animationStore", async () => {
  // The real evaluator: insert-at-time must agree with what the curve
  // actually plays, so faking it would hide exactly the bug under test.
  const actual = await vi.importActual<
    typeof import("../../state/animationStore")
  >("../../state/animationStore");
  return {
    evaluateTrack: actual.evaluateTrack,
    useAnimationStore: (selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock("../../state/bindingAuthoringStore", () => {
  const store = { standardInputsById: new Map() };
  const hook = (selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store;
  return { useBindingAuthoring: hook, useBindingAuthoringStore: hook };
});

const DEFAULT_TRACKS = state.tracks;

beforeEach(() => {
  // `state` is a mutable module-level object the mock reads through, so a test
  // that changes tracks or the playhead would otherwise leak into the next.
  state.tracks = DEFAULT_TRACKS;
  state.duration = 1;
  state.currentTime = 0;
  state.selectedTrackId = "track-1";
  state.selectedKeyframeId = null;
  state.selectTrack.mockClear();
  state.selectKeyframe.mockClear();
  state.seek.mockClear();
  state.addKeyframe.mockClear();
  state.updateKeyframe.mockClear();
  state.removeKeyframe.mockClear();
  state.setScrubbing.mockClear();
});

// Auto-cleanup only runs with Vitest globals enabled, and this project does
// not enable them — without this, each render stacks another timeline in the
// same document and every query finds two.
afterEach(cleanup);

describe("TimelineEditor selection", () => {
  it("keeps the track selected when a track row is clicked", () => {
    render(<TimelineEditor />);
    state.selectTrack.mockClear();

    fireEvent.click(screen.getByText("Jaw Open"));

    // The row selects it; nothing must clear it on the way up.
    expect(state.selectTrack).toHaveBeenCalledWith("track-1");
    expect(state.selectTrack).not.toHaveBeenCalledWith(null);
  });

  it("still deselects when the empty area itself is clicked", () => {
    const view = render(<TimelineEditor />);
    state.selectTrack.mockClear();

    const container = view.container.querySelector(
      ".custom-scrollbar",
    ) as HTMLElement;
    fireEvent.click(container);

    expect(state.selectTrack).toHaveBeenCalledWith(null);
  });
});

describe("TimelineEditor keyframe insert", () => {
  function insertAt(fraction: number) {
    const view = render(<TimelineEditor />);
    state.addKeyframe.mockClear();
    const root = view.container.firstChild as HTMLElement;
    // 192px track header, then the track area spans `duration`.
    const headerWidth = 192;
    const trackWidth = 400;
    root.getBoundingClientRect = () =>
      ({
        left: 0,
        width: headerWidth + trackWidth,
      }) as DOMRect;
    fireEvent.doubleClick(root, {
      clientX: headerWidth + trackWidth * fraction,
    });
    return view;
  }

  it("inserts at the curve's value, so adding a key does not change the motion", () => {
    // The bug: it wrote the input's *default* instead, putting a step into
    // every curve not already resting there.
    state.tracks = [
      {
        id: "track-1",
        label: "Jaw Open",
        variableId: "jaw.open",
        channel: "/propsrig/jaw/open",
        color: "#fff",
        interpolation: "linear" as const,
        keyframes: [
          { id: "kf-1", time: 0, value: 0.2 },
          { id: "kf-2", time: 1, value: 0.8 },
        ],
      },
    ];
    state.duration = 1;

    insertAt(0.5);

    expect(state.addKeyframe).toHaveBeenCalledTimes(1);
    const [, time, value] = state.addKeyframe.mock.calls[0]!;
    expect(time).toBeCloseTo(0.5, 6);
    expect(value).toBeCloseTo(0.5, 6);
  });

  it("falls back to the input default on a track with no curve yet", () => {
    state.tracks = [
      {
        id: "track-1",
        label: "Jaw Open",
        variableId: "jaw.open",
        channel: "/propsrig/jaw/open",
        color: "#fff",
        interpolation: "linear" as const,
        keyframes: [],
      },
    ];
    state.duration = 1;

    insertAt(0.5);

    expect(state.addKeyframe).toHaveBeenCalledTimes(1);
    expect(state.addKeyframe.mock.calls[0]![2]).toBe(0);
  });
});

describe("TimelineEditor toolbar", () => {
  function timeField(): HTMLInputElement {
    return screen.getByTestId("timeline-current-time") as HTMLInputElement;
  }

  it("adds a key at the playhead from a labelled button", () => {
    // Double-click was the only way to add a keyframe, and nothing said so.
    state.tracks = [
      {
        id: "track-1",
        label: "Jaw Open",
        variableId: "jaw.open",
        channel: "/propsrig/jaw/open",
        color: "#fff",
        interpolation: "linear" as const,
        keyframes: [
          { id: "kf-1", time: 0, value: 0.2 },
          { id: "kf-2", time: 1, value: 0.8 },
        ],
      },
    ];
    state.duration = 1;
    state.currentTime = 0.5;
    state.selectedTrackId = "track-1";

    render(<TimelineEditor />);
    state.addKeyframe.mockClear();
    fireEvent.click(screen.getByTestId("timeline-add-key"));

    const [trackId, time, value] = state.addKeyframe.mock.calls[0]!;
    expect(trackId).toBe("track-1");
    expect(time).toBeCloseTo(0.5, 6);
    // Value-preserving, exactly like the double-click path it shares.
    expect(value).toBeCloseTo(0.5, 6);
  });

  it("disables Add Key with no track selected, and says why", () => {
    state.selectedTrackId = null;
    render(<TimelineEditor />);
    const button = screen.getByTestId("timeline-add-key") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toContain("Select a track");
  });

  it("seeks to a typed time on Enter", () => {
    state.duration = 5;
    state.currentTime = 0;
    render(<TimelineEditor />);
    state.seek.mockClear();

    fireEvent.change(timeField(), { target: { value: "2.25" } });
    fireEvent.keyDown(timeField(), { key: "Enter" });

    expect(state.seek).toHaveBeenCalledTimes(1);
    expect(state.seek.mock.calls[0]![0]).toBeCloseTo(2.25, 6);
  });

  it("clamps a typed time past the end to the clip duration", () => {
    state.duration = 5;
    render(<TimelineEditor />);
    state.seek.mockClear();

    fireEvent.change(timeField(), { target: { value: "99" } });
    fireEvent.blur(timeField());

    expect(state.seek.mock.calls[0]![0]).toBeCloseTo(5, 6);
  });

  it("leaves the playhead alone when the typed time is unreadable", () => {
    // Snapping to zero on a typo loses the author's place for no reason.
    state.duration = 5;
    render(<TimelineEditor />);
    state.seek.mockClear();

    fireEvent.change(timeField(), { target: { value: "abc" } });
    fireEvent.keyDown(timeField(), { key: "Enter" });

    expect(state.seek).not.toHaveBeenCalled();
  });

  it("abandons the draft on Escape", () => {
    state.duration = 5;
    state.currentTime = 1;
    render(<TimelineEditor />);
    state.seek.mockClear();

    fireEvent.change(timeField(), { target: { value: "4" } });
    fireEvent.keyDown(timeField(), { key: "Escape" });

    expect(state.seek).not.toHaveBeenCalled();
    // Back to showing the real playhead, not the abandoned text.
    expect(timeField().value).toBe(formatKeyframeTime(1, "seconds"));
  });

  it("renders the playhead actions it is given", () => {
    render(
      <TimelineEditor
        playheadActions={<button type="button">Save Frame as Pose</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Save Frame as Pose" }),
    ).toBeTruthy();
  });
});

describe("TimelineEditor keyboard shortcuts", () => {
  function press(key: string, target?: Element) {
    fireEvent.keyDown(target ?? document.body, { key });
  }

  it("toggles playback on Space", () => {
    const onTogglePlay = vi.fn();
    render(<TimelineEditor onTogglePlay={onTogglePlay} />);
    press(" ");
    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("steps a frame each way on the arrow keys", () => {
    const onStep = vi.fn();
    render(<TimelineEditor onStep={onStep} />);
    press("ArrowRight");
    press("ArrowLeft");
    expect(onStep.mock.calls.map(([direction]) => direction)).toEqual([1, -1]);
  });

  it("deletes the selected keyframe", () => {
    state.selectedTrackId = "track-1";
    state.selectedKeyframeId = "kf-1";
    render(<TimelineEditor />);
    press("Delete");
    expect(state.removeKeyframe).toHaveBeenCalledWith("track-1", "kf-1");
  });

  it("does nothing on Delete with no keyframe selected", () => {
    state.selectedTrackId = "track-1";
    state.selectedKeyframeId = null;
    render(<TimelineEditor />);
    press("Delete");
    expect(state.removeKeyframe).not.toHaveBeenCalled();
  });

  it("jumps to the ends on Home and End", () => {
    state.duration = 4;
    render(<TimelineEditor />);
    press("Home");
    press("End");
    expect(state.seek.mock.calls.map(([time]) => time)).toEqual([0, 4]);
  });

  it("leaves keys alone while a field has focus", () => {
    // The toolbar's own time field is the obvious way to break this: typing a
    // time must not scrub, and Delete must not remove a keyframe.
    const onTogglePlay = vi.fn();
    state.selectedTrackId = "track-1";
    state.selectedKeyframeId = "kf-1";
    render(<TimelineEditor onTogglePlay={onTogglePlay} />);

    const field = screen.getByTestId("timeline-current-time");
    press(" ", field);
    press("Delete", field);

    expect(onTogglePlay).not.toHaveBeenCalled();
    expect(state.removeKeyframe).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const onTogglePlay = vi.fn();
    const view = render(<TimelineEditor onTogglePlay={onTogglePlay} />);
    view.unmount();
    press(" ");
    expect(onTogglePlay).not.toHaveBeenCalled();
  });
});

describe("TimelineEditor scrub ownership", () => {
  function ruler(view: ReturnType<typeof render>): HTMLElement {
    return view.container.querySelector(".cursor-ew-resize") as HTMLElement;
  }

  /**
   * jsdom's synthetic pointer events drop `button`, so `fireEvent.pointerDown`
   * arrives with it undefined and the handler's primary-button guard rejects
   * it. A MouseEvent named `pointerdown` carries the field and still reaches
   * React's `onPointerDown`.
   */
  function pointerDown(target: HTMLElement, button: number, clientX: number) {
    target.dispatchEvent(
      new MouseEvent("pointerdown", { button, clientX, bubbles: true }),
    );
  }

  it("claims the clock for the whole drag and releases it after", () => {
    // The runtime feedback loop writes `currentTime` every frame from what the
    // engine reports, so without this the scrub was undone a frame after it
    // landed: the playhead snapped back and the readout never moved.
    const view = render(<TimelineEditor />);
    const target = ruler(view);

    pointerDown(target, 0, 300);
    expect(state.setScrubbing).toHaveBeenCalledWith(true);
    // Claimed before the first seek, not after it.
    expect(state.setScrubbing.mock.invocationCallOrder[0]).toBeLessThan(
      state.seek.mock.invocationCallOrder[0] ?? Infinity,
    );

    fireEvent.pointerUp(window);
    expect(state.setScrubbing).toHaveBeenLastCalledWith(false);
  });

  it("releases the clock if it unmounts mid-drag", () => {
    // Otherwise the feedback loop stays deferred for the rest of the session.
    const view = render(<TimelineEditor />);
    pointerDown(ruler(view), 0, 300);
    state.setScrubbing.mockClear();

    view.unmount();
    expect(state.setScrubbing).toHaveBeenCalledWith(false);
  });

  it("ignores a non-primary button, which is not a scrub", () => {
    const view = render(<TimelineEditor />);
    pointerDown(ruler(view), 2, 300);
    expect(state.setScrubbing).not.toHaveBeenCalled();
  });
});
