import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
}));

vi.mock("../../hooks/useUnifiedSelection", () => ({
  useUnifiedSelection: () => ({
    inspectorMode: "default",
  }),
}));

const animationStoreState = {
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
});
