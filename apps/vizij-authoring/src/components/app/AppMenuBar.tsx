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
  const dependencyChainPanelVisible = useWorkspaceStore(
    (state) => state.panels.dependencyChain.isVisible,
  );
  const inspectorPanelVisible = useWorkspaceStore(
    (state) => state.panels.inspector.isVisible,
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
        <MenuItem onSelect={() => { }} disabled>
          Save
        </MenuItem>
        <MenuItem onSelect={() => { }} disabled>
          Save As...
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => { }}>Exit</MenuItem>
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

        <MenuSeparator />
        <MenuLabel>Center Panel</MenuLabel>
        <MenuCheckboxItem
          checked={animationPanelVisible}
          onCheckedChange={() => togglePanel("animation")}
        >
          Timeline
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={motionGraphPanelVisible}
          onCheckedChange={() => togglePanel("motiongraph")}
        >
          MotionGraph
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={referenceFacePanelVisible}
          onCheckedChange={() => togglePanel("referenceFace")}
        >
          Reference Face
        </MenuCheckboxItem>
        <MenuCheckboxItem
          checked={dependencyChainPanelVisible}
          onCheckedChange={() => togglePanel("dependencyChain")}
        >
          Dependency Chain
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
