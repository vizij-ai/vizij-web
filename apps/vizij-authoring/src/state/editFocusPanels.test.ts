import { describe, expect, it } from "vitest";
import { createEditFocusPanelVisibility } from "./editFocusPanels";

describe("createEditFocusPanelVisibility", () => {
  it("keeps the authoring list open beside the animation panel", () => {
    const visibility = createEditFocusPanelVisibility("animation");

    expect(visibility.variables).toBe(true);
    expect(visibility.inputs).toBe(true);
    expect(visibility.animation).toBe(true);
    expect(visibility.motiongraph).toBe(false);
    expect(visibility.motiongraphPalette).toBe(false);
  });

  it("keeps the authoring list open beside the program panel", () => {
    const visibility = createEditFocusPanelVisibility(
      "procedural-animation-programming",
    );

    expect(visibility.variables).toBe(true);
    expect(visibility.inputs).toBe(true);
    expect(visibility.animation).toBe(false);
    expect(visibility.motiongraph).toBe(true);
    expect(visibility.motiongraphPalette).toBe(true);
  });

  it("shows only inputs, face, and inspector for pose creation focus", () => {
    const visibility = createEditFocusPanelVisibility("pose-creation");

    expect(visibility.hierarchy).toBe(false);
    expect(visibility.variables).toBe(false);
    expect(visibility.poses).toBe(false);
    expect(visibility.materials).toBe(false);
    expect(visibility.inputs).toBe(true);
    expect(visibility.inspector).toBe(true);
    expect(visibility.toolbar).toBe(false);
    expect(visibility.animation).toBe(false);
    expect(visibility.motiongraph).toBe(false);
    expect(visibility.referenceFace).toBe(false);
    expect(visibility.speech).toBe(false);
    expect(visibility.debug).toBe(false);
  });

  it("shows only poses, pose groups, and inspector for pose editing focus", () => {
    const visibility = createEditFocusPanelVisibility("pose-editing");

    expect(visibility.hierarchy).toBe(false);
    expect(visibility.variables).toBe(false);
    expect(visibility.poses).toBe(true);
    expect(visibility.materials).toBe(true);
    expect(visibility.inputs).toBe(false);
    expect(visibility.inspector).toBe(true);
    expect(visibility.toolbar).toBe(false);
    expect(visibility.animation).toBe(false);
    expect(visibility.motiongraph).toBe(false);
    expect(visibility.referenceFace).toBe(false);
    expect(visibility.speech).toBe(false);
    expect(visibility.debug).toBe(false);
  });
});
