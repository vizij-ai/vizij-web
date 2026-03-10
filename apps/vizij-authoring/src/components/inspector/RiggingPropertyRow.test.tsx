import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CommitOnBlurNumberInput,
  RiggingPropertyRow,
} from "./RiggingPropertyRow";

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

describe("RiggingPropertyRow", () => {
  it("toggles expanded sections from the row but not from number fields or row actions", () => {
    const handleCommit = vi.fn();
    const handleLockClick = vi.fn();

    render(
      <RiggingPropertyRow
        label="Position"
        renderMainInput={() => (
          <CommitOnBlurNumberInput
            value={1}
            step={0.01}
            onCommit={handleCommit}
          />
        )}
        renderDefaultInput={() => <div>Default Controls</div>}
        renderRowAction={() => (
          <button type="button" onClick={handleLockClick}>
            Lock
          </button>
        )}
      />,
    );

    const header = screen.getByTitle("Toggle Position edit controls");
    fireEvent.click(header);
    expect(screen.getByText("Default Controls")).toBeTruthy();

    const input = requireInput();
    fireEvent.click(input);
    expect(screen.getByText("Default Controls")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(handleLockClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Default Controls")).toBeTruthy();

    fireEvent.click(header);
    expect(screen.queryByText("Default Controls")).toBeNull();
  });
});
