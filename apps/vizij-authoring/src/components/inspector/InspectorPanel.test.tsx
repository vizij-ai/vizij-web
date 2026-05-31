import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveInspectorTarget } from "../../utils/inspectorSelection";
import {
  InspectorPanel,
  type AnimationInspectorSelection,
  type ProgramInspectorSelection,
} from "./InspectorPanel";

vi.mock("../../state/PoseRigProvider", () => ({
  usePoseRig: () => ({
    poses: [],
    neutralInputs: [],
    poseConfigDraft: null,
    blendMode: "add",
    setPoseGroupBlendMode: vi.fn(),
    setPoseGroupNeutralSource: vi.fn(),
    clearPoseGroupNeutralSource: vi.fn(),
    blendStages: [],
    setBlendStageMode: vi.fn(),
    setBlendStageSources: vi.fn(),
    setBlendStageNeutralSource: vi.fn(),
    clearBlendStageNeutralSource: vi.fn(),
    selectPose: vi.fn(),
    selectedPoseId: "",
    standardInputs: [],
  }),
}));

const bindingState = {
  managedStandardInputs: [],
  inputValues: {},
  handleInputValueChange: vi.fn(),
  applyStandardInputBatch: vi.fn(),
  standardInputsById: new Map(),
};

const graphRuntimeState = {
  graphStatus: "ready",
  graphWarning: null,
  graphError: null,
  authoringCompileTarget: null,
  authoringCompileTargets: {
    "runtime-graph": { status: "idle", message: null, signature: null },
    animation: { status: "idle", message: null, signature: null },
    motiongraph: { status: "idle", message: null, signature: null },
  },
};

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
  useGraphRuntime: (selector: (state: typeof graphRuntimeState) => unknown) =>
    selector(graphRuntimeState),
}));

const animationStoreState: {
  tracks: any[];
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  setTrackInterpolation: ReturnType<typeof vi.fn>;
  updateKeyframe: ReturnType<typeof vi.fn>;
  removeTrack: ReturnType<typeof vi.fn>;
  removeKeyframe: ReturnType<typeof vi.fn>;
  selectTrack: ReturnType<typeof vi.fn>;
  selectKeyframe: ReturnType<typeof vi.fn>;
  timeDisplayMode: "seconds";
} = {
  tracks: [],
  selectedTrackId: null,
  selectedKeyframeId: null,
  setTrackInterpolation: vi.fn(),
  updateKeyframe: vi.fn(),
  removeTrack: vi.fn(),
  removeKeyframe: vi.fn(),
  selectTrack: vi.fn(),
  selectKeyframe: vi.fn(),
  timeDisplayMode: "seconds" as const,
};

vi.mock("../../state/animationStore", () => ({
  useAnimationStore: (
    selector: (state: typeof animationStoreState) => unknown,
  ) => selector(animationStoreState),
}));

vi.mock("../../motiongraph/components/MgNodeInspector", () => ({
  default: () => <div data-testid="mg-node-inspector" />,
}));

vi.mock("./InspectorContent", () => ({
  InspectorContent: () => <div data-testid="generic-inspector-content" />,
}));

