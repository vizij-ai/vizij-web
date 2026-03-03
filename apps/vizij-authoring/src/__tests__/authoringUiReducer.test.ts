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
  activeRuntimeSource: "none",
  activeEditFocus: "default",
};

describe("authoringUiReducer", () => {
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
      payload: "reference-face",
    });
    expect(result.activeEditFocus).toBe("reference-face");
  });
});
