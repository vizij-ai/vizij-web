import { create } from 'zustand';

interface PanelState {
    isVisible: boolean;
    order: number; // For future reordering
}

interface WorkspaceState {
    panels: {
        // Left Sidebar
        hierarchy: PanelState;
        variables: PanelState;
        // Right Sidebar
        inspector: PanelState;
        debug: PanelState;
        // Bottom
        animation: PanelState;
        // Center Top
        toolbar: PanelState;
        referenceFace: PanelState;
    };
    togglePanel: (panelId: keyof WorkspaceState['panels']) => void;
    setPanelVisibility: (panelId: keyof WorkspaceState['panels'], isVisible: boolean) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
    panels: {
        hierarchy: { isVisible: true, order: 2 },
        variables: { isVisible: true, order: 1 },
        inspector: { isVisible: true, order: 0 },
        debug: { isVisible: false, order: 1 },
        animation: { isVisible: false, order: 0 },
        toolbar: { isVisible: true, order: 0 },
        referenceFace: { isVisible: false, order: 0 },
    },
    togglePanel: (panelId) =>
        set((state) => ({
            panels: {
                ...state.panels,
                [panelId]: {
                    ...state.panels[panelId],
                    isVisible: !state.panels[panelId].isVisible,
                },
            },
        })),
    setPanelVisibility: (panelId, isVisible) =>
        set((state) => ({
            panels: {
                ...state.panels,
                [panelId]: {
                    ...state.panels[panelId],
                    isVisible,
                },
            },
        })),
}));
