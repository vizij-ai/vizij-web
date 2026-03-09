import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RuntimeFaceControlsOverlay } from "./RuntimeFaceControlsOverlay";

const mockRuntimeState = {
  ready: true,
  loading: false,
  stepHz: 60,
};

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => mockRuntimeState,
}));

describe("RuntimeFaceControlsOverlay", () => {
  beforeEach(() => {
    cleanup();
    mockRuntimeState.ready = true;
    mockRuntimeState.loading = false;
    mockRuntimeState.stepHz = 60;
  });

  it("hides controls while runtime is not ready", () => {
    mockRuntimeState.ready = false;
    const view = render(<RuntimeFaceControlsOverlay />);
    expect(view.queryByText(/FPS:/i)).toBeNull();
  });

  it("renders reset action and fps readout while ready", () => {
    const onResetInputs = vi.fn();
    const view = render(
      <RuntimeFaceControlsOverlay onResetInputs={onResetInputs} />,
    );

    expect(view.getByText(/FPS: 60 fps/i)).toBeTruthy();

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
