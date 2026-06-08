import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurveEditor } from "./CurveEditor";

const animationStoreState: {
  tracks: any[];
  duration: number;
  currentTime: number;
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  selectedCurveItem:
    | { kind: "keyframe"; keyframeId: string }
    | { kind: "segment"; segmentIndex: number }
    | { kind: "handle"; segmentIndex: number; side: "out" | "in" }
    | null;
  selectTrack: ReturnType<typeof vi.fn>;
  selectKeyframe: ReturnType<typeof vi.fn>;
  selectCurveItem: ReturnType<typeof vi.fn>;
  updateKeyframe: ReturnType<typeof vi.fn>;
  updateSegmentHandle: ReturnType<typeof vi.fn>;
  setSegmentInterpolation: ReturnType<typeof vi.fn>;
} = {
  tracks: [],
  duration: 1,
  currentTime: 0,
  selectedTrackId: null,
  selectedKeyframeId: null,
  selectedCurveItem: null,
  selectTrack: vi.fn(),
  selectKeyframe: vi.fn(),
  selectCurveItem: vi.fn(),
  updateKeyframe: vi.fn(),
  updateSegmentHandle: vi.fn(),
  setSegmentInterpolation: vi.fn(),
};

vi.mock("../../state/animationStore", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../state/animationStore")>();
  return {
    ...actual,
    useAnimationStore: (
      selector?: (state: typeof animationStoreState) => unknown,
    ) => (selector ? selector(animationStoreState) : animationStoreState),
  };
});

const bindingState = {
  standardInputsById: new Map(),
};

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
}));

describe("CurveEditor", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    animationStoreState.duration = 1;
    animationStoreState.currentTime = 0.25;
    animationStoreState.selectedTrackId = "track-1";
    animationStoreState.selectedKeyframeId = "kf-1";
    animationStoreState.selectedCurveItem = {
      kind: "keyframe",
      keyframeId: "kf-1",
    };
    animationStoreState.tracks = [
      {
        id: "track-1",
        label: "Gaze Left Right",
        variableId: "gaze.left_right",
        channel: "rig/quori_latest/gaze/left_right",
        color: "#60a5fa",
        interpolation: "linear",
        keyframes: [
          { id: "kf-1", time: 0, value: 0 },
          { id: "kf-2", time: 1, value: 1 },
        ],
      },
    ];
    bindingState.standardInputsById = new Map([
      [
        "gaze.left_right",
        {
          id: "gaze.left_right",
          label: "Gaze Left Right",
          defaultValue: 0,
          range: { min: -1, max: 1 },
        },
      ],
    ]);
  });

  it("renders a baked preview path and applies cubic preset handles", () => {
    render(<CurveEditor />);

    expect(screen.getByTestId("animation-curve-editor")).toBeTruthy();
    expect(screen.getByTestId("animation-baked-preview-path")).toBeTruthy();

    fireEvent.change(
      screen.getByTestId("animation-curve-segment-mode-select"),
      {
        target: { value: "cubic" },
      },
    );

    expect(animationStoreState.setSegmentInterpolation).toHaveBeenCalledWith(
      "track-1",
      0,
      "cubic",
      {
        outHandle: { x: 0.65, y: 0 },
        inHandle: { x: -0.65, y: 0 },
      },
    );
    expect(animationStoreState.selectCurveItem).toHaveBeenCalledWith({
      kind: "segment",
      segmentIndex: 0,
    });
  });

  it("applies step hold handles when switching a segment to step", () => {
    render(<CurveEditor />);

    fireEvent.change(
      screen.getByTestId("animation-curve-segment-mode-select"),
      {
        target: { value: "step" },
      },
    );

    expect(animationStoreState.setSegmentInterpolation).toHaveBeenCalledWith(
      "track-1",
      0,
      "step",
      {
        outHandle: { x: 0.98, y: 0 },
        inHandle: { x: -0.02, y: -1 },
      },
    );
  });

  it("selects a segment when clicking a curve segment", () => {
    render(<CurveEditor />);

    fireEvent.mouseDown(
      screen.getByTestId("animation-curve-segment-hit-area"),
      {
        button: 0,
      },
    );

    expect(animationStoreState.selectTrack).toHaveBeenCalledWith("track-1");
    expect(animationStoreState.selectCurveItem).toHaveBeenCalledWith({
      kind: "segment",
      segmentIndex: 0,
    });
  });

  it("writes explicit visual handle edits when dragging a spline handle", () => {
    animationStoreState.tracks[0]!.keyframes = [
      {
        id: "kf-1",
        time: 0,
        value: 0,
        interpolation: "spline",
        outTangent: 1,
      },
      { id: "kf-2", time: 1, value: 1, inTangent: 1 },
    ];

    render(<CurveEditor />);

    const svg = screen
      .getByTestId("animation-curve-editor")
      .querySelector("svg");
    expect(svg).not.toBeNull();
    vi.spyOn(svg!, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 920,
      height: 132,
      right: 920,
      bottom: 132,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(screen.getByTestId("animation-curve-handle-out"), {
      button: 0,
      clientX: 333,
      clientY: 48,
    });
    fireEvent.mouseMove(window, {
      buttons: 1,
      clientX: 430,
      clientY: 26,
    });
    fireEvent.mouseUp(window);

    const handleCall = animationStoreState.updateSegmentHandle.mock.calls.find(
      ([trackId, segmentIndex, side]) =>
        trackId === "track-1" && segmentIndex === 0 && side === "out",
    );
    expect(handleCall).toBeTruthy();
    expect(handleCall?.[3].x).toBeCloseTo(0.448262, 5);
    expect(handleCall?.[3].y).toBeCloseTo(0.908027, 5);
    expect(animationStoreState.selectCurveItem).toHaveBeenCalledWith({
      kind: "handle",
      segmentIndex: 0,
      side: "out",
    });
  });
});
