import React from "react";
import {
  MenuBar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuCheckboxItem,
  MenuLabel,
} from "../ui/MenuBar";
import { ThemeToggle } from "../ui/ThemeToggle";
import { useWorkspaceStore } from "../../state/workspaceStore";

interface AppMenuBarProps {
  onNew: () => void;
  onImport: () => void;
  onImportSkipChecks: () => void;
  onImportReferenceFace: () => void;
  onExport: () => void;
  showSelectionGlow: boolean;
  onToggleSelectionGlow: (enabled: boolean) => void;
}

export function AppMenuBar({
  onNew,
  onImport,
  onImportSkipChecks,
  onImportReferenceFace,
  onExport,
  showSelectionGlow,
  onToggleSelectionGlow,
}: AppMenuBarProps) {
  const { panels, togglePanel } = useWorkspaceStore();

  return (
    <MenuBar>
      <Menu label="File">
        <MenuItem onSelect={onNew}>New</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={onImport}>Import...</MenuItem>
        <MenuItem onSelect={onImportSkipChecks}>
          Import (Skip Checks)...
        </MenuItem>
        <MenuItem onSelect={onImportReferenceFace}>
          Import Reference Face...
        </MenuItem>
        <MenuItem onSelect={onExport}>Export...</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => {}} disabled>
          Save
        </MenuItem>
        <MenuItem onSelect={() => {}} disabled>
          Save As...
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => {}}>Exit</MenuItem>
      </Menu>
      <Menu label="Edit">
        <MenuItem>Undo</MenuItem>
        <MenuItem>Redo</MenuItem>
      </Menu>
      <Menu label="View">
        <MenuLabel>Left Panel</MenuLabel>
        <MenuCheckboxItem
          checked={panels.hierarchy.isVisible}
          onCheckedChange={() => togglePanel("hierarchy")}
        >
          Hierarchy
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={panels.variables.isVisible}
          onCheckedChange={() => togglePanel("variables")}
        >
          Variables
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={panels.poses.isVisible}
          onCheckedChange={() => togglePanel("poses")}
        >
          Poses
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={panels.inputs.isVisible}
          onCheckedChange={() => togglePanel("inputs")}
        >
          Inputs
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={panels.materials.isVisible}
          onCheckedChange={() => togglePanel("materials")}
        >
          Pose Groups
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Center Panel</MenuLabel>
        <MenuCheckboxItem
          checked={panels.animation.isVisible}
          onCheckedChange={() => togglePanel("animation")}
        >
          Timeline
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={panels.referenceFace.isVisible}
          onCheckedChange={() => togglePanel("referenceFace")}
        >
          Reference Face
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Right Panel</MenuLabel>
        <MenuCheckboxItem
          checked={panels.inspector.isVisible}
          onCheckedChange={() => togglePanel("inspector")}
        >
          Inspector
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={panels.debug.isVisible}
          onCheckedChange={() => togglePanel("debug")}
        >
          Debug
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuCheckboxItem
          checked={showSelectionGlow}
          onCheckedChange={onToggleSelectionGlow}
        >
          Highlight Selected
        </MenuCheckboxItem>
      </Menu>

      <div className="flex-1" />
      <ThemeToggle className="mr-2" />
    </MenuBar>
  );
}
