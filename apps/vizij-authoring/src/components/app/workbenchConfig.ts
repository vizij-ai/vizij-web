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
    description: "Inspect objects, manage controls, and edit links.",
    icon: "view_in_ar",
  },
  {
    id: "pose-rig",
    label: "Expressions",
    description: "Edit the expression graph and rig logic.",
    icon: "accessibility_new",
  },
  {
    id: "std-feature-spaces",
    label: "Standard Controls",
    description: "Map your model to the standard controls.",
    icon: "face",
  },
];
