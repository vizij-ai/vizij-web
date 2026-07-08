import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectorHeader } from "./InspectorHeader";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("InspectorHeader", () => {
  it("renders a read-only name label when name editing is disabled", () => {
    render(
      <InspectorHeader
        name="Outer Face"
        typeLabel="Shape"
        id="shape_outer_face"
        nameEditable={false}
        onNameChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Outer Face")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Name")).toBeNull();
  });

  it("renders the editable name input when name editing is enabled", () => {
    render(
      <InspectorHeader
        name="Jaw Driver"
        typeLabel="Rig"
        id="jaw_driver"
        onNameChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("Jaw Driver")).toBeTruthy();
  });
});