describe("InspectorPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bindingState.standardInputsById = new Map();
    animationStoreState.tracks = [];
    animationStoreState.selectedTrackId = null;
    animationStoreState.selectedKeyframeId = null;
  });

  it("renders the animation asset inspector and commits rename plus navigation", () => {
    const onRenameAnimationTarget = vi.fn();
    const onUpdateAnimationTargetDuration = vi.fn();
    const onInspectAnimationTrack = vi.fn();
    const onInspectAnimationInput = vi.fn();
    const selectedAnimationTarget: AnimationInspectorSelection = {
      targetId: "authored-animation:blink",
      name: "Idle Blink",
      source: "authored",
      duration: 1.25,
      trackCount: 1,
      tracks: [
        {
          id: "track-1",
          label: "Jaw Open",
          channel: "/propsrig/jaw/open",
          keyframeCount: 3,
          inputId: "jaw.open",
          inputLabel: "Jaw Open",
        },
      ],
    };

    render(
      <InspectorPanel
        activeInspectorTarget={
          {
            kind: "animation-target",
            targetId: "authored-animation:blink",
          } satisfies ActiveInspectorTarget
        }
        selectedAnimationTarget={selectedAnimationTarget}
        onRenameAnimationTarget={onRenameAnimationTarget}
        onUpdateAnimationTargetDuration={onUpdateAnimationTargetDuration}
        onInspectAnimationTrack={onInspectAnimationTrack}
        onInspectAnimationInput={onInspectAnimationInput}
      />,
    );

    const nameField = screen.getByDisplayValue("Idle Blink");
    fireEvent.change(nameField, { target: { value: "Blink Loop" } });
    fireEvent.blur(nameField);
    const durationField = screen.getByRole("textbox", { name: "Duration" });
    fireEvent.change(durationField, { target: { value: "2.5" } });
    fireEvent.blur(durationField);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Jaw Open /propsrig/jaw/open · 3 keyframes",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Jaw Open" }));

    expect(screen.getByText("Authored clip")).toBeTruthy();
    expect(onRenameAnimationTarget).toHaveBeenCalledWith(
      "authored-animation:blink",
      "Blink Loop",
    );
    expect(onUpdateAnimationTargetDuration).toHaveBeenCalledWith(
      "authored-animation:blink",
      2.5,
    );
    expect(onInspectAnimationTrack).toHaveBeenCalledWith("track-1");
    expect(onInspectAnimationInput).toHaveBeenCalledWith("jaw.open");
  });

  it("renders the program asset inspector and routes node and driver navigation", () => {
    const onRenameProgramTarget = vi.fn();
    const onInspectProgramNode = vi.fn();
    const onInspectProgramInput = vi.fn();
    const selectedProgramTarget: ProgramInspectorSelection = {
      targetId: "authored-procedural:wave",
      name: "Wave",
      source: "authored",
      nodeCount: 2,
      edgeCount: 1,
      inputCount: 1,
      outputCount: 1,
      nodes: [
        {
          id: "node-a",
          label: "Jaw Input",
          kind: "input",
        },
      ],
      inputs: [
        {
          path: "/propsrig/jaw/open",
          label: "Jaw Open",
          inputId: "jaw.open",
          tag: null,
        },
      ],
      outputs: [
        {
          path: "/propsrig/brow/up",
          label: "Brow Up",
          inputId: "brow.up",
          tag: null,
        },
      ],
    };

    render(
      <InspectorPanel
        activeInspectorTarget={
          {
            kind: "program-target",
            targetId: "authored-procedural:wave",
          } satisfies ActiveInspectorTarget
        }
        selectedProgramTarget={selectedProgramTarget}
        onRenameProgramTarget={onRenameProgramTarget}
        onInspectProgramNode={onInspectProgramNode}
        onInspectProgramInput={onInspectProgramInput}
      />,
    );

    const nameField = screen.getByDisplayValue("Wave");
    fireEvent.change(nameField, { target: { value: "Wave Copy" } });
    fireEvent.blur(nameField);

    fireEvent.click(
      screen.getByRole("button", { name: "Jaw Input Input node" }),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Driver" })[0]!);

    expect(screen.getByText("Authored program")).toBeTruthy();
    expect(screen.queryByText("node-a")).toBeNull();
    expect(onRenameProgramTarget).toHaveBeenCalledWith(
      "authored-procedural:wave",
      "Wave Copy",
    );
    expect(onInspectProgramNode).toHaveBeenCalledWith("node-a");
    expect(onInspectProgramInput).toHaveBeenCalledWith("jaw.open");
  });

  it("renders the track inspector only when the active target is the track", () => {
    animationStoreState.tracks = [
      {
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
      },
    ];
    animationStoreState.selectedTrackId = "track-1";
    animationStoreState.selectedKeyframeId = "kf-1";
    bindingState.standardInputsById = new Map([
      [
        "jaw.open",
        {
          id: "jaw.open",
          label: "Jaw Open",
          range: { min: 0, max: 1 },
        },
      ],
    ]);

    render(
      <InspectorPanel
        activeInspectorTarget={{
          kind: "animation-track",
          targetId: "authored-animation:blink",
          trackId: "track-1",
        }}
      />,
    );

    expect(screen.getByText("Keyframes: 1")).toBeTruthy();
    expect(screen.queryByTestId("generic-inspector-content")).toBeNull();
  });
});
