import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { StandardRigInput } from "@vizij/utils";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import type {
  PoseRigFaceTrace,
  TraceConnectionsSummary,
} from "./rigConnections";
import { BindingConnections } from "./BindingConnections";

const mockBindingState = {
  bindings: {},
  standardInputsById: new Map<string, StandardRigInput>(),
  inputBindings: {},
  handleSelectRig: vi.fn(),
  handleCreateParentDriverBinding: vi.fn(),
  handleUnlinkChildInput: vi.fn(),
};

const mockSelectionState = {
  handleClearSelection: vi.fn(),
};

const mockPoseState = {
  selectPose: vi.fn(),
  updatePoseValue: vi.fn(),
  removePoseInput: vi.fn(),
};

const mockPoseStoreState = {
  poses: [],
  neutralInputs: {},
};

const mockSceneState = {
  objects: [],
};

let mockTrace: PoseRigFaceTrace = {
  targets: [],
  unmatchedPoseOutputs: [],
  suggestedFixes: [],
  diagnostics: [],
};

let mockSummary: TraceConnectionsSummary = {
  poses: [],
  rigs: [],
};

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (
    selector?: (state: typeof mockBindingState) => unknown,
  ) => (selector ? selector(mockBindingState) : mockBindingState),
  useSelectionStore: (
    selector?: (state: typeof mockSelectionState) => unknown,
  ) => (selector ? selector(mockSelectionState) : mockSelectionState),
}));

vi.mock("../../state/PoseRigProvider", () => ({
  usePoseRig: () => mockPoseState,
}));

vi.mock("../../poseRig/store", () => ({
  usePoseRigStore: (selector: (state: typeof mockPoseStoreState) => unknown) =>
    selector(mockPoseStoreState),
}));

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => mockSceneState,
}));

vi.mock("./rigConnections", () => ({
  buildPoseRigFaceTrace: () => mockTrace,
  summarizeTraceConnections: () => mockSummary,
  selectSafePoseRigTraceSuggestions: () => [],
}));

describe("BindingConnections routing", () => {
  it("routes pose/rig/target actions through provided callbacks", () => {
    mockSummary = {
      poses: [{ id: "pose_1", label: "Smile", features: ["mouth"] }],
      rigs: [
        {
          id: "rig_1",
          label: "Mouth Open",
          features: ["mouth_open"],
          sourceKinds: ["pose-aggregate-output"],
        },
      ],
    };
    mockTrace = {
      targets: [
        {
          targetId: "shape:mouth:x",
          targetLabel: "Mouth X",
          directRigInputIds: ["rig_1"],
          upstreamRigInputIds: ["rig_1"],
          matchedPoseOutputs: [
            {
              poseId: "pose_1",
              poseName: "Smile",
              inputId: "rig_1",
              value: 0.5,
              neutral: 0,
            },
          ],
          diagnostics: [],
        },
      ],
      unmatchedPoseOutputs: [],
      suggestedFixes: [],
      diagnostics: [],
    };

    const onSelectPose = vi.fn();
    const onSelectRig = vi.fn();
    const onSelectTarget = vi.fn();

    const node: SceneObjectNode = {
      id: "shape_1",
      name: "Shape 1",
      type: "shape",
      parentId: null,
      childIds: [],
      features: [],
    };

    render(
      <BindingConnections
        node={node}
        onSelectPose={onSelectPose}
        onSelectRig={onSelectRig}
        onSelectTarget={onSelectTarget}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Mouth X/i }));
    fireEvent.click(screen.getByRole("button", { name: /Mouth Open/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Smile/i })[0]);

    expect(onSelectTarget).toHaveBeenCalledWith("shape:mouth:x");
    expect(onSelectRig).toHaveBeenCalledWith("rig_1", "pose-aggregate-output");
    expect(onSelectPose).toHaveBeenCalledWith("pose_1");
  });
});
