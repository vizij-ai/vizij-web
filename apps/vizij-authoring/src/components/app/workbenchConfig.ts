/** Shared definition of the authoring workbench tabs. */
export type WorkbenchView =
  | "scene-composer"
  | "import-export"
  | "pose-rig"
  | "std-feature-spaces";

export interface WorkbenchOption {
  id: WorkbenchView;
  label: string;
  description: string;
  icon: string;
}

/** Authoring nav metadata for use across layout and descriptions. */
export const WORKBENCH_OPTIONS: WorkbenchOption[] = [
  {
    id: "import-export",
    label: "Import / Export",
    description: "Import Vizij scenes and export glTF.",
    icon: "import_export",
  },
  {
    id: "scene-composer",
    label: "Rigging",
    description: "Inspect objects, manage drivers, and edit bindings.",
    icon: "view_in_ar",
  },
  {
    id: "pose-rig",
    label: "Posing",
    description: "Edit the pose graph and rig logic.",
    icon: "accessibility_new",
  },
  {
    id: "std-feature-spaces",
    label: "Standard Feature Spaces",
    description: "Map your model to standard feature spaces.",
    icon: "face",
  },
];
