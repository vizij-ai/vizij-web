export type DemoSampleId = "quori-current-extended";
export type DemoTheme = "light" | "dark";

export type DemoFaceSource =
  | {
      kind: "sample";
      id: DemoSampleId;
    }
  | {
      kind: "upload";
      id: string;
      label: string;
      fileName: string;
      file: File;
    };

export type DemoPlaybackSelection = {
  animationId: string | null;
  programId: string | null;
  poseGroupId: string | null;
};

export type DemoPanelId =
  | "overview"
  | "controls"
  | "poses"
  | "animations"
  | "programs"
  | "diagnostics";

export type DemoPanelVisibility = Record<DemoPanelId, boolean>;

export type DemoPlayerState = {
  source: DemoFaceSource | null;
  playbackSelection: DemoPlaybackSelection;
  panels: DemoPanelVisibility;
  theme: DemoTheme;
};

export type PersistedDemoFaceSource = {
  kind: "sample";
  id: DemoSampleId;
} | null;

export type PersistedDemoPlayerState = {
  source: PersistedDemoFaceSource;
  playbackSelection: DemoPlaybackSelection;
  panels: DemoPanelVisibility;
  theme: DemoTheme;
};

export const DEFAULT_THEME: DemoTheme = "light";

export const DEFAULT_PLAYBACK_SELECTION: DemoPlaybackSelection = {
  animationId: null,
  programId: null,
  poseGroupId: null,
};

export const DEFAULT_PANEL_VISIBILITY: DemoPanelVisibility = {
  overview: true,
  controls: true,
  poses: true,
  animations: true,
  programs: true,
  diagnostics: true,
};

export const DEFAULT_PLAYER_STATE: DemoPlayerState = {
  source: null,
  playbackSelection: DEFAULT_PLAYBACK_SELECTION,
  panels: DEFAULT_PANEL_VISIBILITY,
  theme: DEFAULT_THEME,
};
