import { describe, expect, it } from "vitest";
import type { WriteOp } from "@vizij/orchestrator-react";
import { prepareRuntimeFrameWrites } from "../host/frameWrites";

describe("prepareRuntimeFrameWrites", () => {
  it("maps tracked frame writes into renderer writes", () => {
    const result = prepareRuntimeFrameWrites({
      writes: [
        {
          path: "demo-face/rig/quori_latest/lids/blink",
          value: { type: "float", data: 0.5 },
        } as WriteOp,
        {
          path: "demo-face/untracked/value",
          value: { type: "float", data: 1 },
        } as WriteOp,
      ],
      namespace: "demo-face",
      namespacedOutputPaths: new Set(["demo-face/rig/quori_latest/lids/blink"]),
      baseOutputPaths: new Set(["rig/quori_latest/lids/blink"]),
      rigInputPathMap: {},
      rigPoseControlInputIds: new Set(),
      poseControlBridgeValues: new Map(),
      currentValues: new Map(),
    });

    expect(result.rendererWrites).toEqual([
      {
        id: "rig/quori_latest/lids/blink",
        namespace: "demo-face",
        value: 0.5,
      },
    ]);
    expect(result.poseControlInputs).toEqual([]);
  });

  it("bridges pose-control frame outputs back into mapped runtime inputs", () => {
    const poseControlBridgeValues = new Map<string, number>();
    const result = prepareRuntimeFrameWrites({
      writes: [
        {
          path: "demo-face/rig/quori_latest/pose/control/happy",
          value: { type: "float", data: 0.75 },
        } as WriteOp,
      ],
      namespace: "demo-face",
      namespacedOutputPaths: new Set([
        "demo-face/rig/quori_latest/pose/control/happy",
      ]),
      baseOutputPaths: new Set(["rig/quori_latest/pose/control/happy"]),
      rigInputPathMap: {
        happy: "rig/quori_latest/mouth/smile",
      },
      rigPoseControlInputIds: new Set(["happy"]),
      poseControlBridgeValues,
      currentValues: new Map(),
    });

    expect(result.poseControlInputs).toEqual([
      {
        path: "rig/quori_latest/mouth/smile",
        value: { float: 0.75 },
      },
    ]);

    const unchanged = prepareRuntimeFrameWrites({
      writes: [
        {
          path: "demo-face/rig/quori_latest/pose/control/happy",
          value: { type: "float", data: 0.75 },
        } as WriteOp,
      ],
      namespace: "demo-face",
      namespacedOutputPaths: new Set([
        "demo-face/rig/quori_latest/pose/control/happy",
      ]),
      baseOutputPaths: new Set(["rig/quori_latest/pose/control/happy"]),
      rigInputPathMap: {
        happy: "rig/quori_latest/mouth/smile",
      },
      rigPoseControlInputIds: new Set(["happy"]),
      poseControlBridgeValues,
      currentValues: new Map(),
    });

    expect(unchanged.poseControlInputs).toEqual([]);
  });
});
