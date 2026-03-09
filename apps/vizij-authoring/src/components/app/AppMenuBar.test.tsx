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
    expect(screen.getByText("Control Authoring")).toBeTruthy();
    expect(screen.getByText("Runtime Source")).toBeTruthy();
    expect(screen.queryByText("Hierarchy")).toBeNull();
  });

  it("shows Drivers, Poses, and Pose Groups in the Control Authoring flyout", async () => {
    renderMenuBar();

    fireEvent.click(screen.getByTestId("app-menu-view"));

    const controlAuthoringTrigger = await screen.findByRole("menuitem", {
      name: "Control Authoring",
    });
    fireEvent.click(controlAuthoringTrigger);

    await waitFor(() => {
      expect(screen.getByText("Drivers")).toBeTruthy();
      expect(screen.getByText("Poses")).toBeTruthy();
      expect(screen.getByText("Pose Groups")).toBeTruthy();
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
});
