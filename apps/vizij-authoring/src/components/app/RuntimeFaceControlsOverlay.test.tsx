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

  it("renders the active-runtime stop action when provided", () => {
    const onPlayActiveRuntime = vi.fn();
    const onPauseActiveRuntime = vi.fn();
    const onStopActiveRuntime = vi.fn();
    const view = render(
      <RuntimeFaceControlsOverlay
        runtimeStatusLabel="Program: Playing"
        onPlayActiveRuntime={onPlayActiveRuntime}
        onPauseActiveRuntime={onPauseActiveRuntime}
        onStopActiveRuntime={onStopActiveRuntime}
        playButtonLabel="Play Program"
        pauseButtonLabel="Pause Program"
        stopButtonLabel="Stop Program"
      />,
    );

    expect(view.getByText("Program: Playing")).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Play Program" }));
    fireEvent.click(view.getByRole("button", { name: "Pause Program" }));
    fireEvent.click(view.getByRole("button", { name: "Stop Program" }));

    expect(onPlayActiveRuntime).toHaveBeenCalledTimes(1);
    expect(onPauseActiveRuntime).toHaveBeenCalledTimes(1);
    expect(onStopActiveRuntime).toHaveBeenCalledTimes(1);
  });
});
