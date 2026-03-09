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
});
