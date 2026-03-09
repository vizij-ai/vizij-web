import React from "react";
import {
  MenuBar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuCheckboxItem,
  MenuLabel,
} from "../ui/MenuBar";
import { Button } from "../ui/Button";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useWorkspaceStore } from "../../state/workspaceStore";
import type {
  EditFocus,
  RotationDisplayMode,
} from "../../state/AuthoringUiProvider";
import { cn } from "../../utils/cn";

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
  const motionGraphPaletteVisible = useWorkspaceStore(
    (state) => state.panels.motiongraphPalette.isVisible,
  );
  const materialsPanelVisible = useWorkspaceStore(
    (state) => state.panels.materials.isVisible,
  );
  const toolbarPanelVisible = useWorkspaceStore(
    (state) => state.panels.toolbar.isVisible,
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
  const setPanelVisibility = useWorkspaceStore(
    (state) => state.setPanelVisibility,
  );
  const controlAuthoringVisible =
    variablesPanelVisible || posesPanelVisible || materialsPanelVisible;

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
        <MenuItem>Undo</MenuItem>
        <MenuItem>Redo</MenuItem>
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
          Hierarchy
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={controlAuthoringVisible}
          onCheckedChange={(checked) => {
            setPanelVisibility("variables", checked);
            setPanelVisibility("poses", checked);
            setPanelVisibility("materials", checked);
          }}
        >
          Control Authoring
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={variablesPanelVisible}
          onCheckedChange={(checked) =>
            setPanelVisibility("variables", checked)
          }
        >
          <span className="pl-4">Drivers</span>
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={posesPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("poses", checked)}
        >
          <span className="pl-4">Poses</span>
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={materialsPanelVisible}
          onCheckedChange={(checked) =>
            setPanelVisibility("materials", checked)
          }
        >
          <span className="pl-4">Pose Groups</span>
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={inputsPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("inputs", checked)}
        >
          Inputs
        </MenuCheckboxItem>
        <MenuCheckboxItem
          testId="app-menu-view-procedural-animation"
          checked={motionGraphPaletteVisible}
          onCheckedChange={(checked) =>
            setPanelVisibility("motiongraphPalette", checked)
          }
        >
          Procedural Animation
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Right Panel</MenuLabel>
        <MenuCheckboxItem
          checked={toolbarPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("toolbar", checked)}
        >
          Control
        </MenuCheckboxItem>
        <MenuCheckboxItem
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

        <MenuSeparator />
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
        <MenuCheckboxItem
          checked={showSelectionGlow}
          onCheckedChange={onToggleSelectionGlow}
        >
          Highlight Selected
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
