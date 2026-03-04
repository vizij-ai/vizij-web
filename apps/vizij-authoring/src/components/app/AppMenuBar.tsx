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
  const animationPanelVisible = useWorkspaceStore(
    (state) => state.panels.animation.isVisible,
  );
  const motionGraphPanelVisible = useWorkspaceStore(
    (state) => state.panels.motiongraph.isVisible,
  );
  const referenceFacePanelVisible = useWorkspaceStore(
    (state) => state.panels.referenceFace.isVisible,
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
  const togglePanel = useWorkspaceStore((state) => state.togglePanel);

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
          checked={hierarchyPanelVisible}
          onCheckedChange={() => togglePanel("hierarchy")}
        >
          Hierarchy
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={variablesPanelVisible}
          onCheckedChange={() => togglePanel("variables")}
        >
          Drivers
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={posesPanelVisible}
          onCheckedChange={() => togglePanel("poses")}
        >
          Poses
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={inputsPanelVisible}
          onCheckedChange={() => togglePanel("inputs")}
        >
          Inputs
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={materialsPanelVisible}
          onCheckedChange={() => togglePanel("materials")}
        >
          Pose Groups
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={motionGraphPaletteVisible}
          onCheckedChange={() => togglePanel("motiongraphPalette")}
        >
          Procedural Animation Programming Palette
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Center Panel</MenuLabel>
        <MenuCheckboxItem
          checked={animationPanelVisible}
          onCheckedChange={() => togglePanel("animation")}
        >
          Animation
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={motionGraphPanelVisible}
          onCheckedChange={() => togglePanel("motiongraph")}
        >
          Procedural Animation Programming
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={referenceFacePanelVisible}
          onCheckedChange={() => togglePanel("referenceFace")}
        >
          Reference Face
        </MenuCheckboxItem>

        <MenuSeparator />
        <MenuLabel>Right Panel</MenuLabel>
        <MenuCheckboxItem
          checked={inspectorPanelVisible}
          onCheckedChange={() => togglePanel("inspector")}
        >
          Inspector
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={speechPanelVisible}
          onCheckedChange={() => togglePanel("speech")}
        >
          Speech
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={debugPanelVisible}
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
