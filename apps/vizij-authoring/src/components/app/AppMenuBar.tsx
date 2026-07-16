import React from "react";
import {
  MenuBar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuCheckboxItem,
  MenuLabel,
  MenuSubmenu,
} from "../ui/MenuBar";
import { Button } from "../ui/Button";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useThemeStore } from "../../state/themeStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { appHistory, useHistoryStatus } from "../../state/history/historyStore";
import type {
  EditFocus,
  RotationDisplayMode,
} from "../../state/AuthoringUiProvider";
import { cn } from "../../utils/cn";

type AuthoringSurfaceMenuTarget =
  | "variables"
  | "poses"
  | "pose-groups"
  | "animations"
  | "programs";

interface AppMenuBarProps {
  onNew: () => void;
  onImport: () => void;
  onImportSkipChecks: () => void;
  onImportReferenceFace: () => void;
  onSave: () => void;
  onExport: () => void;
  canSave: boolean;
  saveDirty: boolean;
  showSelectionGlow: boolean;
  onToggleSelectionGlow: (enabled: boolean) => void;
  activeEditFocus: EditFocus;
  onSelectEditFocus: (focus: EditFocus) => void;
  rotationDisplayMode: RotationDisplayMode;
  onSelectRotationDisplayMode: (mode: RotationDisplayMode) => void;
  activeAuthoringSurface: AuthoringSurfaceMenuTarget;
  onSelectAuthoringSurface: (surface: AuthoringSurfaceMenuTarget) => void;
}

