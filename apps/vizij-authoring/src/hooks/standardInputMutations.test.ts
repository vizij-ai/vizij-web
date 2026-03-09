import { describe, expect, it } from "vitest";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
} from "@vizij/utils";
import type { PersistedAutoStandardInput } from "../rig/persistence";
import type { AutoInputState } from "../types/autoInputs";
import {
  resolveUpdatedStandardInputId,
  updateStandardInputEntry,
} from "./standardInputMutations";

function createSetState<T>(ref: { current: T }) {
  return (updater: T | ((previous: T) => T)) => {
    ref.current =
      typeof updater === "function"
        ? (updater as (previous: T) => T)(ref.current)
        : updater;
  };
}

describe("standardInputMutations", () => {
  it("derives a new canonical id from a changed path", () => {
    expect(
      resolveUpdatedStandardInputId({
        currentId: "custom_new_driver_2",
        normalizedPath: "/gaze/left_right",
        existingIds: [],
      }),
    ).toBe(createStandardRigInputFromPath("/gaze/left_right").id);
  });

  it("adds a suffix when the canonical id for a new path is already in use", () => {
    expect(
      resolveUpdatedStandardInputId({
        currentId: "custom_new_driver_2",
        normalizedPath: "/gaze/left_right",
        existingIds: [createStandardRigInputFromPath("/gaze/left_right").id],
      }),
    ).toBe(`${createStandardRigInputFromPath("/gaze/left_right").id}_2`);
  });

  it("rekeys custom inputs when the path changes", () => {
    const original = createStandardRigInput({
      id: "custom_new_driver_2",
      path: "/custom/new_driver_2",
      label: "Left Right",
      group: "custom",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    const autoInputsRef = { current: new Map<string, AutoInputState>() };
    const customInputsRef = { current: [original] };
    const persistedAutoInputsRef = {
      current: new Map<string, PersistedAutoStandardInput>(),
    };

    const result = updateStandardInputEntry({
      inputId: original.id,
      updates: { path: "/gaze/left_right" },
      autoInputsRef,
      customInputsRef,
      setAutoInputs: createSetState(autoInputsRef),
      setCustomInputs: createSetState(customInputsRef),
      persistedAutoInputsRef,
      resolvePersistedAutoKey: () => null,
      groupFallback: "custom",
    });

    expect(result).toEqual(
      expect.objectContaining({
        previousId: "custom_new_driver_2",
        nextId: createStandardRigInputFromPath("/gaze/left_right").id,
        updatedInput: expect.objectContaining({
          id: createStandardRigInputFromPath("/gaze/left_right").id,
          path: "/gaze/left_right",
        }),
      }),
    );
    expect(customInputsRef.current[0]?.id).toBe(
      createStandardRigInputFromPath("/gaze/left_right").id,
    );
    expect(customInputsRef.current[0]?.path).toBe("/gaze/left_right");
    expect(customInputsRef.current[0]?.group).toBe("gaze");
  });

  it("updates persisted auto input overrides with the remapped id", () => {
    const original = createStandardRigInput({
      id: "custom_new_driver",
      path: "/custom/new_driver",
      label: "Up Down",
      group: "custom",
      defaultValue: 0,
      range: { min: -1, max: 1 },
      sourceId: "component:eye",
    });
    const autoEntry: AutoInputState = {
      input: original,
      metadata: {
        elementId: "shape_1",
        elementName: "Shape 1",
        elementType: "shape",
        featureKey: "gaze",
        featureLabel: "Gaze",
        animatableId: "anim_1",
        componentId: "component_1",
        componentKey: undefined,
        propertyLabel: "Value",
        root: "custom",
      },
      generatedLabel: original.label,
      generatedDefaultValue: original.defaultValue,
      generatedRange: original.range,
      sourcePath: "/custom/new_driver",
      sourceId: "component:eye",
    };
    const autoInputsRef = {
      current: new Map<string, AutoInputState>([[original.path, autoEntry]]),
    };
    const customInputsRef = { current: [] as (typeof original)[] };
    const persistedAutoInputsRef = {
      current: new Map<string, PersistedAutoStandardInput>(),
    };

    updateStandardInputEntry({
      inputId: original.id,
      updates: { path: "/gaze/up_down" },
      autoInputsRef,
      customInputsRef,
      setAutoInputs: createSetState(autoInputsRef),
      setCustomInputs: createSetState(customInputsRef),
      persistedAutoInputsRef,
      resolvePersistedAutoKey: (sourceId) => sourceId ?? null,
      groupFallback: "custom",
    });

    expect(autoInputsRef.current.get("/gaze/up_down")?.input.id).toBe(
      createStandardRigInputFromPath("/gaze/up_down").id,
    );
    expect(persistedAutoInputsRef.current.get("component:eye")?.id).toBe(
      createStandardRigInputFromPath("/gaze/up_down").id,
    );
  });
});
