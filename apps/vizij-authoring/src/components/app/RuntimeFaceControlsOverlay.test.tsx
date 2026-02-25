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

  it("renders migrate-all badges and action when legacy summary is provided", () => {
    const onResetInputs = vi.fn();
    const onMigrateAllLegacyBindings = vi.fn();
    const view = render(
      <RuntimeFaceControlsOverlay
        onResetInputs={onResetInputs}
        migrationSummary={{
          totalLegacy: 3,
          migrated: 1,
          convertible: 1,
          nonConvertible: 1,
        }}
        onMigrateAllLegacyBindings={onMigrateAllLegacyBindings}
      />,
    );

    expect(view.getByText("Legacy 3")).toBeTruthy();
    expect(view.getByText("Migrated 1")).toBeTruthy();
    expect(view.getByText("Convertible 1")).toBeTruthy();
    expect(view.getByText("Non-convertible 1")).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "Reset Inputs" }));
    expect(onResetInputs).toHaveBeenCalledTimes(1);

    fireEvent.click(view.getByTestId("runtime-migrate-all-legacy-action"));
    expect(onMigrateAllLegacyBindings).toHaveBeenCalledTimes(1);
  });
});
