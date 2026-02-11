import { describe, it, expect } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { PoseGraphService } from "./poseGraphService";

const createInput = (id: string, path: string): StandardRigInput => ({
  id,
  path,
  sourceId: id,
  label: id,
  group: "test",
  defaultValue: 0,
  range: { min: -1, max: 1 },
});

function findNode(spec: GraphSpec, id: string) {
  return spec.nodes?.find((node: any) => node.id === id);
}

describe("PoseGraphService", () => {
  it("builds pose graphs with group-based weight paths", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: "Emotions",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "average",
    });
    const inputNode = findNode(spec, "pose_pose_a") as any;
    expect(inputNode?.type).toBe("input");
    expect(inputNode?.params?.path).toBe("rig/robot/emotions/smile.weight");
  });

  it("applies additive blend mode when requested", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: null,
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "additive",
    });
    expect(findNode(spec, "pose_add_smile")?.type).toBe("add");
    expect(findNode(spec, "pose_overlay_smile")).toBeUndefined();
  });

  it("flags invalid specs", () => {
    const warnings = PoseGraphService.validate({ nodes: [] }, []);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("reports no warnings for parsed spec", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: "Emotions",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "average",
    });
    const warnings = PoseGraphService.validate(spec, inputs);
    expect(warnings.length).toBe(0);
  });
});
