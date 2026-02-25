import { describe, expect, it } from "vitest";
import { createStandardRigInput } from "@vizij/utils";
import type { ManagedStandardInput } from "../../types/standardInputs";
import type { AutoRigInputBlueprintMetadata } from "../../rig/autoInputs";
import {
  radiansToRoundedDegrees,
  resolveRootSceneRotationInputs,
} from "./importOrientation";

function createMetadata(overrides?: Partial<AutoRigInputBlueprintMetadata>) {
  return {
    elementId: "root",
    elementName: "scene",
    elementType: "group",
    featureKey: "rotation",
    featureLabel: "Rotation",
    animatableId: "anim-rotation",
    componentId: `component-${overrides?.componentKey ?? "x"}`,
    componentKey: "x",
    propertyLabel: "X",
    root: "scene",
    ...overrides,
  } satisfies AutoRigInputBlueprintMetadata;
}

function createManagedInput(options: {
  id: string;
  path: string;
  defaultValue?: number;
  source?: ManagedStandardInput["source"];
  disabled?: boolean;
  metadata?: AutoRigInputBlueprintMetadata;
}): ManagedStandardInput {
  return {
    input: createStandardRigInput({
      id: options.id,
      path: options.path,
      label: options.id,
      group: "scene",
      defaultValue: options.defaultValue ?? 0,
      range: { min: -Math.PI * 2, max: Math.PI * 2 },
    }),
    source: options.source ?? "auto",
    disabled: options.disabled ?? false,
    metadata: options.metadata,
  };
}

describe("resolveRootSceneRotationInputs", () => {
  it("prefers root-scoped metadata axes for rotation", () => {
    const inputs: ManagedStandardInput[] = [
      createManagedInput({
        id: "root_rotation_x",
        path: "/autorig/scene/rotation/x",
        defaultValue: 0,
        metadata: createMetadata({
          componentKey: "x",
          propertyLabel: "X",
          componentId: "component-x",
        }),
      }),
      createManagedInput({
        id: "root_rotation_y",
        path: "/autorig/scene/rotation/y",
        defaultValue: Math.PI / 2,
        metadata: createMetadata({
          componentKey: "y",
          propertyLabel: "Y",
          componentId: "component-y",
        }),
      }),
      createManagedInput({
        id: "other_rotation_z",
        path: "/autorig/other/rotation/z",
        defaultValue: Math.PI,
        metadata: createMetadata({
          elementId: "other-root",
          componentKey: "z",
          propertyLabel: "Z",
          componentId: "component-z-other",
        }),
      }),
    ];

    const resolved = resolveRootSceneRotationInputs(inputs, "root");

    expect(resolved.x?.inputId).toBe("root_rotation_x");
    expect(resolved.y?.inputId).toBe("root_rotation_y");
    expect(resolved.z).toBeUndefined();
  });

  it("falls back to canonical /scene/rotation paths when metadata is unavailable", () => {
    const inputs: ManagedStandardInput[] = [
      createManagedInput({
        id: "scene_rotation_z",
        path: "/standard/autorig/scene/rotation/z",
        defaultValue: Math.PI / 2,
      }),
      createManagedInput({
        id: "eye_rotation_x",
        path: "/standard/autorig/left_eye/rotation/x",
        defaultValue: Math.PI / 4,
      }),
    ];

    const resolved = resolveRootSceneRotationInputs(inputs, "root");

    expect(resolved.z?.inputId).toBe("scene_rotation_z");
    expect(resolved.x).toBeUndefined();
  });

  it("ignores disabled and non-auto candidates", () => {
    const inputs: ManagedStandardInput[] = [
      createManagedInput({
        id: "scene_rotation_x_disabled",
        path: "/autorig/scene/rotation/x",
        disabled: true,
        metadata: createMetadata({
          componentKey: "x",
          propertyLabel: "X",
          componentId: "component-x-disabled",
        }),
      }),
      createManagedInput({
        id: "scene_rotation_y_custom",
        path: "/autorig/scene/rotation/y",
        source: "custom",
        metadata: createMetadata({
          componentKey: "y",
          propertyLabel: "Y",
          componentId: "component-y-custom",
        }),
      }),
    ];

    const resolved = resolveRootSceneRotationInputs(inputs, "root");

    expect(resolved.x).toBeUndefined();
    expect(resolved.y).toBeUndefined();
  });
});

describe("radiansToRoundedDegrees", () => {
  it("converts and rounds radians to degrees", () => {
    expect(radiansToRoundedDegrees(0)).toBe(0);
    expect(radiansToRoundedDegrees(Math.PI / 2)).toBe(90);
    expect(radiansToRoundedDegrees(-Math.PI)).toBe(-180);
  });
});
