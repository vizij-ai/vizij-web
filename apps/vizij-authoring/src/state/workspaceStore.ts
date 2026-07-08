import { create } from "zustand";

interface PanelState {
  isVisible: boolean;
  order: number; // For future reordering
}

interface WorkspaceState {
  panels: {
    // Left Sidebar
    hierarchy: PanelState;
    variables: PanelState;
    poses: PanelState;
    inputs: PanelState;
    motiongraphPalette: PanelState;
    // Right Sidebar
    inspector: PanelState;
    speech: PanelState;
    debug: PanelState;
    // Bottom
    animation: PanelState;
    motiongraph: PanelState;
    // Center Top
    toolbar: PanelState;
    referenceFace: PanelState;
    materials: PanelState;
  };
  togglePanel: (panelId: keyof WorkspaceState["panels"]) => void;
  setPanelVisibility: (
    panelId: keyof WorkspaceState["panels"],
    isVisible: boolean,
  ) => void;
}

export type WorkspacePanels = WorkspaceState["panels"];
export type WorkspacePanelId = keyof WorkspacePanels;

const EXCLUSIVE_CENTER_PANEL_IDS = [
  "animation",
  "motiongraph",
  "referenceFace",
] as const satisfies readonly WorkspacePanelId[];
const EXCLUSIVE_CENTER_PANEL_ID_SET: ReadonlySet<WorkspacePanelId> = new Set(
  EXCLUSIVE_CENTER_PANEL_IDS,
);

function isExclusiveCenterPanel(panelId: WorkspacePanelId): boolean {
  return EXCLUSIVE_CENTER_PANEL_ID_SET.has(panelId);
}

function applyExclusiveCenterMode(params: {
  panels: WorkspacePanels;
  panelId: WorkspacePanelId;
  isVisible: boolean;
}): WorkspacePanels {
  const { panels, panelId, isVisible } = params;
  if (!isVisible || !isExclusiveCenterPanel(panelId)) {
    return panels;
  }

  const nextPanels: WorkspacePanels = { ...panels };
  EXCLUSIVE_CENTER_PANEL_IDS.forEach((exclusivePanelId) => {
    if (exclusivePanelId === panelId) {
      return;
    }
    const current = nextPanels[exclusivePanelId];
    if (!current.isVisible) {
      return;
    }
    nextPanels[exclusivePanelId] = {
      ...current,
      isVisible: false,
    };
  });
  return nextPanels;
}

export function createInitialWorkspacePanels(): WorkspacePanels {
  return {
    hierarchy: { isVisible: true, order: 2 },
    variables: { isVisible: true, order: 1 },
    poses: { isVisible: true, order: 4 },
    inputs: { isVisible: true, order: 5 },
    motiongraphPalette: { isVisible: false, order: 6 },
    inspector: { isVisible: true, order: 0 },
    speech: { isVisible: false, order: 1 },
    debug: { isVisible: false, order: 2 },
    animation: { isVisible: false, order: 0 },
    motiongraph: { isVisible: false, order: 1 },
    toolbar: { isVisible: true, order: 0 },
    referenceFace: { isVisible: false, order: 0 },
    materials: { isVisible: true, order: 3 },
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  panels: createInitialWorkspacePanels(),
  togglePanel: (panelId) =>
    set((state) => {
      const nextVisibility = !state.panels[panelId].isVisible;
      const nextPanels = {
        ...state.panels,
        [panelId]: {
          ...state.panels[panelId],
          isVisible: nextVisibility,
        },
      };
      return {
        panels: applyExclusiveCenterMode({
          panels: nextPanels,
          panelId,
          isVisible: nextVisibility,
        }),
      };
    }),
  setPanelVisibility: (panelId, isVisible) =>
    set((state) => {
      const nextPanels = {
        ...state.panels,
        [panelId]: {
          ...state.panels[panelId],
          isVisible,
        },
      };
      return {
        panels: applyExclusiveCenterMode({
          panels: nextPanels,
          panelId,
          isVisible,
        }),
      };
    }),
}));
