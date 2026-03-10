import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommitOnBlurNumberInput } from "./RiggingPropertyRow";

afterEach(() => {
  cleanup();
});

function requireInput(): HTMLInputElement {
  const input = document.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("expected input to render");
  }
  return input;
}

describe("CommitOnBlurNumberInput", () => {
  it("commits edits only after blur", () => {
    const handleCommit = vi.fn();
    render(
      <CommitOnBlurNumberInput
        value={0.25}
        step={0.01}
        onCommit={handleCommit}
      />,
    );

    const input = requireInput();
    fireEvent.change(input, { target: { value: "0.5" } });

    expect(handleCommit).not.toHaveBeenCalled();

    fireEvent.blur(input);

    expect(handleCommit).toHaveBeenCalledWith(0.5);
  });

  it("reverts staged edits on escape", () => {
    const handleCommit = vi.fn();
    render(
      <CommitOnBlurNumberInput
        value={0.25}
        step={0.01}
        onCommit={handleCommit}
      />,
    );

    const input = requireInput();
    fireEvent.change(input, { target: { value: "0.5" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(handleCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("0.25");
  });
});
