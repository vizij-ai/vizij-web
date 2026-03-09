export type VariablesSurfaceTab =
  | "variables"
  | "poses"
  | "pose-groups"
  | "inputs"
  | "animations"
  | "programs";

interface VisibilityFlag {
  isVisible: boolean;
}

export interface VariablesSurfaceVisibility {
  variables: VisibilityFlag;
  poses: VisibilityFlag;
  materials: VisibilityFlag;
  inputs: VisibilityFlag;
}

const VARIABLE_SURFACE_VISIBILITY_ORDER: Array<{
  panelId: keyof VariablesSurfaceVisibility;
  surface: VariablesSurfaceTab;
}> = [
  { panelId: "variables", surface: "variables" },
  { panelId: "poses", surface: "poses" },
  { panelId: "materials", surface: "pose-groups" },
  { panelId: "inputs", surface: "inputs" },
];

export function getVisibleVariablesSurfaces(
  panels: VariablesSurfaceVisibility,
): VariablesSurfaceTab[] {
  return VARIABLE_SURFACE_VISIBILITY_ORDER.filter(
    ({ panelId }) => panels[panelId].isVisible,
  ).map(({ surface }) => surface);
}
