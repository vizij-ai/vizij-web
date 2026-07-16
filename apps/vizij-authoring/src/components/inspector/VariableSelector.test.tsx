import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VariableSelector } from "./VariableSelector";

const mockedUseBindingAuthoring = vi.fn();
const mockedUseSceneComposer = vi.fn();

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: any) => unknown) =>
    selector(mockedUseBindingAuthoring()),
}));

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => mockedUseSceneComposer(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("VariableSelector", () => {
  it("excludes /rig/element paths when filtering to drivers", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "jaw_open",
            path: "/standard/jaw/open",
            label: "Jaw Open",
          },
        },
        {
          input: {
            id: "rig_jaw_open",
            path: "/rig/element/jaw/open",
            label: "Rig Element Jaw Open",
          },
        },
      ],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    render(<VariableSelector onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^Drivers\s*\d+/i }));
    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "Jaw Open" },
      },
    );
    fireEvent.click(screen.getByText("Path · /standard/jaw"));

    expect(screen.getByText("Jaw Open")).toBeTruthy();
    expect(screen.queryByText("Rig Element Jaw Open")).toBeNull();
  });

  it("matches drivers by path segments and id fragments", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "semio_mouth_smile_left_ctrl_01",
            path: "/standard/semio/mouth/morph/smile_left",
            label: "Smile Left",
            group: "semio",
          },
        },
      ],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    render(<VariableSelector onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Drivers\s*\d+/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "mouth morph" },
      },
    );
    fireEvent.click(screen.getByText("Group · semio"));
    expect(screen.getByText("Smile Left")).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "ctrl_01" },
      },
    );
    expect(screen.getByText("Smile Left")).toBeTruthy();
  });

  it("renders properties from propsrig inputs and supports single add via selected batch", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "propsrig_jaw_x",
            path: "/propsrig/face/jaw/x",
            label: "Jaw X",
            group: "face",
            sourceId: "component:face:jaw:rot:comp_jaw_x",
          },
          metadata: {
            elementId: "face_mesh",
            elementName: "Face",
            featureKey: "jaw",
            featureLabel: "Jaw",
            componentId: "comp_jaw_x",
            componentKey: "x",
            animatableId: "jaw_rot",
          },
        },
      ],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    const onSelect = vi.fn();
    render(<VariableSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /^Properties\s*\d+/i }));

    fireEvent.click(screen.getByText("Group · face"));
    expect(screen.getByText("Jaw X")).toBeTruthy();
    expect(screen.queryByText("/propsrig/face/jaw/x")).toBeNull();
    expect(screen.getByRole("button", { name: /^Jaw\s*\d+/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^X\s*\d+/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rotation/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Y\s*\d+/i })).toBeNull();

    fireEvent.click(screen.getByText("Jaw X"));
    fireEvent.click(screen.getByRole("button", { name: "Add Selected (1)" }));

    expect(onSelect).toHaveBeenLastCalledWith({
      type: "property",
      objectId: "face_mesh",
      featureId: "jaw",
      label: "Jaw X · /face/jaw/x",
      inputId: "propsrig_jaw_x",
      targetId: "comp_jaw_x",
    });
  });

  it("greys out locked properties and blocks selection", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "propsrig_jaw_x",
            path: "/propsrig/face/jaw/x",
            label: "Jaw X",
            group: "face",
            sourceId: "component:face:jaw:rot:comp_jaw_x",
          },
          metadata: {
            elementId: "face_mesh",
            elementName: "Face",
            featureKey: "jaw",
            featureLabel: "Jaw",
            componentId: "comp_jaw_x",
            componentKey: "x",
            animatableId: "jaw_rot",
          },
        },
      ],
      bindings: {},
      lockedInspectorTargetIds: new Set(["comp_jaw_x"]),
      lockedPropsRigInputIds: new Set(["propsrig_jaw_x"]),
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    const onSelect = vi.fn();
    render(<VariableSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /^Properties\s*\d+/i }));

    fireEvent.click(screen.getByText("Group · face"));
    expect(screen.getByText("Locked")).toBeTruthy();
    const addButtons = screen.getAllByRole("button", { name: "Add" });
    expect(addButtons[0]).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByText("Jaw X"));
    fireEvent.click(addButtons[0]);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("supports property search plus multi-filter by type and leaf", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "eye_translate_x",
            path: "/propsrig/eye_left/translation/x",
            label: "Left Eye Translate X",
            group: "face",
            sourceId: "component:face:translation:x:comp_eye_tx",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "translation",
            featureLabel: "Translation",
            componentId: "comp_eye_tx",
            componentKey: "x",
          },
        },
        {
          input: {
            id: "eye_rotate_y",
            path: "/propsrig/eye_left/rotation/y",
            label: "Left Eye Rotate Y",
            group: "face",
            sourceId: "component:face:rotation:y:comp_eye_ry",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "rotation",
            featureLabel: "Rotation",
            componentId: "comp_eye_ry",
            componentKey: "y",
          },
        },
        {
          input: {
            id: "eye_scale_z",
            path: "/propsrig/eye_left/scale/z",
            label: "Left Eye Scale Z",
            group: "face",
            sourceId: "component:face:scale:z:comp_eye_sz",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "scale",
            featureLabel: "Scale",
            componentId: "comp_eye_sz",
            componentKey: "z",
          },
        },
      ],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    render(<VariableSelector onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Properties\s*\d+/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "eye" },
      },
    );

    fireEvent.click(screen.getByRole("button", { name: /Translation/i }));
    fireEvent.click(screen.getByRole("button", { name: /Rotation/i }));
    const xFilter = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.startsWith("X"));
    const yFilter = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.startsWith("Y") &&
          !button.textContent?.startsWith("Yaw"),
      );
    expect(xFilter).toBeTruthy();
    expect(yFilter).toBeTruthy();
    fireEvent.click(xFilter!);
    fireEvent.click(yFilter!);
    fireEvent.click(screen.getByText("Group · face"));

    expect(screen.getByText("Left Eye Translate X")).toBeTruthy();
    expect(screen.getByText("Left Eye Rotate Y")).toBeTruthy();
    expect(screen.queryByText("Left Eye Scale Z")).toBeNull();
  });

  it("supports multi-select and multi-add for properties", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "eye_translate_x",
            path: "/propsrig/eye_left/translation/x",
            label: "Left Eye Translate X",
            group: "face",
            sourceId: "component:face:translation:x:comp_eye_tx",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "translation",
            featureLabel: "Translation",
            componentId: "comp_eye_tx",
            componentKey: "x",
          },
        },
        {
          input: {
            id: "eye_rotate_x",
            path: "/propsrig/eye_left/rotation/x",
            label: "Left Eye Rotate X",
            group: "face",
            sourceId: "component:face:rotation:x:comp_eye_rx",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "rotation",
            featureLabel: "Rotation",
            componentId: "comp_eye_rx",
            componentKey: "x",
          },
        },
      ],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    const onSelect = vi.fn();
    render(<VariableSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /^Properties\s*\d+/i }));

    fireEvent.click(screen.getByText("Group · face"));
    fireEvent.click(screen.getByText("Left Eye Translate X"));
    fireEvent.click(screen.getByText("Left Eye Rotate X"));
    fireEvent.click(screen.getByRole("button", { name: "Add Selected (2)" }));

    expect(onSelect).toHaveBeenLastCalledWith({
      type: "property",
      objectId: "propsrig",
      featureId: "propsrig",
      label: "Selected Properties (2)",
      inputIds: ["eye_rotate_x", "eye_translate_x"],
      targetIds: ["comp_eye_rx", "comp_eye_tx"],
    });
  });

  it("supports staged mixed selection across filters", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "jaw_open",
            path: "/standard/jaw/open",
            label: "Jaw Open",
            group: "face",
          },
        },
        {
          input: {
            id: "eye_translate_x",
            path: "/propsrig/eye_left/translation/x",
            label: "Left Eye Translate X",
            group: "face",
            sourceId: "component:face:translation:x:comp_eye_tx",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "translation",
            featureLabel: "Translation",
            componentId: "comp_eye_tx",
            componentKey: "x",
          },
        },
        {
          input: {
            id: "eye_rotate_x",
            path: "/propsrig/eye_left/rotation/x",
            label: "Left Eye Rotate X",
            group: "face",
            sourceId: "component:face:rotation:x:comp_eye_rx",
          },
          metadata: {
            elementId: "face_mesh",
            featureKey: "rotation",
            featureLabel: "Rotation",
            componentId: "comp_eye_rx",
            componentKey: "x",
          },
        },
      ],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    const onSelect = vi.fn();
    render(<VariableSelector onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /^Drivers\s*\d+/i }));
    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "jaw" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add Filtered To Selection (1)" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Drivers\s*\d+/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Properties\s*\d+/i }));
    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "eye" },
      },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add Filtered To Selection (2)" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Selected (3)" }));

    expect(onSelect).toHaveBeenCalledWith({
      type: "mixed",
      label: "Selected Drivers (1) + Properties (2)",
      variableIds: ["jaw_open"],
      propertyInputIds: ["eye_rotate_x", "eye_translate_x"],
      propertyTargetIds: ["comp_eye_rx", "comp_eye_tx"],
    });
  });

  it("shows actionable empty-state diagnostics for filtered searches", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    render(<VariableSelector onSelect={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Properties\s*\d+/i }));

    fireEvent.change(
      screen.getByPlaceholderText("Search controls or properties..."),
      {
        target: { value: "notfound" },
      },
    );

    expect(
      screen.getByText('No drivers or properties match "notfound".'),
    ).toBeTruthy();
    expect(
      screen.getByText("Try broadening your filter chips or search terms."),
    ).toBeTruthy();
  });
});
