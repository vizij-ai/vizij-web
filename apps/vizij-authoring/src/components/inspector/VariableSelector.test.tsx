import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VariableSelector } from "./VariableSelector";

const mockedUseBindingAuthoring = vi.fn();
const mockedUseSceneComposer = vi.fn();

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (
    selector: (state: {
      managedStandardInputs: unknown[];
      bindings: Record<string, unknown>;
    }) => unknown,
  ) => selector(mockedUseBindingAuthoring()),
}));

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => mockedUseSceneComposer(),
}));

describe("VariableSelector scene property selection", () => {
  it("returns leaf target selection and explicit bulk selection", () => {
    mockedUseBindingAuthoring.mockReturnValue({
      managedStandardInputs: [],
      bindings: {},
    });
    mockedUseSceneComposer.mockReturnValue({
      objects: [
        {
          id: "shape_1",
          name: "Head",
          type: "Shape",
          parentId: null,
          features: [
            {
              id: "feature_translation",
              label: "Translation",
              components: [
                { id: "tx", label: "X", targetId: "anim:tx" },
                { id: "ty", label: "Y", targetId: "anim:ty" },
                { id: "tz", label: "Z", targetId: "anim:tz" },
              ],
            },
          ],
        },
      ],
      rootIds: ["shape_1"],
      getChildren: () => [],
    });
    const onSelect = vi.fn();

    render(<VariableSelector onSelect={onSelect} defaultTab="scene" />);

    fireEvent.click(screen.getByText("X"));
    expect(onSelect).toHaveBeenLastCalledWith({
      type: "property",
      objectId: "shape_1",
      featureId: "feature_translation",
      label: "Head · Translation.X",
      targetId: "anim:tx",
    });

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onSelect).toHaveBeenLastCalledWith({
      type: "property",
      objectId: "shape_1",
      featureId: "feature_translation",
      label: "Head · Translation",
      targetIds: ["anim:tx", "anim:ty", "anim:tz"],
    });
  });
});
