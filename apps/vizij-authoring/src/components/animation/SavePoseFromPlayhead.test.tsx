import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SavePoseFromPlayhead } from "./SavePoseFromPlayhead";

/**
 * The behaviour worth guarding is that the pose holds the values *the clip
 * produces at the playhead*, not the pose store's `currentValues`. Those two
 * are easy to confuse — `capturePose` reads the latter, and it only changes
 * when an Inputs slider moves — so a wiring mistake here would save stale
 * slider positions and still look like it worked.
 */

interface MockTrack {
  id: string;
  label: string;
  variableId: string;
  channel: string;
  color: string;
  interpolation: "linear";
  detached?: boolean;
  keyframes: { id: string; time: number; value: number }[];
}

const animationState = {
  tracks: [] as MockTrack[],
  duration: 2,
  currentTime: 0,
};

const poseState = {
  standardInputs: [] as { id: string; defaultValue?: number }[],
  currentValues: {} as Record<string, number>,
  createPoseFromValues: vi.fn(
    (_options: {
      name?: string;
      group?: string | null;
      values: Record<string, number>;
    }) => "pose_saved" as string | null,
  ),
};

vi.mock("../../state/animationStore", () => ({
  useAnimationStore: (selector?: (s: typeof animationState) => unknown) =>
    selector ? selector(animationState) : animationState,
}));

vi.mock("../../poseRig/store", () => ({
  usePoseRigStore: (selector: (s: typeof poseState) => unknown) =>
    selector(poseState),
}));

function track(
  variableId: string,
  keyframes: { time: number; value: number }[],
  extra: Partial<MockTrack> = {},
): MockTrack {
  return {
    id: `track-${variableId}`,
    label: variableId,
    variableId,
    channel: `/propsrig/${variableId}`,
    color: "#fff",
    interpolation: "linear",
    keyframes: keyframes.map((keyframe, index) => ({
      id: `kf-${variableId}-${index}`,
      ...keyframe,
    })),
    ...extra,
  };
}

function trigger(): HTMLButtonElement {
  return screen.getByTestId("save-pose-from-playhead") as HTMLButtonElement;
}

function confirmButton(): HTMLButtonElement {
  return screen.getByTestId("save-pose-confirm") as HTMLButtonElement;
}

function openDialog() {
  fireEvent.click(trigger());
}

function poseNameInput(): HTMLInputElement {
  return screen.getByLabelText("Pose name") as HTMLInputElement;
}

function savedValues(): Record<string, number> {
  const call = poseState.createPoseFromValues.mock.calls.at(-1);
  if (!call) {
    throw new Error("createPoseFromValues was never called");
  }
  return call[0].values;
}

beforeEach(() => {
  animationState.tracks = [];
  animationState.duration = 2;
  animationState.currentTime = 0;
  poseState.standardInputs = [];
  poseState.currentValues = {};
  poseState.createPoseFromValues.mockClear();
});

// Auto-cleanup only runs when Vitest globals are enabled, and this project
// does not enable them — without this, each render stacks another copy of the
// component in the same document.
afterEach(cleanup);

describe("SavePoseFromPlayhead", () => {
  it("is disabled with no tracks to sample", () => {
    render(<SavePoseFromPlayhead clipName="Wave" />);
    expect(trigger().disabled).toBe(true);
  });

  it("names the pose from the clip and the playhead time", () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0 }])];
    animationState.currentTime = 1.5;
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();

    expect(poseNameInput().value).toBe("Wave @ 1.500s");
  });

  it("names the pose in frames when the timeline is in frames", () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0 }])];
    animationState.currentTime = 1;
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" timeDisplayMode="frames" />);
    openDialog();

    expect(poseNameInput().value).toBe("Wave @ 32f");
  });

  it("saves values sampled at the playhead, not the current slider values", () => {
    animationState.tracks = [
      track("jaw_open", [
        { time: 0, value: 0 },
        { time: 2, value: 1 },
      ]),
    ];
    animationState.currentTime = 1;
    poseState.standardInputs = [{ id: "jaw_open" }];
    // What `capturePose` would have recorded. The clip says 0.5 here.
    poseState.currentValues = { jaw_open: 0.9 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.5 });
  });

  it("captures only the animated inputs by default", () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }, { id: "brow_raise" }];
    poseState.currentValues = { jaw_open: 0.9, brow_raise: 0.4 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.25 });
  });

  it("pins every input when the scope is all", () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }, { id: "brow_raise" }];
    poseState.currentValues = { jaw_open: 0.9, brow_raise: 0.4 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();
    fireEvent.click(screen.getByRole("radio", { name: /every input/i }));
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.25, brow_raise: 0.4 });
  });

  it("reports tracks whose input this face does not have", () => {
    animationState.tracks = [
      track("jaw_open", [{ time: 0, value: 0.25 }]),
      track("from_other_rig", [{ time: 0, value: 1 }]),
    ];
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();

    // Compiled channels have no leading slash; that is the canonical form
    // every other consumer sees, so it is what the warning shows.
    expect(screen.getByTestId("save-pose-unresolved").textContent).toContain(
      "propsrig/from_other_rig",
    );

    fireEvent.click(confirmButton());
    expect(savedValues()).toEqual({ jaw_open: 0.25 });
  });

  it("keeps the time it opened at when the playhead moves on", () => {
    animationState.tracks = [
      track("jaw_open", [
        { time: 0, value: 0 },
        { time: 2, value: 1 },
      ]),
    ];
    animationState.currentTime = 1;
    poseState.standardInputs = [{ id: "jaw_open" }];

    const { rerender } = render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();

    // Playback continues underneath the open dialog.
    animationState.currentTime = 2;
    rerender(<SavePoseFromPlayhead clipName="Wave" />);

    fireEvent.click(confirmButton());
    expect(savedValues()).toEqual({ jaw_open: 0.5 });
  });

  it("reports the saved pose to the caller", () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }];
    const onSaved = vi.fn();

    render(<SavePoseFromPlayhead clipName="Wave" onSaved={onSaved} />);
    openDialog();
    fireEvent.click(confirmButton());

    expect(onSaved).toHaveBeenCalledWith({
      poseId: "pose_saved",
      name: "Wave @ 0.000s",
    });
  });

  it("cannot save when no track resolves to a known input", () => {
    animationState.tracks = [track("from_other_rig", [{ time: 0, value: 1 }])];
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    openDialog();

    expect(confirmButton().disabled).toBe(true);
  });
});
