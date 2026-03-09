import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInitialWorkspacePanels,
  useWorkspaceStore,
} from "../../state/workspaceStore";
import { useThemeStore } from "../../state/themeStore";
import { AppMenuBar } from "./AppMenuBar";

function renderMenuBar() {
  return render(
    <AppMenuBar
      onNew={vi.fn()}
      onImport={vi.fn()}
      onImportSkipChecks={vi.fn()}
      onImportReferenceFace={vi.fn()}
      onSave={vi.fn()}
      onExport={vi.fn()}
      canSave
      saveDirty={false}
      showSelectionGlow={false}
      onToggleSelectionGlow={vi.fn()}
      activeEditFocus="default"
      onSelectEditFocus={vi.fn()}
      rotationDisplayMode="radians"
      onSelectRotationDisplayMode={vi.fn()}
      activeAuthoringSurface="variables"
      onSelectAuthoringSurface={vi.fn()}
    />,
  );
}

function resetWorkspaceStore() {
  useWorkspaceStore.setState({
    panels: createInitialWorkspacePanels(),
  });
}

describe("AppMenuBar", () => {
  beforeEach(() => {
    resetWorkspaceStore();
    useThemeStore.getState().setTheme("dark");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the updated panel labels in the View menu", async () => {
    renderMenuBar();

    fireEvent.click(screen.getByTestId("app-menu-view"));

    expect(await screen.findByText("Face Elements")).toBeTruthy();
    expect(screen.getByText("Authoring")).toBeTruthy();
    expect(screen.getByText("Center Panel")).toBeTruthy();
    expect(screen.getByText("Animation")).toBeTruthy();
    expect(screen.getByText("Program")).toBeTruthy();
    expect(screen.getByText("Reference Face")).toBeTruthy();
    expect(screen.queryByText("Node Palette")).toBeNull();
    expect(screen.queryByText("Hierarchy")).toBeNull();
    expect(screen.queryByText("Runtime Source")).toBeNull();
  });

  it("shows all authoring surfaces in the Authoring flyout", async () => {
    renderMenuBar();

    fireEvent.click(screen.getByTestId("app-menu-view"));

    const controlAuthoringTrigger = await screen.findByRole("menuitem", {
      name: "Authoring",
    });
    fireEvent.click(controlAuthoringTrigger);

    await waitFor(() => {
      expect(screen.getByText("Drivers")).toBeTruthy();
      expect(screen.getByText("Poses")).toBeTruthy();
      expect(screen.getByText("Pose Groups")).toBeTruthy();
      expect(screen.getByText("Animations")).toBeTruthy();
      expect(screen.getByText("Programs")).toBeTruthy();
    });
  });

  it("moves rotation, highlight, and theme toggles into Settings", async () => {
    renderMenuBar();

    fireEvent.click(screen.getByTestId("app-menu-view"));
    expect(screen.queryByText("Show Rotation in Degrees")).toBeNull();
    expect(screen.queryByText("Highlight Selected")).toBeNull();

    fireEvent.click(screen.getByTestId("app-menu-settings"));

    expect(await screen.findByText("Show Rotation in Degrees")).toBeTruthy();
    expect(screen.getByText("Highlight Selected")).toBeTruthy();
    expect(screen.getByText("Dark Mode")).toBeTruthy();
  });

  it("treats Program as a center-panel mode and reveals the Node Palette", async () => {
    renderMenuBar();

    fireEvent.click(screen.getByTestId("app-menu-view"));
    fireEvent.click(await screen.findByText("Program"));

    const panels = useWorkspaceStore.getState().panels;
    expect(panels.motiongraph.isVisible).toBe(true);
    expect(panels.motiongraphPalette.isVisible).toBe(true);
    expect(panels.animation.isVisible).toBe(false);
    expect(panels.referenceFace.isVisible).toBe(false);
  });
});
