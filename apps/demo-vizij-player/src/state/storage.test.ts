import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPersistedState,
  loadPersistedState,
  persistState,
} from "./storage";
import {
  DEFAULT_PANEL_VISIBILITY,
  DEFAULT_PLAYBACK_SELECTION,
  type PersistedDemoPlayerState,
} from "./types";

describe("demo-vizij-player storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("drops uploaded sources from persisted state", () => {
    const file = new File(["hello"], "face.glb", {
      type: "model/gltf-binary",
    });
    const persisted = createPersistedState(
      {
        kind: "upload",
        id: "upload-face",
        label: "Upload Face",
        fileName: file.name,
        file,
      },
      DEFAULT_PLAYBACK_SELECTION,
      DEFAULT_PANEL_VISIBILITY,
    );

    expect(persisted.source).toBeNull();
  });

  it("loads sanitized defaults from malformed storage payloads", () => {
    const store = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    };
    vi.stubGlobal("window", { localStorage: localStorageMock });

    const state: PersistedDemoPlayerState = {
      source: { kind: "sample", id: "quori-current-extended" },
      playbackSelection: {
        animationId: "anim",
        programId: "program",
        poseGroupId: "group",
      },
      panels: {
        overview: false,
        controls: false,
        poses: false,
        animations: false,
        programs: false,
        diagnostics: false,
      },
    };

    persistState(state);
    localStorageMock.setItem(
      "demo-vizij-player/v3/state",
      JSON.stringify({
        source: { kind: "invalid", id: "bad" },
        playbackSelection: { animationId: 42 },
        panels: { overview: "nope" },
      }),
    );

    expect(loadPersistedState()).toEqual({
      source: null,
      playbackSelection: {
        animationId: null,
        programId: null,
        poseGroupId: null,
      },
      panels: DEFAULT_PANEL_VISIBILITY,
    });
  });
});
