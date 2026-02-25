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
  it("excludes /rig/element paths from the variables tab", () => {
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

    render(<VariableSelector onSelect={vi.fn()} defaultTab="variables" />);

    fireEvent.change(screen.getByPlaceholderText("Search variables..."), {
      target: { value: "Jaw Open" },
    });

    expect(screen.getByText("Jaw Open")).toBeTruthy();
    expect(screen.queryByText("Rig Element Jaw Open")).toBeNull();
  });

  it("matches variables by path segments and id fragments", () => {
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

    render(<VariableSelector onSelect={vi.fn()} defaultTab="variables" />);

    fireEvent.change(screen.getByPlaceholderText("Search variables..."), {
      target: { value: "mouth morph" },
    });
    expect(screen.getByText("Smile Left")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search variables..."), {
      target: { value: "ctrl_01" },
    });
    expect(screen.getByText("Smile Left")).toBeTruthy();
  });

  it("renders properties from autorig inputs and supports single add via selected batch", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "autorig_jaw_x",
            path: "/autorig/face/jaw/x",
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
    render(<VariableSelector onSelect={onSelect} defaultTab="scene" />);

    fireEvent.click(screen.getByText("Group · face"));
    expect(screen.getByText("Jaw X")).toBeTruthy();
    expect(screen.queryByText("/autorig/face/jaw/x")).toBeNull();
    expect(screen.getByRole("button", { name: /^Jaw\s*\d+/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^X\s*\d+/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Rotation/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Y\s*\d+/i })).toBeNull();

    fireEvent.click(screen.getByText("Jaw X"));
    fireEvent.click(screen.getByRole("button", { name: "Add All (1)" }));

    expect(onSelect).toHaveBeenLastCalledWith({
      type: "property",
      objectId: "face_mesh",
      featureId: "jaw",
      label: "Jaw X · /face/jaw/x",
      inputId: "autorig_jaw_x",
      targetId: "comp_jaw_x",
    });
  });

  it("greys out locked properties and blocks selection", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [
        {
          input: {
            id: "autorig_jaw_x",
            path: "/autorig/face/jaw/x",
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
      lockedAutorigInputIds: new Set(["autorig_jaw_x"]),
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    const onSelect = vi.fn();
    render(<VariableSelector onSelect={onSelect} defaultTab="scene" />);

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
            path: "/autorig/eye_left/translation/x",
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
            path: "/autorig/eye_left/rotation/y",
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
            path: "/autorig/eye_left/scale/z",
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

    render(<VariableSelector onSelect={vi.fn()} defaultTab="scene" />);

    fireEvent.change(screen.getByPlaceholderText("Search properties..."), {
      target: { value: "eye" },
    });

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
            path: "/autorig/eye_left/translation/x",
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
            path: "/autorig/eye_left/rotation/x",
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
    render(<VariableSelector onSelect={onSelect} defaultTab="scene" />);

    fireEvent.click(screen.getByText("Group · face"));
    fireEvent.click(screen.getByText("Left Eye Translate X"));
    fireEvent.click(screen.getByText("Left Eye Rotate X"));
    fireEvent.click(screen.getByRole("button", { name: "Add All (2)" }));

    expect(onSelect).toHaveBeenLastCalledWith({
      type: "property",
      objectId: "autorig",
      featureId: "autorig",
      label: "Selected Properties (2)",
      inputIds: ["eye_rotate_x", "eye_translate_x"],
      targetIds: ["comp_eye_rx", "comp_eye_tx"],
    });
  });

  it("shows actionable empty-state diagnostics for property searches", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [],
      rootIds: [],
      getChildren: () => [],
    });

    render(<VariableSelector onSelect={vi.fn()} defaultTab="scene" />);

    fireEvent.change(screen.getByPlaceholderText("Search properties..."), {
      target: { value: "notfound" },
    });

    expect(screen.getByText('No properties match "notfound".')).toBeTruthy();
    expect(
      screen.getByText("Try a label, path segment, or ID fragment."),
    ).toBeTruthy();
  });
});
