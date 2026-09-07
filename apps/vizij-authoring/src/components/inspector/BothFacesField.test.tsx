import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BothFacesField } from "./BothFacesField";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DESYNC_TEXT = /Faces are currently controlled individually/;

describe("BothFacesField", () => {
  it("renders the caller's label and the shared value on both controls", () => {
    render(
      <BothFacesField
        label="Both Faces Value"
        value={12}
        min={-45}
        max={45}
        step={0.5}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Both Faces Value")).toBeTruthy();
    const slider = screen.getByRole("slider");
    expect(slider.getAttribute("aria-valuenow")).toBe("12");
    expect(slider.getAttribute("aria-valuemin")).toBe("-45");
    expect(slider.getAttribute("aria-valuemax")).toBe("45");
    expect(screen.getByDisplayValue("12")).toBeTruthy();
  });

  it("shows the desync note only when the faces disagree", () => {
    const { rerender } = render(
      <BothFacesField
        label="Both Faces Weight"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(DESYNC_TEXT)).toBeNull();

    rerender(
      <BothFacesField
        label="Both Faces Weight"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={vi.fn()}
        desynced
      />,
    );
    expect(screen.getByText(DESYNC_TEXT)).toBeTruthy();
  });

  it("reports number-field edits through the single onChange", () => {
    const onChange = vi.fn();
    render(
      <BothFacesField
        label="Both Faces Weight"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("0.5"), {
      target: { value: "0.75" },
    });

    expect(onChange).toHaveBeenCalledWith(0.75);
  });

  it("keeps the pose sites' narrower number field available", () => {
    const { container } = render(
      <BothFacesField
        label="Both Faces Weight"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        numberFieldClassName="w-[92px]"
        onChange={vi.fn()}
      />,
    );

    expect(container.querySelector(".w-\\[92px\\]")).toBeTruthy();
    expect(container.querySelector(".w-\\[108px\\]")).toBeNull();
  });
});
