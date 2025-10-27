import { describe, expect, it } from "vitest";

import type { AnimatableComponent, StandardRigInput } from "@vizij/utils";

import { buildGraphFromDrivers } from "@vizij/utils";

import { buildAuthoringDriverGraph } from "./driverAdapters";
import { createDefaultBinding } from "./state";

describe("buildAuthoringDriverGraph", () => {
  it("converts bindings into remap drivers", () => {
    const standardInputs: StandardRigInput[] = [
      {
        id: "mouth_pos_x",
        path: "/mouth/pos/x",
        label: "Mouth Pos X",
        group: "mouth",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      },
    ];
    const standardInputsById = new Map(
      standardInputs.map((input) => [input.id, input]),
    );

    const component: AnimatableComponent = {
      id: "anim:mouth_pos_x",
      safeId: "anim_mouth_pos_x",
      animatableId: "rig/robot/mouth/pos/x",
      animatableType: "number",
      label: "Mouth Pos X",
      defaultValue: 0,
      range: {
        min: -0.5,
        max: 0.5,
      },
    };
    const componentsById = new Map([[component.id, component]]);

    const remap = {
      inLow: -1,
      inAnchor: 0,
      inHigh: 1,
      outLow: -0.5,
      outAnchor: 0,
      outHigh: 0.5,
    };
    const baseBinding = createDefaultBinding(component);

    const driverGraph = buildAuthoringDriverGraph({
      faceId: "robot",
      namespace: "default",
      bindings: {
        [component.id]: {
          ...baseBinding,
          inputId: "mouth_pos_x",
          remap: { ...remap },
          slots: [
            {
              ...baseBinding.slots[0],
              inputId: "mouth_pos_x",
              remap: { ...remap },
            },
          ],
        },
      },
      componentsById,
      standardInputsById,
    });

    expect(driverGraph.faceId).toBe("robot");
    expect(driverGraph.namespace).toBe("default");
    expect(driverGraph.standardInputs).toHaveLength(1);
    expect(driverGraph.drivers).toHaveLength(1);

    const spec = buildGraphFromDrivers({ driverGraph });
    expect(spec.nodes.length).toBeGreaterThan(0);

    const driver = driverGraph.drivers[0];
    expect(driver.kind).toBe("remap");
    expect(driver.source).toMatchObject({
      type: "standard-input",
      id: "mouth_pos_x",
      path: "/mouth/pos/x",
    });
    expect(driver.outputs).toHaveLength(1);
    expect(driver.outputs[0]?.target).toMatchObject({
      type: "animatable",
      id: "rig/robot/mouth/pos/x",
    });
    expect(driver.outputs[0]?.transform).toMatchObject({
      type: "centered-remap",
      inLow: -1,
      outHigh: 0.5,
    });
  });

  it("marks bindings without inputs as unassigned drivers", () => {
    const standardInputsById = new Map<string, StandardRigInput>();

    const component: AnimatableComponent = {
      id: "anim:jaw_open",
      safeId: "anim_jaw_open",
      animatableId: "rig/robot/jaw/open",
      animatableType: "number",
      label: "Jaw Open",
      defaultValue: 0,
      range: {
        min: 0,
        max: 1,
      },
    };
    const componentsById = new Map([[component.id, component]]);
    const baseBinding = createDefaultBinding(component);
    const remap = {
      inLow: -1,
      inAnchor: 0,
      inHigh: 1,
      outLow: 0,
      outAnchor: 0,
      outHigh: 1,
    };

    const driverGraph = buildAuthoringDriverGraph({
      faceId: "robot",
      namespace: "default",
      bindings: {
        [component.id]: {
          ...baseBinding,
          inputId: null,
          remap: { ...remap },
          slots: [
            {
              ...baseBinding.slots[0],
              inputId: null,
              remap: { ...remap },
            },
          ],
        },
      },
      componentsById,
      standardInputsById,
    });

    expect(driverGraph.drivers[0]?.source.type).toBe("unassigned");

    const spec = buildGraphFromDrivers({ driverGraph });
    expect(spec.nodes.length).toBe(0);
  });
});
