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
import type { EditFocus } from "../../state/AuthoringUiProvider";

interface AppMenuBarProps {
  onNew: () => void;
  onImport: () => void;
  onImportSkipChecks: () => void;
  onImportReferenceFace: () => void;
  onExport: () => void;
  showSelectionGlow: boolean;
  onToggleSelectionGlow: (enabled: boolean) => void;
  activeEditFocus: EditFocus;
  onSelectEditFocus: (focus: EditFocus) => void;
}

export function AppMenuBar({
  onNew,
  onImport,
  onImportSkipChecks,
  onImportReferenceFace,
  onExport,
  showSelectionGlow,
  onToggleSelectionGlow,
  activeEditFocus,
  onSelectEditFocus,
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
        <MenuLabel>Edit Focus</MenuLabel>
        <MenuCheckboxItem
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
          checked={activeEditFocus === "reference-face"}
          onCheckedChange={(checked) => {
            if (checked) {
              onSelectEditFocus("reference-face");
            }
          }}
        >
          Reference Face
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuItem>Undo</MenuItem>
        <MenuItem>Redo</MenuItem>
      </Menu>
      <Menu label="View">
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
          checked={inputsPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("inputs", checked)}
        >
          Inputs
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
          checked={motionGraphPaletteVisible}
          onCheckedChange={(checked) =>
            setPanelVisibility("motiongraphPalette", checked)
          }
        >
          Procedural Animation Palette
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
          checked={debugPanelVisible}
          onCheckedChange={(checked) => setPanelVisibility("debug", checked)}
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
