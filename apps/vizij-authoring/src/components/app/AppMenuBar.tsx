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
  /** The shipped standard profiles a face may opt into (empty = none). */
  standardProfiles: { id: string; title: string }[];
  /** Profile ids the open GLB embeds (checked state of the toggles). */
  embeddedProfileIds: string[];
  /** Import (`enabled`) or remove a standard profile in the open GLB. */
  onToggleStandardProfile: (profileId: string, enabled: boolean) => void;
  /** Download an embedded profile as canonical (unprefixed) JSON. */
  onExportStandardProfileJson: (profileId: string) => void;
  /** Replace an embedded profile from a canonical JSON file. */
  onReplaceStandardProfileJson: (profileId: string) => void;
  /** Open an embedded profile's graph in the editor (apply-back session). */
  onEditStandardProfileGraph: (profileId: string) => void;
  /** Profiles the open GLB declares — a profile is a set of paths and types. */
  declaredProfiles: { id: string; title?: string; keys: unknown[] }[];
  /** Declare a profile from a JSON file. */
  onImportProfileJson: () => void;
  /** Download a declared profile as JSON. */
  onExportProfileJson: (id: string) => void;
  /** Drop a declared profile from the open GLB. */
  onRemoveProfile: (id: string) => void;
  /** Whether the open GLB carries a standard adaptation. */
  standardAdaptationEmbedded: boolean;
  /** Add (`enabled`) or remove the standard adaptation in the open GLB. */
  onToggleStandardAdaptation: (enabled: boolean) => void;
  /** Download the embedded adaptation as JSON, verbatim. */
  onExportStandardAdaptationJson: () => void;
  /** Replace the embedded adaptation from a JSON file. */
  onReplaceStandardAdaptationJson: () => void;
  /** Open the embedded adaptation in the editor (apply-back session). */
  onEditStandardAdaptationGraph: () => void;
  /** The shipped skills a face may pin an override of (empty = none). */
  skills: { id: string; title: string }[];
  /** Skill ids the open GLB embeds (checked state of the toggles). */
  embeddedSkillIds: string[];
  /** Embed (`enabled`) or remove a skill fragment in the open GLB. */
  onToggleSkill: (skillId: string, enabled: boolean) => void;
  /** Download an embedded skill fragment as canonical JSON. */
  onExportSkillJson: (skillId: string) => void;
  /** Replace an embedded skill fragment from a canonical JSON file. */
  onReplaceSkillJson: (skillId: string) => void;
  /** Open an embedded skill's fragment in the editor (apply-back session). */
  onEditSkillGraph: (skillId: string) => void;
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
  standardProfiles,
  embeddedProfileIds,
  onToggleStandardProfile,
  onExportStandardProfileJson,
  onReplaceStandardProfileJson,
  onEditStandardProfileGraph,
  declaredProfiles,
  onImportProfileJson,
  onExportProfileJson,
  onRemoveProfile,
  standardAdaptationEmbedded,
  onToggleStandardAdaptation,
  onExportStandardAdaptationJson,
  onReplaceStandardAdaptationJson,
  onEditStandardAdaptationGraph,
  skills,
  embeddedSkillIds,
  onToggleSkill,
  onExportSkillJson,
  onReplaceSkillJson,
  onEditSkillGraph,
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
        <MenuSubmenu
          label="Standard Profiles"
          testId="app-menu-file-standard-profiles"
        >
          {standardProfiles.length === 0 ? (
            <MenuLabel>None available</MenuLabel>
          ) : (
            standardProfiles.map((profile) => (
              <MenuCheckboxItem
                key={profile.id}
                checked={embeddedProfileIds.includes(profile.id)}
                onCheckedChange={(checked) =>
                  onToggleStandardProfile(profile.id, checked)
                }
                testId={`app-menu-file-standard-profile-${profile.id}`}
              >
                {profile.title}
              </MenuCheckboxItem>
            ))
          )}
          {standardProfiles
            .filter((profile) => embeddedProfileIds.includes(profile.id))
            .map((profile) => (
              <React.Fragment key={profile.id}>
                <MenuSeparator />
                <MenuItem
                  onSelect={() => onExportStandardProfileJson(profile.id)}
                  testId={`app-menu-file-standard-profile-export-${profile.id}`}
                >
                  Export {profile.title} as JSON...
                </MenuItem>
                <MenuItem
                  onSelect={() => onReplaceStandardProfileJson(profile.id)}
                  testId={`app-menu-file-standard-profile-replace-${profile.id}`}
                >
                  Replace {profile.title} from JSON...
                </MenuItem>
                <MenuItem
                  onSelect={() => onEditStandardProfileGraph(profile.id)}
                  testId={`app-menu-file-standard-profile-edit-${profile.id}`}
                >
                  Edit {profile.title} in Graph Editor...
                </MenuItem>
              </React.Fragment>
            ))}
        </MenuSubmenu>
        <MenuSubmenu label="Profiles" testId="app-menu-file-profiles">
          <MenuItem
            onSelect={onImportProfileJson}
            testId="app-menu-file-profile-import"
          >
            Import Profile from JSON...
          </MenuItem>
          {declaredProfiles.length > 0 ? <MenuSeparator /> : null}
          {declaredProfiles.map((profile) => (
            <MenuSubmenu
              key={profile.id}
              label={`${profile.title ?? profile.id} (${profile.keys.length})`}
              testId={`app-menu-file-profile-${profile.id}`}
            >
              <MenuItem
                onSelect={() => onExportProfileJson(profile.id)}
                testId={`app-menu-file-profile-export-${profile.id}`}
              >
                Export as JSON...
              </MenuItem>
              <MenuItem
                onSelect={() => onRemoveProfile(profile.id)}
                testId={`app-menu-file-profile-remove-${profile.id}`}
              >
                Remove from Face
              </MenuItem>
            </MenuSubmenu>
          ))}
        </MenuSubmenu>
        <MenuSubmenu
          label="Standard Adaptation"
          testId="app-menu-file-standard-adaptation"
        >
          <MenuCheckboxItem
            checked={standardAdaptationEmbedded}
            onCheckedChange={onToggleStandardAdaptation}
            testId="app-menu-file-standard-adaptation-toggle"
          >
            Drive this face from the standard
          </MenuCheckboxItem>
          {standardAdaptationEmbedded ? (
            <>
              <MenuSeparator />
              <MenuItem
                onSelect={onEditStandardAdaptationGraph}
                testId="app-menu-file-standard-adaptation-edit"
              >
                Bind Controls to Poses...
              </MenuItem>
              <MenuItem
                onSelect={onExportStandardAdaptationJson}
                testId="app-menu-file-standard-adaptation-export"
              >
                Export Adaptation as JSON...
              </MenuItem>
              <MenuItem
                onSelect={onReplaceStandardAdaptationJson}
                testId="app-menu-file-standard-adaptation-replace"
              >
                Replace Adaptation from JSON...
              </MenuItem>
            </>
          ) : null}
        </MenuSubmenu>
        <MenuSubmenu label="Skills" testId="app-menu-file-skills">
          {skills.length === 0 ? (
            <MenuLabel>None available</MenuLabel>
          ) : (
            skills.map((skill) => (
              <MenuCheckboxItem
                key={skill.id}
                checked={embeddedSkillIds.includes(skill.id)}
                onCheckedChange={(checked) => onToggleSkill(skill.id, checked)}
                testId={`app-menu-file-skill-${skill.id}`}
              >
                {skill.title}
              </MenuCheckboxItem>
            ))
          )}
          {skills
            .filter((skill) => embeddedSkillIds.includes(skill.id))
            .map((skill) => (
              <React.Fragment key={skill.id}>
                <MenuSeparator />
                <MenuItem
                  onSelect={() => onExportSkillJson(skill.id)}
                  testId={`app-menu-file-skill-export-${skill.id}`}
                >
                  Export {skill.title} as JSON...
                </MenuItem>
                <MenuItem
                  onSelect={() => onReplaceSkillJson(skill.id)}
                  testId={`app-menu-file-skill-replace-${skill.id}`}
                >
                  Replace {skill.title} from JSON...
                </MenuItem>
                <MenuItem
                  onSelect={() => onEditSkillGraph(skill.id)}
                  testId={`app-menu-file-skill-edit-${skill.id}`}
                >
                  Edit {skill.title} in Graph Editor...
                </MenuItem>
              </React.Fragment>
            ))}
        </MenuSubmenu>
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
