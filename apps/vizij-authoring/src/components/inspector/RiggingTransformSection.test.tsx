import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { RiggingTransformSection } from "./RiggingTransformSection";

const authoringUiState = {
  rotationDisplayMode: "degrees" as const,
};

const bindingState = {
  bindings: {} as Record<string, { inputId?: string | null }>,
  standardInputs: [] as StandardRigInput[],
  standardInputsById: new Map<string, StandardRigInput>(),
  inputBindings: {} as Record<string, unknown>,
  inputValues: {} as Record<string, number>,
  handleInputValueChange: vi.fn(),
  handleUpdateStandardInput: vi.fn(),
  lockedInspectorTargetIds: new Set<string>(),
  handleSetInspectorTargetLocked: vi.fn(),
};

const sceneComposerState = {
  updateAnimatableDescriptor: vi.fn(),
  setAnimatableValue: vi.fn(),
  setStaticFeatureValue: vi.fn(),
};

vi.mock("../../state/AuthoringUiProvider", () => ({
  useAuthoringUiState: () => authoringUiState,
}));

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
}));

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => sceneComposerState,
}));

afterEach(() => {
  cleanup();
});

function createNode(feature: any) {
  return {
    id: "node_1",
    name: "Face Node",
    type: "mesh",
    parentId: null,
    childIds: [],
    features: [feature],
  } as any;
}

function createVectorFeature({
  id,
  key,
  label,
  inputId,
  targetId,
}: {
  id: string;
  key: string;
  label: string;
  inputId: string;
  targetId: string;
}) {
  return {
    id,
    key,
    label,
    defaultLabel: label,
    type: "vector3",
    animated: true,
    animatableId: `anim_${id}`,
    elementId: "node_1",
    elementName: "Face Node",
    elementType: "mesh",
    components: [
      {
        id: `${id}:x`,
        componentKey: "x",
        label: "X",
        targetId,
        staticValue: 0,
      },
    ],
  } as any;
}

describe("RiggingTransformSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authoringUiState.rotationDisplayMode = "degrees";
    bindingState.bindings = {};
    bindingState.standardInputs = [];
    bindingState.standardInputsById = new Map();
    bindingState.inputBindings = {};
    bindingState.inputValues = {};
    bindingState.lockedInspectorTargetIds = new Set();
  });

  it("keeps non-rotation transform values unconverted in degrees mode", () => {
    const inputId = "input_position_x";
    const targetId = "position:x";
    const input: StandardRigInput = {
      id: inputId,
      path: "/propsrig/head/position/x",
      label: "Position X",
      group: "propsrig",
      defaultValue: 0.5,
      range: { min: -10, max: 10 },
    };

    bindingState.bindings = { [targetId]: { inputId } };
    bindingState.standardInputs = [input];
    bindingState.standardInputsById = new Map([[inputId, input]]);
    bindingState.inputValues = { [inputId]: 1 };

    render(
      <RiggingTransformSection
        node={createNode(
          createVectorFeature({
            id: "feature_position",
            key: "position",
            label: "Position",
            inputId,
            targetId,
          }),
        )}
      />,
    );

    fireEvent.click(screen.getByTitle("Toggle Position edit controls"));

    expect(screen.getByDisplayValue("1")).toBeTruthy();
    expect(screen.getByDisplayValue("0.5")).toBeTruthy();
    expect(screen.getByDisplayValue("-10")).toBeTruthy();
    expect(screen.getByDisplayValue("10")).toBeTruthy();
    expect(screen.queryByDisplayValue("57.29577951308232")).toBeNull();
  });

  it("displays rotation in degrees and converts committed edits back to radians", () => {
    const inputId = "input_rotation_x";
    const targetId = "rotation:x";
    const input: StandardRigInput = {
      id: inputId,
      path: "/propsrig/head/rotation/x",
      label: "Rotation X",
      group: "propsrig",
      defaultValue: Math.PI / 4,
      range: { min: -Math.PI, max: Math.PI },
    };

    bindingState.bindings = { [targetId]: { inputId } };
    bindingState.standardInputs = [input];
    bindingState.standardInputsById = new Map([[inputId, input]]);
    bindingState.inputValues = { [inputId]: Math.PI / 2 };

    render(
      <RiggingTransformSection
        node={createNode(
          createVectorFeature({
            id: "feature_rotation",
            key: "rotation",
            label: "Rotation",
            inputId,
            targetId,
          }),
        )}
      />,
    );

    fireEvent.click(screen.getByTitle("Toggle Rotation (deg) edit controls"));

    const currentInput = screen.getByDisplayValue("90");
    fireEvent.change(currentInput, { target: { value: "180" } });
    fireEvent.blur(currentInput);

    expect(bindingState.handleInputValueChange).toHaveBeenCalledWith(
      inputId,
      Math.PI,
    );

    const defaultInput = screen.getByDisplayValue("45");
    fireEvent.change(defaultInput, { target: { value: "90" } });
    fireEvent.blur(defaultInput);

    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      inputId,
      {
        defaultValue: Math.PI / 2,
      },
    );
  });
});
