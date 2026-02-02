import React from "react";
import {
  MenuBar,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuCheckboxItem,
  MenuLabel,
} from "../ui/MenuBar";
import { useWorkspaceStore } from "../../state/workspaceStore";

interface AppMenuBarProps {
  onNew: () => void;
  onImport: () => void;
  onImportSkipChecks: () => void;
  onImportReferenceFace: () => void;
  onExport: () => void;
}

export function AppMenuBar({
  onNew,
  onImport,
  onImportSkipChecks,
  onImportReferenceFace,
  onExport,
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
      </Menu>
    </MenuBar>
  );
}
