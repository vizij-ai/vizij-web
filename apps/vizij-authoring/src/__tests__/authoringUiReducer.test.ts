import { describe, expect, it } from "vitest";
import {
  authoringUiReducer,
  type AuthoringUiState,
} from "../state/AuthoringUiProvider";

const baseState: AuthoringUiState = {
  activeWorkbench: "import-export",
  includeVizijBundle: true,
  includeImportedAnimations: false,
  activeRiggingTab: "rigging",
  skipDiscrepancyCheck: true,
  morphTriangleCleanup: "off",
  activeRuntimeSource: "none",
  activeEditFocus: "default",
  rotationDisplayMode: "degrees",
};

describe("authoringUiReducer", () => {
  it("chooses the morph target cleanup", () => {
    const safe = authoringUiReducer(baseState, {
      type: "set-morph-triangle-cleanup",
      payload: "safe",
    });
    expect(safe.morphTriangleCleanup).toBe("safe");
    const overall = authoringUiReducer(safe, {
      type: "set-morph-triangle-cleanup",
      payload: "overall",
    });
    expect(overall.morphTriangleCleanup).toBe("overall");
    expect(
      authoringUiReducer(overall, {
        type: "set-morph-triangle-cleanup",
        payload: "off",
      }).morphTriangleCleanup,
    ).toBe("off");
    expect(
      authoringUiReducer(safe, {
        type: "set-morph-triangle-cleanup",
        payload: "safe",
      }),
    ).toBe(safe);
  });

  it("updates the active workbench", () => {
    const result = authoringUiReducer(baseState, {
      type: "set-workbench",
      payload: "scene-composer",
    });
    expect(result.activeWorkbench).toBe("scene-composer");
  });

  it("disables animations when the Vizij bundle is deselected", () => {
    const start: AuthoringUiState = {
      ...baseState,
      includeImportedAnimations: true,
    };
    const result = authoringUiReducer(start, {
      type: "set-include-bundle",
      payload: false,
    });
    expect(result.includeVizijBundle).toBe(false);
    expect(result.includeImportedAnimations).toBe(false);
  });

  it("ignores animation opt-in when the bundle is disabled", () => {
    const start: AuthoringUiState = {
      ...baseState,
      includeVizijBundle: false,
    };
    const result = authoringUiReducer(start, {
      type: "set-include-animations",
      payload: true,
    });
    expect(result.includeImportedAnimations).toBe(false);
  });

  it("allows animation toggles when the bundle is enabled", () => {
    const result = authoringUiReducer(baseState, {
      type: "set-include-animations",
      payload: true,
    });
    expect(result.includeImportedAnimations).toBe(true);
  });

  it("updates the active runtime source", () => {
    const result = authoringUiReducer(baseState, {
      type: "set-active-runtime-source",
      payload: "animation",
    });
    expect(result.activeRuntimeSource).toBe("animation");
  });

  it("updates the active edit focus", () => {
    const result = authoringUiReducer(baseState, {
      type: "set-edit-focus",
      payload: "pose-editing",
    });
    expect(result.activeEditFocus).toBe("pose-editing");
  });

  it("updates the rotation display mode", () => {
    const result = authoringUiReducer(baseState, {
      type: "set-rotation-display-mode",
      payload: "degrees",
    });
    expect(result.rotationDisplayMode).toBe("degrees");
  });
});
