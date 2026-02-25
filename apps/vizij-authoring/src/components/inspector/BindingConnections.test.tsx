import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
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

const mockGraphRuntimeState = {
  animatables: {},
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

const standardInputsById = new Map<string, StandardRigInput>([
  [
    "rig/parent/jaw_open",
    {
      id: "rig/parent/jaw_open",
      path: "/standard/face/jaw/open",
      label: "Jaw Open",
      group: "standard",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    },
  ],
  [
    "autorig/mouth/open",
    {
      id: "autorig/mouth/open",
      path: "/autorig/face/mouth/open",
      label: "Mouth Open Autorig",
      group: "autorig",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    },
  ],
]);

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
  useGraphRuntime: (
    selector?: (state: typeof mockGraphRuntimeState) => unknown,
  ) => (selector ? selector(mockGraphRuntimeState) : mockGraphRuntimeState),
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

vi.mock("./rigConnections", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rigConnections")>();
  return {
    ...actual,
    buildPoseRigFaceTrace: () => mockTrace,
    summarizeTraceConnections: () => mockSummary,
    selectSafePoseRigTraceSuggestions: () => [],
  };
});

describe("BindingConnections routing", () => {
  beforeEach(() => {
    cleanup();
    mockBindingState.standardInputsById = standardInputsById;
    mockBindingState.handleSelectRig.mockReset();
    mockSelectionState.handleClearSelection.mockReset();
    mockPoseState.selectPose.mockReset();
    mockPoseState.updatePoseValue.mockReset();
    mockPoseState.removePoseInput.mockReset();
    mockSummary = { poses: [], rigs: [] };
    mockTrace = {
      targets: [],
      unmatchedPoseOutputs: [],
      suggestedFixes: [],
      diagnostics: [],
    };
  });

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
          orderedRigInputIds: ["rig_1"],
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

    const view = render(
      <BindingConnections
        node={node}
        onSelectPose={onSelectPose}
        onSelectRig={onSelectRig}
        onSelectTarget={onSelectTarget}
      />,
    );

    fireEvent.click(view.getByTestId("binding-trace-section-toggle"));
    fireEvent.click(view.getByTitle("Inspect Mouth X"));
    fireEvent.click(view.getByTestId("binding-rigs-section-toggle"));
    fireEvent.click(
      view.getByTestId("binding-rig-category-toggle-pose-aggregates"),
    );
    fireEvent.click(view.getByRole("button", { name: /Mouth Open/i }));
    fireEvent.click(view.getByTestId("binding-poses-section-toggle"));
    fireEvent.click(view.getByTestId("binding-pose-group-toggle-rig_1"));
    fireEvent.click(view.getAllByRole("button", { name: /Smile/i })[0]);

    expect(onSelectTarget).toHaveBeenCalledWith("shape:mouth:x");
    expect(onSelectRig).toHaveBeenCalledWith("rig_1", "pose-aggregate-output");
    expect(onSelectPose).toHaveBeenCalledWith("pose_1");
  });

  it("traverses Pose -> Rig -> Autorig -> Animatable in both directions", () => {
    mockTrace = {
      targets: [
        {
          targetId: "anim://mouth/open",
          targetLabel: "Face Mesh · Mouth Open",
          directRigInputIds: ["autorig/mouth/open"],
          upstreamRigInputIds: ["autorig/mouth/open", "rig/parent/jaw_open"],
          orderedRigInputIds: ["autorig/mouth/open", "rig/parent/jaw_open"],
          matchedPoseOutputs: [
            {
              poseId: "pose_1",
              poseName: "Jaw Open Pose",
              inputId: "rig/parent/jaw_open",
              value: 0.7,
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

    const view = render(
      <BindingConnections
        node={node}
        onSelectPose={onSelectPose}
        onSelectRig={onSelectRig}
        onSelectTarget={onSelectTarget}
      />,
    );

    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Animatable");

    fireEvent.click(view.getByTestId("binding-traversal-upstream"));
    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Autorig");

    fireEvent.click(view.getByTestId("binding-traversal-upstream"));
    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Rig");

    fireEvent.click(view.getByTestId("binding-traversal-upstream"));
    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Pose");

    fireEvent.click(view.getByTestId("binding-traversal-downstream"));
    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Rig");

    fireEvent.click(view.getByTestId("binding-traversal-downstream"));
    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Autorig");

    fireEvent.click(view.getByTestId("binding-traversal-downstream"));
    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Animatable");

    expect(onSelectRig).toHaveBeenNthCalledWith(
      1,
      "autorig/mouth/open",
      "pose-entry",
    );
    expect(onSelectRig).toHaveBeenNthCalledWith(
      2,
      "rig/parent/jaw_open",
      "pose-group-output",
    );
    expect(onSelectPose).toHaveBeenCalledWith("pose_1");
    expect(onSelectRig).toHaveBeenNthCalledWith(
      3,
      "rig/parent/jaw_open",
      "pose-group-output",
    );
    expect(onSelectRig).toHaveBeenNthCalledWith(
      4,
      "autorig/mouth/open",
      "pose-entry",
    );
    expect(onSelectTarget).toHaveBeenCalledWith("anim://mouth/open");
  });

  it("preserves traversal selection context when trace refreshes", () => {
    mockTrace = {
      targets: [
        {
          targetId: "anim://mouth/open",
          targetLabel: "Face Mesh · Mouth Open",
          directRigInputIds: ["autorig/mouth/open"],
          upstreamRigInputIds: ["autorig/mouth/open", "rig/parent/jaw_open"],
          orderedRigInputIds: ["autorig/mouth/open", "rig/parent/jaw_open"],
          matchedPoseOutputs: [
            {
              poseId: "pose_1",
              poseName: "Jaw Open Pose",
              inputId: "rig/parent/jaw_open",
              value: 0.7,
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

    const node: SceneObjectNode = {
      id: "shape_1",
      name: "Shape 1",
      type: "shape",
      parentId: null,
      childIds: [],
      features: [],
    };

    const view = render(<BindingConnections node={node} />);

    fireEvent.click(view.getByTestId("binding-traversal-upstream"));
    fireEvent.click(view.getByTestId("binding-traversal-upstream"));

    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Rig");
    expect(
      view.getByTestId("binding-traversal-current-label").textContent,
    ).toContain("Jaw Open");

    mockTrace = {
      targets: [
        {
          targetId: "anim://mouth/open",
          targetLabel: "Face Mesh · Mouth Open v2",
          directRigInputIds: ["autorig/mouth/open"],
          upstreamRigInputIds: [
            "autorig/mouth/open",
            "rig/parent/jaw_open",
            "rig/group/smile",
          ],
          orderedRigInputIds: [
            "autorig/mouth/open",
            "rig/parent/jaw_open",
            "rig/group/smile",
          ],
          matchedPoseOutputs: [
            {
              poseId: "pose_1",
              poseName: "Jaw Open Pose",
              inputId: "rig/parent/jaw_open",
              value: 0.8,
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

    view.rerender(<BindingConnections node={node} />);

    expect(
      view.getByTestId("binding-traversal-current-kind").textContent,
    ).toContain("Rig");
    expect(
      view.getByTestId("binding-traversal-current-label").textContent,
    ).toContain("Jaw Open");
  });

  it("hides autorig entries from the RIGS section", () => {
    mockSummary = {
      poses: [],
      rigs: [
        {
          id: "autorig/mouth/open",
          label: "Mouth Open Autorig",
          features: ["Face Mesh · Mouth Open"],
          sourceKinds: ["pose-entry"],
        },
        {
          id: "rig/parent/jaw_open",
          label: "Jaw Open",
          features: ["Face Mesh · Mouth Open"],
          sourceKinds: ["pose-group-output"],
        },
      ],
    };
    mockTrace = {
      targets: [],
      unmatchedPoseOutputs: [],
      suggestedFixes: [],
      diagnostics: [],
    };

    const node: SceneObjectNode = {
      id: "shape_1",
      name: "Shape 1",
      type: "shape",
      parentId: null,
      childIds: [],
      features: [],
    };

    const view = render(<BindingConnections node={node} />);

    fireEvent.click(view.getByTestId("binding-rigs-section-toggle"));
    fireEvent.click(
      view.getByTestId("binding-rig-category-toggle-pose-group-aggregates"),
    );

    expect(
      view.queryByRole("button", { name: /Mouth Open Autorig/i }),
    ).toBeNull();
    expect(view.getByRole("button", { name: /Jaw Open/i })).toBeTruthy();
  });

  it("groups pose aggregate output rigs under a collapsed toggle", () => {
    mockSummary = {
      poses: [],
      rigs: [
        {
          id: "rig/aggregate/main",
          label: "Aggregate Main",
          features: ["Face Mesh · Mouth Open"],
          sourceKinds: ["pose-aggregate-output"],
        },
        {
          id: "rig/group/jaw_open",
          label: "Jaw Open",
          features: ["Face Mesh · Mouth Open"],
          sourceKinds: ["pose-group-output"],
        },
      ],
    };
    mockTrace = {
      targets: [],
      unmatchedPoseOutputs: [],
      suggestedFixes: [],
      diagnostics: [],
    };

    const node: SceneObjectNode = {
      id: "shape_1",
      name: "Shape 1",
      type: "shape",
      parentId: null,
      childIds: [],
      features: [],
    };

    const view = render(<BindingConnections node={node} />);

    fireEvent.click(view.getByTestId("binding-rigs-section-toggle"));
    expect(view.queryByRole("button", { name: /Aggregate Main/i })).toBeNull();

    fireEvent.click(
      view.getByTestId("binding-rig-category-toggle-pose-aggregates"),
    );

    expect(view.getByRole("button", { name: /Aggregate Main/i })).toBeTruthy();
  });

  it("hides low-confidence suggested fixes in the trace section", () => {
    mockTrace = {
      targets: [],
      unmatchedPoseOutputs: [],
      suggestedFixes: [
        {
          id: "suggest-low",
          kind: "link-parent-binding",
          poseId: "pose_1",
          poseName: "Pose 1",
          childInputId: "autorig/l_eyewhite_translation_y",
          upstreamInputId: "mouth_translation_y",
          targetId: "anim://left-eye/translate",
          targetLabel: "Face Mesh · Left Eye",
          confidence: 0.33,
          reason: "Low confidence",
        },
      ],
      diagnostics: [],
    };

    const node: SceneObjectNode = {
      id: "shape_1",
      name: "Shape 1",
      type: "shape",
      parentId: null,
      childIds: [],
      features: [],
    };

    const view = render(<BindingConnections node={node} />);
    fireEvent.click(view.getByTestId("binding-trace-section-toggle"));

    expect(view.queryByText(/Suggested Fixes/i)).toBeNull();
  });
});
