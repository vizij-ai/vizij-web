import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NumberField } from "./NumberField";

afterEach(() => {
  cleanup();
});

/** The four-decimal display format `docs/UI_DESIGN.md` mandates. */
const FOUR_DECIMALS: Intl.NumberFormatOptions = {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
};

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    'input[inputmode="decimal"]',
  );
  if (!input) throw new Error("NumberField input not found");
  return input;
}

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

  // This contract previously had NO test, which is how a regression to two
  // decimals went unnoticed when the component was briefly moved onto
  // @semio/ui's NumberField (its display format is hardcoded).
  it("shows exactly four decimals when asked, per UI_DESIGN.md", () => {
    const view = render(<NumberField value={0.5} format={FOUR_DECIMALS} />);
    expect(getInput(view.container).value).toBe("0.5000");
  });

  it("does not pad decimals when no format is given", () => {
    const view = render(<NumberField value={90} />);
    expect(getInput(view.container).value).toBe("90");
  });

  it("steps with the stepper buttons", () => {
    const onChange = vi.fn();
    const view = render(
      <NumberField value={1} step={0.25} onChange={onChange} />,
    );
    const [increment, decrement] = view.container.querySelectorAll("button");

    fireEvent.click(increment!);
    expect(onChange).toHaveBeenLastCalledWith(1.25);

    fireEvent.click(decrement!);
    expect(onChange).toHaveBeenLastCalledWith(0.75);
  });

  it("steps with ArrowUp and ArrowDown", () => {
    const onChange = vi.fn();
    const view = render(<NumberField value={2} step={1} onChange={onChange} />);
    const input = getInput(view.container);

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(3);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("clamps stepping to min and max", () => {
    const onChange = vi.fn();
    const view = render(
      <NumberField value={1} min={0} max={1} step={1} onChange={onChange} />,
    );
    fireEvent.keyDown(getInput(view.container), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith(1);
  });

  it("reports every keystroke in immediate mode", () => {
    const onChange = vi.fn();
    const view = render(
      <NumberField value={1} commitMode="immediate" onChange={onChange} />,
    );
    fireEvent.change(getInput(view.container), { target: { value: "2.5" } });
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it("defers to blur in blur mode", () => {
    const onChange = vi.fn();
    const view = render(
      <NumberField value={1} commitMode="blur" onChange={onChange} />,
    );
    const input = getInput(view.container);

    fireEvent.change(input, { target: { value: "2.5" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(2.5);
  });

  it("restores the last good value when the text cannot be parsed", () => {
    const onChange = vi.fn();
    const view = render(
      <NumberField value={7} commitMode="blur" onChange={onChange} />,
    );
    const input = getInput(view.container);

    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("7");
  });
});
