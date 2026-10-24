import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { initRuntimeFromDisk } from "../../test/initRuntime";
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
  neutralInputs: {} as Record<string, number>,
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
  // Read imperatively, not subscribed: the dialog opens at the playhead but
  // must not re-render while it moves.
  getCurrentPlayheadTime: () => animationState.currentTime,
}));

/** Set to make the next sampling fail, as the animation module would. */
const sampling = { fail: false, calls: 0 };

vi.mock("../../poseRig/poseFromClip", async () => {
  const actual = await vi.importActual<
    typeof import("../../poseRig/poseFromClip")
  >("../../poseRig/poseFromClip");
  return {
    ...actual,
    poseFromClipAtTime: (
      options: Parameters<typeof actual.poseFromClipAtTime>[0],
    ) => {
      sampling.calls += 1;
      return sampling.fail
        ? Promise.reject(new Error("the animation module refused the seek"))
        : actual.poseFromClipAtTime(options);
    },
  };
});

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

/** Waits for the animation module's answer: the pose is sampled
 * asynchronously. */
async function sampled() {
  await waitFor(() =>
    expect(screen.queryByTestId("save-pose-sampling")).toBeNull(),
  );
}

async function openDialog() {
  fireEvent.click(trigger());
  await sampled();
}

async function chooseEveryInput() {
  fireEvent.click(screen.getByRole("radio", { name: /every input/i }));
  await sampled();
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

beforeAll(initRuntimeFromDisk);

beforeEach(() => {
  sampling.fail = false;
  sampling.calls = 0;
  animationState.tracks = [];
  animationState.duration = 2;
  animationState.currentTime = 0;
  poseState.standardInputs = [];
  poseState.currentValues = {};
  poseState.neutralInputs = {};
  poseState.createPoseFromValues.mockClear();
});

// Auto-cleanup only runs when Vitest globals are enabled, and this project
// does not enable them — without this, each render stacks another copy of the
// component in the same document.
afterEach(cleanup);

describe("SavePoseFromPlayhead", () => {
  it("is disabled with no tracks to sample", async () => {
    render(<SavePoseFromPlayhead clipName="Wave" />);
    expect(trigger().disabled).toBe(true);
  });

  it("names the pose from the clip and the playhead time", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0 }])];
    animationState.currentTime = 1.5;
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    expect(poseNameInput().value).toBe("Wave @ 1.500s");
  });

  it("names the pose in frames when the timeline is in frames", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0 }])];
    animationState.currentTime = 1;
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" timeDisplayMode="frames" />);
    await openDialog();

    expect(poseNameInput().value).toBe("Wave @ 32f");
  });

  it("saves values sampled at the playhead, not the current slider values", async () => {
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
    await openDialog();
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.5 });
  });

  it("captures only the animated inputs by default", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }, { id: "brow_raise" }];
    poseState.currentValues = { jaw_open: 0.9, brow_raise: 0.4 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.25 });
  });

  it("pins every input when the scope is all", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }, { id: "brow_raise" }];
    poseState.currentValues = { jaw_open: 0.9, brow_raise: 0.4 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();
    await chooseEveryInput();
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.25, brow_raise: 0.4 });
  });

  it("reports tracks whose input this face does not have", async () => {
    animationState.tracks = [
      track("jaw_open", [{ time: 0, value: 0.25 }]),
      track("from_other_rig", [{ time: 0, value: 1 }]),
    ];
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    // Compiled channels have no leading slash; that is the canonical form
    // every other consumer sees, so it is what the warning shows.
    expect(screen.getByTestId("save-pose-unresolved").textContent).toContain(
      "propsrig/from_other_rig",
    );

    fireEvent.click(confirmButton());
    expect(savedValues()).toEqual({ jaw_open: 0.25 });
  });

  it("keeps the time it opened at when the playhead moves on", async () => {
    animationState.tracks = [
      track("jaw_open", [
        { time: 0, value: 0 },
        { time: 2, value: 1 },
      ]),
    ];
    animationState.currentTime = 1;
    poseState.standardInputs = [{ id: "jaw_open" }];

    const { rerender } = render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    // Playback continues underneath the open dialog.
    animationState.currentTime = 2;
    rerender(<SavePoseFromPlayhead clipName="Wave" />);

    fireEvent.click(confirmButton());
    expect(savedValues()).toEqual({ jaw_open: 0.5 });
  });

  it("reports the saved pose to the caller", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }];
    const onSaved = vi.fn();

    render(<SavePoseFromPlayhead clipName="Wave" onSaved={onSaved} />);
    await openDialog();
    fireEvent.click(confirmButton());

    expect(onSaved).toHaveBeenCalledWith({
      poseId: "pose_saved",
      name: "Wave @ 0.000s",
    });
  });

  it("cannot save when no track resolves to a known input", async () => {
    animationState.tracks = [track("from_other_rig", [{ time: 0, value: 1 }])];
    poseState.standardInputs = [{ id: "jaw_open" }];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    expect(confirmButton().disabled).toBe(true);
  });
});