export function AppMenuBar({
  onNew,
  onImport,
  onImportSkipChecks,
  onImportReferenceFace,
  onSave,
  onExport,
  canSave,
  saveDirty,
  showSelectionGlow,
  onToggleSelectionGlow,
  activeEditFocus,
  onSelectEditFocus,
  rotationDisplayMode,
  onSelectRotationDisplayMode,
  activeAuthoringSurface,
  onSelectAuthoringSurface,
}: AppMenuBarProps) {
  const hierarchyPanelVisible = useWorkspaceStore(
    (state) => state.panels.hierarchy.isVisible,
  );
  const variablesPanelVisible = useWorkspaceStore(
    (state) => state.panels.variables.isVisible,
  );
  const posesPanelVisible = useWorkspaceStore(
    (state) => state.panels.poses.isVisible,
  );
  const inputsPanelVisible = useWorkspaceStore(
    (state) => state.panels.inputs.isVisible,
  );
  const materialsPanelVisible = useWorkspaceStore(
    (state) => state.panels.materials.isVisible,
  );
  const inspectorPanelVisible = useWorkspaceStore(
    (state) => state.panels.inspector.isVisible,
  );
  const speechPanelVisible = useWorkspaceStore(
    (state) => state.panels.speech.isVisible,
  );
  const debugPanelVisible = useWorkspaceStore(
    (state) => state.panels.debug.isVisible,
  );
  const animationPanelVisible = useWorkspaceStore(
    (state) => state.panels.animation.isVisible,
  );
  const motionGraphPanelVisible = useWorkspaceStore(
    (state) => state.panels.motiongraph.isVisible,
  );
  const referenceFacePanelVisible = useWorkspaceStore(
    (state) => state.panels.referenceFace.isVisible,
  );
  const setPanelVisibility = useWorkspaceStore(
    (state) => state.setPanelVisibility,
  );
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const canUndo = useHistoryStatus((state) => state.canUndo);
  const canRedo = useHistoryStatus((state) => state.canRedo);
  const controlAuthoringVisible =
    variablesPanelVisible || posesPanelVisible || materialsPanelVisible;
  const showAuthoringSurface = (surface: AuthoringSurfaceMenuTarget) => {
    if (
      surface === "variables" ||
      surface === "animations" ||
      surface === "programs"
    ) {
      setPanelVisibility("variables", true);
    }
    if (surface === "poses") {
      setPanelVisibility("poses", true);
    }
    if (surface === "pose-groups") {
      setPanelVisibility("materials", true);
    }
    onSelectAuthoringSurface(surface);
  };
  const setCenterPanelVisibility = (
    panel: "animation" | "motiongraph" | "referenceFace",
    isVisible: boolean,
  ) => {
    setPanelVisibility(panel, isVisible);
    if (panel === "motiongraph") {
      setPanelVisibility("motiongraphPalette", isVisible);
    } else if (isVisible) {
      setPanelVisibility("motiongraphPalette", false);
    }
    if (!isVisible) {
      return;
    }
    if (panel === "animation") {
      onSelectEditFocus("animation");
      return;
    }
    if (panel === "motiongraph") {
      onSelectEditFocus("procedural-animation-programming");
      return;
    }
    onSelectEditFocus("reference-face");
  };

  return (
    <MenuBar>
      <Menu label="File" testId="app-menu-file">
        <MenuItem onSelect={onNew}>New</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={onImport} testId="app-menu-file-import">
          Import...
        </MenuItem>
        <MenuItem onSelect={onImportSkipChecks}>
          Import (Skip Checks)...
        </MenuItem>
        <MenuItem
          onSelect={onImportReferenceFace}
          testId="app-menu-file-import-reference-face"
        >
          Import Reference Face...
        </MenuItem>
        <MenuItem onSelect={onExport} testId="app-menu-file-export">
          Export...
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={onSave}
          disabled={!canSave}
          testId="app-menu-file-save"
        >
          Save
        </MenuItem>
        <MenuItem onSelect={onExport} disabled={!canSave}>
          Save As...
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => {}}>Exit</MenuItem>
      </Menu>
      <Menu label="Edit" testId="app-menu-edit">
        <MenuItem
          onSelect={() => appHistory.undo()}
          disabled={!canUndo}
          testId="app-menu-edit-undo"
        >
          Undo
        </MenuItem>
        <MenuItem
          onSelect={() => appHistory.redo()}
          disabled={!canRedo}
          testId="app-menu-edit-redo"
        >
          Redo
        </MenuItem>
      </Menu>
      <Menu label="Mode" testId="app-menu-mode">
        <MenuLabel>Edit Focus</MenuLabel>
        <MenuCheckboxItem
          testId="app-menu-mode-default"
          checked={activeEditFocus === "default"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("default");
            }
          }}
        >
          Default
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-mode-animation"
          checked={activeEditFocus === "animation"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("animation");
            }
          }}
        >
          Animations
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-mode-pose-creation"
          checked={activeEditFocus === "pose-creation"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("pose-creation");
            }
          }}
        >
          Pose Creation
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-mode-pose-editing"
          checked={activeEditFocus === "pose-editing"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("pose-editing");
            }
          }}
        >
          Pose Editing
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-mode-procedural-animation"
          checked={activeEditFocus === "procedural-animation-programming"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("procedural-animation-programming");
            }
          }}
        >
          Procedural Animations
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-mode-reference-face"
          checked={activeEditFocus === "reference-face"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("reference-face");
            }
          }}
        >
          Reference Face
        </MenuCheckboxItem>
      </Menu>
      <Menu label="View" testId="app-menu-view">
        <MenuLabel>Left Panel</MenuLabel>
        <MenuCheckboxItem
          checked={hierarchyPanelVisible}
          onCheckedChange={(checked) =>
            setPanelVisibility("hierarchy", checked)
          }
        >
          Face Elements
        </MenuCheckboxItem>
        <MenuSubmenu
          label="Authoring"
          checked={controlAuthoringVisible}
          onSelect={() => {
            const nextVisible = !controlAuthoringVisible;
            setPanelVisibility("variables", nextVisible);
            setPanelVisibility("poses", nextVisible);
            setPanelVisibility("materials", nextVisible);
          }}
        >
          <MenuCheckboxItem
            checked={activeAuthoringSurface === "variables"}
            onCheckedChange={(checked) => {
              if (!checked) {
                return;
              }
              showAuthoringSurface("variables");
            }}
          >
            Drivers
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={activeAuthoringSurface === "poses"}
            onCheckedChange={(checked) => {
              if (!checked) {
                return;
              }
              showAuthoringSurface("poses");
            }}
          >
            Poses
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={activeAuthoringSurface === "pose-groups"}
            onCheckedChange={(checked) => {
              if (!checked) {
                return;
              }
              showAuthoringSurface("pose-groups");
            }}
          >
            Pose Groups
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={activeAuthoringSurface === "animations"}
            onCheckedChange={(checked) => {
              if (!checked) {
                return;
              }
              showAuthoringSurface("animations");
            }}
          >
            Animations
          </MenuCheckboxItem>
          <MenuCheckboxItem
            checked={activeAuthoringSurface === "programs"}
            onCheckedChange={(checked) => {
              if (!checked) {
                return;
              }
              showAuthoringSurface("programs");
            }}
          >
            Programs
          </MenuCheckboxItem>
        </MenuSubmenu>
        <MenuCheckboxItem
          checked={inputsPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("inputs", checked)}
        >
          Inputs
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuLabel>Center Panel</MenuLabel>
        <MenuCheckboxItem
          testId="app-menu-view-center-animation"
          checked={animationPanelVisible}
          onCheckedChange={(checked) =>
            setCenterPanelVisibility("animation", checked)
          }
        >
          Animation
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-view-center-program"
          checked={motionGraphPanelVisible}
          onCheckedChange={(checked) =>
            setCenterPanelVisibility("motiongraph", checked)
          }
        >
          Program
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={referenceFacePanelVisible}
          onCheckedChange={(checked) =>
            setCenterPanelVisibility("referenceFace", checked)
          }
        >
          Reference Face
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuLabel>Right Panel</MenuLabel>
        <MenuCheckboxItem
          testId="app-menu-view-right-inspector"
          checked={inspectorPanelVisible}
          onCheckedChange={(checked) =>
            setPanelVisibility("inspector", checked)
          }
        >
          Inspector
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={speechPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("speech", checked)}
        >
          Speech
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={debugPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("debug", checked)}
        >
          Debug
        </MenuCheckboxItem>
      </Menu>
      <Menu label="Settings" testId="app-menu-settings">
        <MenuLabel>Rotation Display</MenuLabel>
        <MenuCheckboxItem
          checked={rotationDisplayMode === "degrees"}
          onCheckedChange={(checked) =>
            onSelectRotationDisplayMode(checked ? "degrees" : "radians")
          }
        >
          Show Rotation in Degrees
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuLabel>Selection</MenuLabel>
        <MenuCheckboxItem
          checked={showSelectionGlow}
          onCheckedChange={onToggleSelectionGlow}
        >
          Highlight Selected
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuLabel>Appearance</MenuLabel>
        <MenuCheckboxItem
          checked={theme === "dark"}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        >
          Dark Mode
        </MenuCheckboxItem>
      </Menu>

      <Button
        data-testid="app-save-button"
        type="button"
        variant="ghost"
        size="sm"
        disabled={!canSave}
        onClick={onSave}
        className={cn(
          "ml-2 h-8 rounded-lg px-3 text-sm font-semibold",
          saveDirty
            ? "bg-accent/10 text-accent ring-1 ring-accent/35 hover:bg-accent/15 hover:text-accent"
            : "text-text-secondary",
        )}
      >
        {saveDirty ? (
          <span
            aria-hidden="true"
            className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-current"
          />
        ) : null}
        Save
      </Button>

      <div className="flex-1" />
      <ThemeToggle className="mr-2" />
    </MenuBar>
  );
}
