import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
};

vi.mock("../../state/animationStore", () => ({
  useAnimationStore: (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state,
}));

vi.mock("../../state/bindingAuthoringStore", () => {
  const store = { standardInputsById: new Map() };
  const hook = (selector?: (s: typeof store) => unknown) =>
    selector ? selector(store) : store;
  return { useBindingAuthoring: hook, useBindingAuthoringStore: hook };
});

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