describe("SavePoseFromPlayhead when sampling fails", () => {
  it("says so and cannot save, rather than sampling for good", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }];
    sampling.fail = true;

    render(<SavePoseFromPlayhead clipName="Wave" />);
    fireEvent.click(trigger());

    const failed = await screen.findByTestId("save-pose-failed");
    expect(failed.textContent).toContain("refused the seek");
    expect(screen.queryByTestId("save-pose-sampling")).toBeNull();
    expect(confirmButton().disabled).toBe(true);
  });
});

describe("SavePoseFromPlayhead resampling", () => {
  it("does not resample the animated scope when a slider moves", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [{ id: "jaw_open" }, { id: "brow_raise" }];
    poseState.currentValues = { brow_raise: 0.4 };

    const { rerender } = render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();
    const calls = sampling.calls;

    poseState.currentValues = { brow_raise: 0.6 };
    rerender(<SavePoseFromPlayhead clipName="Wave" />);
    await sampled();

    expect(sampling.calls).toBe(calls);
  });
});

describe("SavePoseFromPlayhead at-neutral filtering", () => {
  it("leaves out animated inputs resting at neutral", async () => {
    animationState.tracks = [
      track("jaw_open", [{ time: 0, value: 0.25 }]),
      // Animated, but not displaced at this frame.
      track("brow_raise", [{ time: 0, value: 0 }]),
    ];
    poseState.standardInputs = [
      { id: "jaw_open", defaultValue: 0 },
      { id: "brow_raise", defaultValue: 0 },
    ];

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    expect(screen.getByTestId("save-pose-neutral-note").textContent).toContain(
      "1 of 2",
    );

    fireEvent.click(confirmButton());
    expect(savedValues()).toEqual({ jaw_open: 0.25 });
  });

  it("compares against a non-zero neutral from the rig, not zero", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.5 }])];
    poseState.standardInputs = [{ id: "jaw_open", defaultValue: 0 }];
    // The rig's captured neutral wins over the input's declared default.
    poseState.neutralInputs = { jaw_open: 0.5 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    expect(confirmButton().disabled).toBe(true);
  });

  it("falls back to the input default when neutral was never captured", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.2 }])];
    poseState.standardInputs = [{ id: "jaw_open", defaultValue: 0.2 }];
    poseState.neutralInputs = {};

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();

    expect(confirmButton().disabled).toBe(true);
  });
});

describe("SavePoseFromPlayhead scope counts", () => {
  it("captures every catalog input when the pose rig mirror is empty", async () => {
    // `currentValues` is a filtered mirror of the binding store and is empty
    // on a face with no pose rig, so "every input" used to read (0) and save
    // nothing at all.
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [
      { id: "jaw_open", defaultValue: 0 },
      { id: "brow_raise", defaultValue: 0.3 },
    ];
    poseState.currentValues = {};

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();
    await chooseEveryInput();
    fireEvent.click(confirmButton());

    // The clip's value wins; the untouched input falls back to its default.
    expect(savedValues()).toEqual({ jaw_open: 0.25, brow_raise: 0.3 });
  });

  it("prefers a live value over the declared default", async () => {
    animationState.tracks = [track("jaw_open", [{ time: 0, value: 0.25 }])];
    poseState.standardInputs = [
      { id: "jaw_open", defaultValue: 0 },
      { id: "brow_raise", defaultValue: 0.3 },
    ];
    poseState.currentValues = { brow_raise: 0.9 };

    render(<SavePoseFromPlayhead clipName="Wave" />);
    await openDialog();
    await chooseEveryInput();
    fireEvent.click(confirmButton());

    expect(savedValues()).toEqual({ jaw_open: 0.25, brow_raise: 0.9 });
  });
});
