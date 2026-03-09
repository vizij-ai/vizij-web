import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField } from "./NumberField";

afterEach(() => {
  cleanup();
});

describe("NumberField", () => {
  it("absorbs pointer start events when scrub is disabled", () => {
    const handleMouseDown = vi.fn();
    const handlePointerDown = vi.fn();
    const view = render(
      <div onMouseDown={handleMouseDown} onPointerDown={handlePointerDown}>
        <NumberField value={0.5} allowScrub={false} />
      </div>,
    );

    const input = view.container.querySelector("input");
    expect(input).not.toBeNull();

    fireEvent.mouseDown(input!);
    fireEvent.pointerDown(input!);

    expect(handleMouseDown).not.toHaveBeenCalled();
    expect(handlePointerDown).not.toHaveBeenCalled();
  });
});
