import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TrackRow } from "./TrackRow";

const animationStoreState: {
  selectKeyframe: ReturnType<typeof vi.fn>;
  selectedKeyframeId: string | null;
  selectTrack: ReturnType<typeof vi.fn>;
  selectedTrackId: string | null;
  updateKeyframe: ReturnType<typeof vi.fn>;
} = {
  selectKeyframe: vi.fn(),
  selectedKeyframeId: null,
  selectTrack: vi.fn(),
  selectedTrackId: null,
  updateKeyframe: vi.fn(),
};

vi.mock("../../state/animationStore", () => ({
  useAnimationStore: (
    selector?: (state: typeof animationStoreState) => unknown,
  ) => (selector ? selector(animationStoreState) : animationStoreState),
}));

/** jsdom has no `PointerEvent`, so pointer events are dispatched as mouse events. */
function dispatchPointer(type: string, clientX: number) {
  window.dispatchEvent(
    new MouseEvent(type, { clientX, bubbles: true }) as unknown as Event,
  );
}

function renderRow() {
  const view = render(
    <TrackRow
      track={{
        id: "track-1",
        label: "Jaw Open",
        variableId: "jaw.open",
        channel: "/propsrig/jaw/open",
        color: "#ffffff",
        interpolation: "linear",
        keyframes: [{ id: "kf-1", time: 0.25, value: 0.5 }],
      }}
      duration={1}
      timeDisplayMode="seconds"
    />,
  );
  // jsdom reports zero-size rects, so the row is given a width for the
  // pointer-x -> time mapping to mean anything.
  const row = view.container.firstElementChild as HTMLElement;
  row.getBoundingClientRect = () =>
    ({ left: 0, width: 192 + 400, top: 0, height: 44 }) as DOMRect;
  return view;
}

describe("TrackRow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    animationStoreState.selectedKeyframeId = null;
    animationStoreState.selectedTrackId = null;
  });

  it("routes track row clicks through the inspect callback", () => {
    const onInspect = vi.fn();

    render(
      <TrackRow
        track={{
          id: "track-1",
          label: "Jaw Open",
          variableId: "jaw.open",
          channel: "/propsrig/jaw/open",
          color: "#ffffff",
          interpolation: "linear",
          keyframes: [
            {
              id: "kf-1",
              time: 0.25,
              value: 0.5,
            },
          ],
        }}
        duration={1}
        timeDisplayMode="seconds"
        onInspect={onInspect}
      />,
    );

    fireEvent.click(screen.getByText("Jaw Open"));
    fireEvent.click(screen.getByTitle(/Time: 0.250s/i));

    expect(animationStoreState.selectTrack).toHaveBeenCalledWith("track-1");
    expect(animationStoreState.selectKeyframe).toHaveBeenCalledWith("kf-1");
    expect(onInspect).toHaveBeenCalledWith("track-1");
  });

  it("does not retime a keyframe on a click that barely moves", () => {
    // Without a threshold, one pixel of travel between press and release
    // committed a time change — and there is no undo to recover it.
    renderRow();
    const key = screen.getAllByTitle(/Time: 0.250s/i)[0]!;

    key.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 300, bubbles: true }),
    );
    dispatchPointer("pointermove", 302);
    dispatchPointer("pointerup", 302);

    expect(animationStoreState.updateKeyframe).not.toHaveBeenCalled();
  });

  it("retimes once the pointer travels past the threshold", () => {
    renderRow();
    const key = screen.getAllByTitle(/Time: 0.250s/i)[0]!;

    key.dispatchEvent(
      new MouseEvent("pointerdown", { clientX: 300, bubbles: true }),
    );
    dispatchPointer("pointermove", 340);

    expect(animationStoreState.updateKeyframe).toHaveBeenCalledWith(
      "track-1",
      "kf-1",
      expect.objectContaining({ time: expect.any(Number) }),
    );
  });
});
