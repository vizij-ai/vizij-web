import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeFaceControlsOverlay } from "./RuntimeFaceControlsOverlay";

const mockRuntimeState: { status: "loading" | "ready" | "error" } = {
  status: "ready",
};

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => mockRuntimeState,
}));

describe("RuntimeFaceControlsOverlay", () => {
  beforeEach(() => {
    cleanup();
    mockRuntimeState.status = "ready";
  });

  it("hides controls while the face is not ready", () => {
    mockRuntimeState.status = "loading";
    const view = render(<RuntimeFaceControlsOverlay onResetInputs={vi.fn()} />);
    expect(view.queryByRole("button", { name: "Reset Inputs" })).toBeNull();
  });

  it("renders the reset action and the ready flag while ready", () => {
    const onResetInputs = vi.fn();
    const view = render(
      <RuntimeFaceControlsOverlay onResetInputs={onResetInputs} />,
    );

    expect(view.getByText("Ready")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Reset Inputs" }));
    expect(onResetInputs).toHaveBeenCalledTimes(1);
  });

  it("renders the provided runtime action buttons", () => {
    const onStopAnimation = vi.fn();
    const onStopProgram = vi.fn();
    const view = render(
      <RuntimeFaceControlsOverlay
        runtimeStatusLabel="Program: Playing"
        runtimeActions={[
          { label: "Stop Animation", onClick: onStopAnimation },
          { label: "Stop Program", onClick: onStopProgram },
        ]}
      />,
    );

    expect(view.getByText("Program: Playing")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Stop Animation" }));
    fireEvent.click(view.getByRole("button", { name: "Stop Program" }));

    expect(onStopAnimation).toHaveBeenCalledTimes(1);
    expect(onStopProgram).toHaveBeenCalledTimes(1);
  });
});
