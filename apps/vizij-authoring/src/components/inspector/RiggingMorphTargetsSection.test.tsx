import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { RiggingMorphTargetsSection } from "./RiggingMorphTargetsSection";

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

const graphRuntimeState = {
  world: {} as Record<string, { morphTargets?: string[] }>,
};

const sceneComposerState = {
  updateAnimatableDescriptor: vi.fn(),
  setAnimatableValue: vi.fn(),
  setStaticFeatureValue: vi.fn(),
};

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
  useGraphRuntime: (selector: (state: typeof graphRuntimeState) => unknown) =>
    selector(graphRuntimeState),
}));

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => sceneComposerState,
}));

afterEach(() => {
  cleanup();
});

describe("RiggingMorphTargetsSection", () => {
  const targetId = "shape_smile:value";
  const inputId = "propsrig_smile";
  const node = {
    id: "shape_smile",
    name: "Smile Shape",
    type: "shape",
    parentId: null,
    childIds: [],
    features: [
      {
        id: "feature_smile",
        key: "Smile",
        label: "Smile",
        defaultLabel: "Smile",
        type: "number",
        animated: true,
        animatableId: "anim_smile",
        elementId: "shape_smile",
        elementName: "Smile Shape",
        elementType: "shape",
        components: [
          {
            id: "feature_smile:value",
            label: "Value",
            targetId,
            staticValue: 0.25,
          },
        ],
      },
    ],
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    const input: StandardRigInput = {
      id: inputId,
      path: "/propsrig/face/smile",
      label: "Smile",
      group: "propsrig",
      defaultValue: 0.2,
      range: { min: 0, max: 1 },
    };
    bindingState.bindings = {
      [targetId]: {
        inputId,
      },
    };
    bindingState.standardInputs = [input];
    bindingState.standardInputsById = new Map([[inputId, input]]);
    bindingState.inputBindings = {};
    bindingState.inputValues = {
      [inputId]: 0.4,
    };
    bindingState.lockedInspectorTargetIds = new Set();
    graphRuntimeState.world = {
      [node.id]: {
        morphTargets: ["Smile"],
      },
    };
  });

  it("disables current/default/min/max editors when the property is locked", () => {
    bindingState.lockedInspectorTargetIds = new Set([targetId]);

    render(<RiggingMorphTargetsSection node={node} />);

    fireEvent.click(screen.getByTitle("Toggle Smile edit controls"));

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(4);
    inputs.forEach((input) => {
      expect((input as HTMLInputElement).disabled).toBe(true);
    });
  });

  it("commits current and default numeric edits on blur instead of on change", () => {
    render(<RiggingMorphTargetsSection node={node} />);

    fireEvent.click(screen.getByTitle("Toggle Smile edit controls"));

    const currentInput = screen.getByDisplayValue("0.4");
    fireEvent.change(currentInput, { target: { value: "0.6" } });
    expect(bindingState.handleInputValueChange).not.toHaveBeenCalled();
    fireEvent.blur(currentInput);
    expect(bindingState.handleInputValueChange).toHaveBeenCalledWith(
      inputId,
      0.6,
    );

    const defaultInput = screen.getByDisplayValue("0.2");
    fireEvent.change(defaultInput, { target: { value: "0.3" } });
    expect(bindingState.handleUpdateStandardInput).not.toHaveBeenCalled();
    fireEvent.blur(defaultInput);
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      inputId,
      { defaultValue: 0.3 },
    );
  });
});
