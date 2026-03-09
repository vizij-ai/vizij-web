import type { EditFocus } from "./AuthoringUiProvider";
import {
  createInitialWorkspacePanels,
  type WorkspacePanelId,
} from "./workspaceStore";

export function createEditFocusPanelVisibility(
  focus: EditFocus,
): Record<WorkspacePanelId, boolean> {
  const base = createInitialWorkspacePanels();
  const nextVisibility: Record<WorkspacePanelId, boolean> = {
    hierarchy: base.hierarchy.isVisible,
    variables: base.variables.isVisible,
    poses: base.poses.isVisible,
    inputs: base.inputs.isVisible,
    motiongraphPalette: base.motiongraphPalette.isVisible,
    inspector: base.inspector.isVisible,
    debug: base.debug.isVisible,
    animation: base.animation.isVisible,
    motiongraph: base.motiongraph.isVisible,
    toolbar: base.toolbar.isVisible,
    referenceFace: base.referenceFace.isVisible,
    materials: base.materials.isVisible,
    speech: base.speech.isVisible,
  };

  if (focus === "animation") {
    nextVisibility.hierarchy = false;
    nextVisibility.variables = false;
    nextVisibility.poses = false;
    nextVisibility.materials = false;
    nextVisibility.inputs = true;
    nextVisibility.motiongraphPalette = false;
    nextVisibility.animation = true;
    nextVisibility.motiongraph = false;
    nextVisibility.referenceFace = false;
    return nextVisibility;
  }

  if (focus === "procedural-animation-programming") {
    nextVisibility.hierarchy = false;
    nextVisibility.variables = false;
    nextVisibility.poses = false;
    nextVisibility.materials = false;
    nextVisibility.inputs = true;
    nextVisibility.motiongraphPalette = true;
    nextVisibility.animation = false;
    nextVisibility.motiongraph = true;
    nextVisibility.referenceFace = false;
    return nextVisibility;
  }

  if (focus === "reference-face") {
    nextVisibility.animation = false;
    nextVisibility.motiongraph = false;
    nextVisibility.referenceFace = true;
    nextVisibility.motiongraphPalette = false;
    return nextVisibility;
  }

  if (focus === "pose-creation") {
    nextVisibility.hierarchy = false;
    nextVisibility.variables = false;
    nextVisibility.poses = false;
    nextVisibility.materials = false;
    nextVisibility.inputs = true;
    nextVisibility.motiongraphPalette = false;
    nextVisibility.animation = false;
    nextVisibility.motiongraph = false;
    nextVisibility.referenceFace = false;
    nextVisibility.toolbar = false;
    nextVisibility.speech = false;
    nextVisibility.debug = false;
  }

  return nextVisibility;
}
