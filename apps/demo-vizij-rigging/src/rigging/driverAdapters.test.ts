import { describe, expect, it } from "vitest";

import { buildGraphFromDrivers, type StandardRigInput } from "@vizij/utils";

import { buildRiggingDriverGraph } from "./driverAdapters";
import type { EmotionDefinition, LowLevelRigSummary } from "./types";

const STANDARD_INPUTS: StandardRigInput[] = [
  {
    id: "standard_mouth_pos_x",
    path: "/standard/mouth/pos/x",
    label: "Mouth Pos X",
    group: "mouth",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  },
  {
    id: "brow_up",
    path: "/brow/up",
    label: "Brow Up",
    group: "brow",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  },
];

describe("buildRiggingDriverGraph", () => {
  it("converts low-level summary into remap drivers", () => {
    const summary: LowLevelRigSummary = {
      faceId: "robot",
      inputs: [],
      outputs: [],
      bindings: [
        {
          targetId: "jaw_open",
          animatableId: "rig/robot/jaw/open",
          component: undefined,
          inputId: "standard_mouth_pos_x",
          remap: {
            inMin: -1,
            inMax: 1,
            outMin: 0,
            outMax: 1,
          },
        },
      ],
    };

    const driverGraph = buildRiggingDriverGraph({
      faceId: "robot",
      standardInputs: STANDARD_INPUTS,
      neutralInputs: {},
      emotions: [],
      lowLevelSummary: summary,
    });

    expect(driverGraph.drivers).toHaveLength(1);
    const driver = driverGraph.drivers[0];
    expect(driver.kind).toBe("remap");
    expect(driver.source).toMatchObject({
      type: "standard-input",
      id: "standard_mouth_pos_x",
    });
    expect(driver.outputs[0]?.transform).toMatchObject({
      type: "linear-remap",
      outMax: 1,
    });

    const spec = buildGraphFromDrivers({ driverGraph });
    expect(spec.nodes.length).toBeGreaterThan(0);
  });

  it("creates pose drivers with contributions for changed inputs", () => {
    const emotions: EmotionDefinition[] = [
      {
        id: "happy",
        name: "Happy",
        description: "",
        values: {
          standard_mouth_pos_x: 0.8,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const driverGraph = buildRiggingDriverGraph({
      faceId: "robot",
      standardInputs: STANDARD_INPUTS,
      neutralInputs: {
        standard_mouth_pos_x: 0.1,
        brow_up: 0,
      },
      emotions,
    });

    expect(driverGraph.drivers.some((driver) => driver.kind === "pose")).toBe(
      true,
    );
    const poseDriver = driverGraph.drivers.find(
      (driver) => driver.kind === "pose",
    )!;
    expect(poseDriver.source.type).toBe("pose-weight");
    expect(poseDriver.outputs).toHaveLength(1);
    expect(poseDriver.outputs[0]?.target.id).toBe("standard_mouth_pos_x");
    expect(poseDriver.outputs[0]?.transform).toMatchObject({
      type: "pose-delta",
      value: 0.8,
      neutral: 0.1,
    });

    const spec = buildGraphFromDrivers({ driverGraph });
    expect(spec.nodes.length).toBeGreaterThan(0);
  });
});
