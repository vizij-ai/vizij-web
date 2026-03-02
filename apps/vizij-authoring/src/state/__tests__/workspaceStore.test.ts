import { beforeEach, describe, expect, it } from "vitest";
import {
  createInitialWorkspacePanels,
  useWorkspaceStore,
} from "../workspaceStore";

function resetWorkspaceStore() {
  useWorkspaceStore.setState({
    panels: createInitialWorkspacePanels(),
  });
}

describe("workspaceStore center mode exclusivity", () => {
  beforeEach(() => {
    resetWorkspaceStore();
  });

  it("enables only one center mode when toggled on", () => {
    const state = useWorkspaceStore.getState();

    state.togglePanel("animation");
    let panels = useWorkspaceStore.getState().panels;
    expect(panels.animation.isVisible).toBe(true);
    expect(panels.motiongraph.isVisible).toBe(false);
    expect(panels.referenceFace.isVisible).toBe(false);

    state.togglePanel("motiongraph");
    panels = useWorkspaceStore.getState().panels;
    expect(panels.animation.isVisible).toBe(false);
    expect(panels.motiongraph.isVisible).toBe(true);
    expect(panels.referenceFace.isVisible).toBe(false);

    state.togglePanel("referenceFace");
    panels = useWorkspaceStore.getState().panels;
    expect(panels.animation.isVisible).toBe(false);
    expect(panels.motiongraph.isVisible).toBe(false);
    expect(panels.referenceFace.isVisible).toBe(true);
  });

  it("applies exclusivity through explicit setPanelVisibility", () => {
    const state = useWorkspaceStore.getState();

    state.setPanelVisibility("animation", true);
    state.setPanelVisibility("motiongraph", true);

    let panels = useWorkspaceStore.getState().panels;
    expect(panels.animation.isVisible).toBe(false);
    expect(panels.motiongraph.isVisible).toBe(true);
    expect(panels.referenceFace.isVisible).toBe(false);

    state.setPanelVisibility("referenceFace", true);
    panels = useWorkspaceStore.getState().panels;
    expect(panels.animation.isVisible).toBe(false);
    expect(panels.motiongraph.isVisible).toBe(false);
    expect(panels.referenceFace.isVisible).toBe(true);
  });

  it("does not auto-enable another center mode when turning one off", () => {
    const state = useWorkspaceStore.getState();

    state.setPanelVisibility("animation", true);
    state.setPanelVisibility("animation", false);

    const panels = useWorkspaceStore.getState().panels;
    expect(panels.animation.isVisible).toBe(false);
    expect(panels.motiongraph.isVisible).toBe(false);
    expect(panels.referenceFace.isVisible).toBe(false);
  });
});
