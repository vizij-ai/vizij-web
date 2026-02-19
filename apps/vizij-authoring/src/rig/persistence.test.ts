import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RigBindingDefinition } from "@vizij/utils";
import { createStandardRigInput } from "@vizij/utils";
import {
  formatRigPersistenceError,
  loadRigState,
  RIG_STATE_SCHEMA_VERSION,
  saveRigState,
  type PersistedRigState,
} from "./persistence";

const STORAGE_KEY = "vizij:rig-authoring:v2";

function writePersistedState(state: PersistedRigState): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      [state.faceId]: state,
    }),
  );
}

describe("rig persistence migrations", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies ordered migrations deterministically from v1 to current schema", () => {
    const faceId = "legacy-face";
    const legacyBindingDefinitions: Record<string, RigBindingDefinition> = {
      input_mouth_open: {
        inputId: "source_a",
        expression: "s1",
        slots: [{ id: "s1", alias: "s1", inputId: "source_a" }],
      },
    };
    const legacyState: PersistedRigState = {
      faceId,
      bindings: {
        "target/0": {
          targetId: "target/0",
          inputId: "source_a",
          expression: "s1",
          slots: [{ id: "s1", alias: "s1", inputId: "source_a" }],
        },
      },
      inputValues: { source_a: 0.35 },
      standardInputs: [
        {
          id: "std_mouth_open",
          path: "/mouth/open",
          sourcePath: "/mouth/open",
          label: "Mouth Open",
          defaultValue: 0.2,
          range: { min: 0, max: 1 },
        },
      ],
      customStandardInputs: [
        createStandardRigInput({
          id: "custom_cheek_raise",
          path: "/custom/cheek/raise",
          label: "Cheek Raise",
          group: "custom",
          defaultValue: 0.1,
          range: { min: 0, max: 1 },
        }),
      ],
      selectedStandardInputRoots: ["face"],
      selectedStandardInputSubgroups: ["mouth"],
      featureLabels: { face: "Face" },
      disabledStandardInputIds: ["std_disabled"],
      hiddenDriverIds: ["driver_hidden"],
      derivedStandardInputs: legacyBindingDefinitions,
      featureFlags: { diagnostics: true },
      graphInsights: {
        summary: {
          faceId,
          inputs: ["source_a"],
          outputs: ["target/0"],
          bindings: 1,
        },
        issues: {
          fatal: [],
          byTarget: {},
        },
        generatedAt: "2026-02-19T00:00:00.000Z",
      },
      schemaVersion: 1,
      standardInputSchema: { id: "vizij-standard-face", version: "v1" },
    };

    writePersistedState(legacyState);

    const firstLoad = loadRigState(faceId);
    const secondLoad = loadRigState(faceId);

    expect(firstLoad.ok).toBe(true);
    expect(secondLoad.ok).toBe(true);
    if (!firstLoad.ok || !secondLoad.ok) {
      return;
    }

    expect(firstLoad.value).not.toBeNull();
    expect(secondLoad.value).toEqual(firstLoad.value);
    expect(firstLoad.value?.schemaVersion).toBe(RIG_STATE_SCHEMA_VERSION);
    expect(firstLoad.value?.inputBindingDefinitions).toEqual(
      legacyBindingDefinitions,
    );
    expect(firstLoad.value?.derivedStandardInputs).toEqual(
      legacyBindingDefinitions,
    );
    expect(firstLoad.value?.customStandardInputs).toEqual(
      legacyState.customStandardInputs,
    );
    expect(firstLoad.value?.standardInputs).toEqual(legacyState.standardInputs);
    expect(firstLoad.value?.featureLabels).toEqual(legacyState.featureLabels);
    expect(firstLoad.value?.featureFlags).toEqual(legacyState.featureFlags);
    expect(firstLoad.value?.graphInsights).toEqual(legacyState.graphInsights);
    expect(firstLoad.value?.standardInputSchema).toEqual(
      legacyState.standardInputSchema,
    );
  });

  it("migrates legacy fixtures without schemaVersion using the initial step", () => {
    const faceId = "legacy-no-schema";
    writePersistedState({
      faceId,
      bindings: {},
      inputValues: { source_a: 0.25 },
      standardInputs: [
        {
          id: "legacy_input",
          path: "/custom/legacy/input",
          sourcePath: "/custom/legacy/input",
        },
      ],
      customStandardInputs: [
        createStandardRigInput({
          id: "legacy_custom",
          path: "/custom/legacy/custom",
          label: "Legacy Custom",
          group: "custom",
          defaultValue: 0.4,
          range: { min: 0, max: 1 },
        }),
      ],
      derivedStandardInputs: {
        legacy_binding: {
          inputId: "source_a",
          expression: "s1",
          slots: [{ id: "s1", alias: "s1", inputId: "source_a" }],
        },
      },
    });

    const loadResult = loadRigState(faceId);

    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok || !loadResult.value) {
      return;
    }
    expect(loadResult.value.schemaVersion).toBe(RIG_STATE_SCHEMA_VERSION);
    expect(loadResult.value.standardInputs).toEqual([
      {
        id: "legacy_input",
        path: "/custom/legacy/input",
        sourcePath: "/custom/legacy/input",
      },
    ]);
    expect(loadResult.value.customStandardInputs).toEqual([
      createStandardRigInput({
        id: "legacy_custom",
        path: "/custom/legacy/custom",
        label: "Legacy Custom",
        group: "custom",
        defaultValue: 0.4,
        range: { min: 0, max: 1 },
      }),
    ]);
    expect(loadResult.value.inputBindingDefinitions).toEqual(
      loadResult.value.derivedStandardInputs,
    );
  });
});

describe("rig persistence error surfacing", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns typed storage write failures for save operations", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    const saveResult = saveRigState({
      faceId: "save-face",
      bindings: {},
      inputValues: {},
      schemaVersion: RIG_STATE_SCHEMA_VERSION,
    });

    expect(saveResult.ok).toBe(false);
    if (saveResult.ok) {
      return;
    }
    expect(saveResult.error.code).toBe("storage_write_failed");
    expect(formatRigPersistenceError(saveResult.error)).toContain(
      "Failed to write saved rig state",
    );
  });

  it("returns typed migration failures for unsupported future schema versions", () => {
    const faceId = "future-face";
    writePersistedState({
      faceId,
      bindings: {},
      inputValues: {},
      schemaVersion: RIG_STATE_SCHEMA_VERSION + 1,
    });

    const loadResult = loadRigState(faceId);

    expect(loadResult.ok).toBe(false);
    if (loadResult.ok) {
      return;
    }
    expect(loadResult.error.code).toBe("unsupported_schema_version");
    expect(formatRigPersistenceError(loadResult.error)).toContain(
      "unsupported schema version",
    );
  });
});
