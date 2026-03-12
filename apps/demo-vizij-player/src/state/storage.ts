import {
  DEFAULT_THEME,
  DEFAULT_PANEL_VISIBILITY,
  DEFAULT_PLAYBACK_SELECTION,
  type DemoSampleId,
  type DemoTheme,
  type DemoFaceSource,
  type DemoPanelVisibility,
  type DemoPlaybackSelection,
  type PersistedDemoFaceSource,
  type PersistedDemoPlayerState,
} from "./types";

const STORAGE_VERSION = "v4";
const STORAGE_KEY = `demo-vizij-player/${STORAGE_VERSION}/state`;
const SAMPLE_IDS = new Set<DemoSampleId>([
  "quori-current-extended",
  "hugo-current-extended",
]);
const THEMES = new Set<DemoTheme>(["light", "dark"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function sanitizeTheme(value: unknown): DemoTheme {
  return typeof value === "string" && THEMES.has(value as DemoTheme)
    ? (value as DemoTheme)
    : DEFAULT_THEME;
}

function sanitizePanels(value: unknown): DemoPanelVisibility {
  if (!isObject(value)) {
    return { ...DEFAULT_PANEL_VISIBILITY };
  }
  return {
    overview:
      typeof value.overview === "boolean"
        ? value.overview
        : DEFAULT_PANEL_VISIBILITY.overview,
    controls:
      typeof value.controls === "boolean"
        ? value.controls
        : DEFAULT_PANEL_VISIBILITY.controls,
    poses:
      typeof value.poses === "boolean"
        ? value.poses
        : DEFAULT_PANEL_VISIBILITY.poses,
    animations:
      typeof value.animations === "boolean"
        ? value.animations
        : DEFAULT_PANEL_VISIBILITY.animations,
    programs:
      typeof value.programs === "boolean"
        ? value.programs
        : DEFAULT_PANEL_VISIBILITY.programs,
    diagnostics:
      typeof value.diagnostics === "boolean"
        ? value.diagnostics
        : DEFAULT_PANEL_VISIBILITY.diagnostics,
  };
}

function sanitizePlaybackSelection(value: unknown): DemoPlaybackSelection {
  if (!isObject(value)) {
    return { ...DEFAULT_PLAYBACK_SELECTION };
  }
  return {
    animationId: isStringOrNull(value.animationId)
      ? value.animationId
      : DEFAULT_PLAYBACK_SELECTION.animationId,
    programId: isStringOrNull(value.programId)
      ? value.programId
      : DEFAULT_PLAYBACK_SELECTION.programId,
    poseGroupId: isStringOrNull(value.poseGroupId)
      ? value.poseGroupId
      : DEFAULT_PLAYBACK_SELECTION.poseGroupId,
  };
}

function sanitizeSource(value: unknown): PersistedDemoFaceSource {
  if (
    !isObject(value) ||
    value.kind !== "sample" ||
    typeof value.id !== "string" ||
    !SAMPLE_IDS.has(value.id as DemoSampleId)
  ) {
    return null;
  }
  return {
    kind: "sample",
    id: value.id as PersistedDemoFaceSource extends { id: infer T } ? T : never,
  };
}

export function createPersistedState(
  source: DemoFaceSource | null,
  playbackSelection: DemoPlaybackSelection,
  panels: DemoPanelVisibility,
  theme: DemoTheme,
): PersistedDemoPlayerState {
  return {
    source:
      source?.kind === "sample"
        ? {
            kind: "sample",
            id: source.id,
          }
        : null,
    playbackSelection,
    panels,
    theme,
  };
}

export function loadPersistedState(): PersistedDemoPlayerState {
  if (typeof window === "undefined") {
    return {
      source: null,
      playbackSelection: { ...DEFAULT_PLAYBACK_SELECTION },
      panels: { ...DEFAULT_PANEL_VISIBILITY },
      theme: DEFAULT_THEME,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        source: null,
        playbackSelection: { ...DEFAULT_PLAYBACK_SELECTION },
        panels: { ...DEFAULT_PANEL_VISIBILITY },
        theme: DEFAULT_THEME,
      };
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) {
      throw new Error("Persisted demo state must be an object.");
    }

    return {
      source: sanitizeSource(parsed.source),
      playbackSelection: sanitizePlaybackSelection(parsed.playbackSelection),
      panels: sanitizePanels(parsed.panels),
      theme: sanitizeTheme(parsed.theme),
    };
  } catch (error) {
    console.warn("demo-vizij-player: failed to load persisted state", error);
    return {
      source: null,
      playbackSelection: { ...DEFAULT_PLAYBACK_SELECTION },
      panels: { ...DEFAULT_PANEL_VISIBILITY },
      theme: DEFAULT_THEME,
    };
  }
}

export function persistState(state: PersistedDemoPlayerState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("demo-vizij-player: failed to persist state", error);
  }
}
