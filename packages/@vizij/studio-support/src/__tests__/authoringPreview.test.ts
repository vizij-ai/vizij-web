import { describe, expect, it } from "vitest";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  buildAnimationPreviewBundle,
  buildMotionGraphPreviewBundle,
  buildMotionGraphResetValuesForOutputs,
  buildRuntimeGraphPreviewBundle,
  mergeManagedProgramAsset,
  MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
  MOTION_GRAPH_OUTPUT_TARGET_TYPE,
  resolveAuthoringCompileTargetState,
  type AnimationClipIR,
  type MotionGraphEditorEdge,
  type MotionGraphEditorNode,
  type VizijAnimationAsset,
  type VizijProgramAsset,
} from "../index";

describe("authoring preview bundle assembly", () => {
  it("keeps a matching registered compile target from being demoted to compiled", () => {
    expect(
      resolveAuthoringCompileTargetState({
        current: {
          status: "registered",
          message: null,
          signature: "animation-v1",
        },
        status: "compiled",
        signature: "animation-v1",
      }),
    ).toEqual({
      status: "registered",
      message: null,
      signature: "animation-v1",
    });

    expect(
      resolveAuthoringCompileTargetState({
        current: {
          status: "registered",
          message: null,
          signature: "animation-v1",
        },
        status: "compiled",
        signature: "animation-v2",
      }),
    ).toEqual({
      status: "compiled",
      message: null,
      signature: "animation-v2",
    });
  });

  it("builds graph preview patches from canonical runtime graph inputs", () => {
    const result = buildRuntimeGraphPreviewBundle({
      rigSpec: { nodes: [{ id: "rig-out" }], edges: [] } as any,
      poseGraphSpec: { nodes: [{ id: "pose-out" }], edges: [] } as any,
      poseConfig: { version: 1, neutralInputs: {}, poses: [] } as any,
    });

    expect(result.hasPayload).toBe(true);
    expect(result.bundle).toEqual({
      rig: {
        id: "rig",
        spec: { nodes: [{ id: "rig-out" }], edges: [] },
      },
      pose: {
        graph: {
          id: "pose",
          spec: { nodes: [{ id: "pose-out" }], edges: [] },
        },
        config: { version: 1, neutralInputs: {}, poses: [] },
      },
    });
    expect(result.signature).toContain("rig-out");
  });

  it("merges authored animation preview clips with inherited playable clips", () => {
    const inherited: VizijAnimationAsset = {
      id: "idle",
      clip: {
        id: "idle",
        tracks: [
          {
            channel: "rig/face/idle",
            keyframes: [{ time: 0, value: 0 }],
          },
        ],
      },
    };
    const staleAuthored: VizijAnimationAsset = {
      id: AUTHORED_TIMELINE_CLIP_ID,
      clip: { id: AUTHORED_TIMELINE_CLIP_ID, tracks: [] },
    };
    const authoredClip: AnimationClipIR = {
      schemaVersion: 1,
      id: AUTHORED_TIMELINE_CLIP_ID,
      duration: 1,
      tracks: [
        {
          id: "track-smile",
          variableId: "smile",
          channel: "controls/smile",
          interpolation: "linear",
          keyframes: [{ id: "kf", time: 0, value: 0.5 }],
        },
      ],
    };

    const result = buildAnimationPreviewBundle({
      active: true,
      authoredClip,
      currentAnimations: [staleAuthored, inherited],
    });

    expect(result.animations.map((animation) => animation.id)).toEqual([
      AUTHORED_TIMELINE_CLIP_ID,
      "idle",
    ]);
    expect(result.authoredAnimation?.clip.tracks).toHaveLength(1);
    expect(result.outputPaths).toEqual(["controls/smile"]);
    expect(result.bundle).toEqual({ animations: result.animations });
  });

  it("mutes the active animation set when preview animation source is disabled", () => {
    const result = buildAnimationPreviewBundle({
      active: false,
      currentAnimations: [
        {
          id: "idle",
          clip: {
            id: "idle",
            tracks: [{ channel: "controls/smile", keyframes: [] }],
          },
        },
      ],
    });

    expect(result.animations).toEqual([
      {
        id: "idle",
        clip: {
          id: "idle",
          tracks: [],
        },
      },
    ]);
  });

  it("merges managed motion graph programs without dropping unrelated programs", () => {
    const current: VizijProgramAsset[] = [
      {
        id: "idle",
        graph: { id: "idle.graph", spec: { nodes: [], edges: [] } },
      },
    ];
    const nodes: MotionGraphEditorNode[] = [
      {
        id: "constant",
        type: "constant",
        position: { x: 0, y: 0 },
        data: { params: { value: "0.75" } },
      },
      {
        id: "target",
        type: MOTION_GRAPH_OUTPUT_TARGET_TYPE,
        position: { x: 100, y: 0 },
        data: { outputPath: "rig/face/smile" },
      },
    ];
    const edges: MotionGraphEditorEdge[] = [
      {
        id: "e",
        source: "constant",
        target: "target",
        targetHandle: MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
      },
    ];

    const result = buildMotionGraphPreviewBundle({
      controllerId: "authoring.program",
      nodes,
      edges,
      resetValues: [{ path: "rig/face/smile", value: 0.1 }],
      currentPrograms: current,
    });

    expect(result.programAsset?.resetValues).toEqual({
      "rig/face/smile": 0.1,
    });
    expect(result.programs.map((program) => program.id)).toEqual([
      "authoring.program",
      "idle",
    ]);
    expect(result.bundle).toEqual({ programs: result.programs });
  });

  it("preserves imported reset values while defaulting new motion graph outputs", () => {
    const standardInputsByPath = new Map([
      [
        "/smile",
        {
          id: "smile",
          label: "Smile",
          path: "/smile",
          group: "face",
          defaultValue: 0.1,
          range: { min: 0, max: 1 },
        },
      ],
      [
        "/blink",
        {
          id: "blink",
          label: "Blink",
          path: "/blink",
          group: "face",
          defaultValue: 0.4,
          range: { min: 0, max: 1 },
        },
      ],
    ]);

    expect(
      buildMotionGraphResetValuesForOutputs(
        ["rig/face/smile", "rig/face/blink"],
        standardInputsByPath,
        {
          "rig/face/smile": 0.25,
        },
      ),
    ).toEqual({
      "rig/face/blink": 0.4,
      "rig/face/smile": 0.25,
    });
  });

  it("removes the previously managed program when the editor no longer produces one", () => {
    const current: VizijProgramAsset[] = [
      {
        id: "authoring.program",
        graph: {
          id: "authoring.program.graph",
          spec: { nodes: [], edges: [] },
        },
      },
      {
        id: "idle",
        graph: { id: "idle.graph", spec: { nodes: [], edges: [] } },
      },
    ];

    expect(
      mergeManagedProgramAsset(current, null, "authoring.program"),
    ).toEqual([
      {
        id: "idle",
        graph: { id: "idle.graph", spec: { nodes: [], edges: [] } },
      },
    ]);
  });
});
