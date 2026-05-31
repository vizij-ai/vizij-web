import { describe, expect, it, vi } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  type AnimationClipIR,
} from "../types/animationClipIr";
import {
  buildAuthoringVizijBundle,
  mergeMotionGraphsIntoBundle,
  prepareAuthoringVizijBundleForExport,
} from "../utils/bundleAssembly";

const INPUT: StandardRigInput = {
  id: "input_a",
  path: "/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const CLIP: AnimationClipIR = {
  schemaVersion: 1,
  id: AUTHORED_TIMELINE_CLIP_ID,
  name: "Authoring Timeline",
  duration: 2,
  tracks: [
    {
      id: "track-1",
      variableId: INPUT.id,
      channel: INPUT.path,
      interpolation: "cubic",
      keyframes: [
        { id: "kf-1", time: 0, value: 0, outTangent: 2 },
        { id: "kf-2", time: 2, value: 1, inTangent: 0 },
      ],
    },
  ],
};

describe("mergeMotionGraphsIntoBundle", () => {
  it("replaces existing motiongraph entries and preserves other graphs", () => {
    const bundle = mergeMotionGraphsIntoBundle(
      {
        version: 1,
        graphs: [
          { id: "rig", kind: "rig", spec: { nodes: [], edges: [] } },
          {
            id: "old-motiongraph",
            kind: "motiongraph",
            spec: { nodes: [{ id: "old" }], edges: [] },
          },
        ],
      },
      [
        {
          id: "program",
          label: "Program",
          spec: { nodes: [{ id: "new" }], edges: [] },
          resetValues: {
            "rig/face/smile": 0.2,
          },
        },
      ],
    );

    expect(bundle.graphs?.map((graph) => graph.id)).toEqual(["rig", "program"]);
    expect(
      bundle.graphs?.find((graph) => graph.id === "program"),
    ).toMatchObject({
      kind: "motiongraph",
      label: "Program",
      metadata: {
        source: "vizij-motiongraph",
        nodeCount: 1,
        edgeCount: 0,
        resetValues: {
          "rig/face/smile": 0.2,
        },
      },
    });
  });
});

describe("buildAuthoringVizijBundle", () => {
  it("assembles rig, pose, authored animation, inherited animations, and motion graph payloads", () => {
    const bundle = buildAuthoringVizijBundle({
      includeVizijBundle: true,
      includeImportedAnimations: true,
      faceId: "face",
      sourceName: "source.glb",
      loadedBundle: {
        version: 1,
        exportedAt: "2026-05-30T00:00:00.000Z",
        animations: [
          {
            id: "z-existing",
            clip: {
              id: "z-existing",
              duration: 1,
              tracks: [],
            },
          },
          {
            id: AUTHORED_TIMELINE_CLIP_ID,
            clip: {
              id: AUTHORED_TIMELINE_CLIP_ID,
              duration: 1,
              tracks: [],
              metadata: { origin: AUTHORED_TIMELINE_METADATA_ORIGIN },
            },
            metadata: { origin: AUTHORED_TIMELINE_METADATA_ORIGIN },
          },
        ],
      },
      pose: {
        poseGraphSpec: { nodes: [{ id: "pose_record_smile" }], edges: [] },
        poseGraphFileName: "pose_graph",
        poseConfig: {
          version: 1,
          faceId: "legacy",
          neutralInputs: { [INPUT.id]: 0 },
          poses: [
            {
              id: "smile",
              values: { [INPUT.id]: 1 },
            },
          ],
        },
        poseIr: {
          version: 1,
          faceId: "legacy",
        },
        poseDiagnostics: [
          {
            severity: "warning",
            code: "normalized",
            message: "Normalized pose data.",
          },
        ],
      },
      animatablesForExport: {},
      animatableComponents: [],
      bindings: {} as any,
      inputBindings: {} as any,
      standardInputsById: new Map([[INPUT.id, INPUT]]),
      featureLabelOverrides: {},
      authoredAnimationClips: [CLIP],
      speechConfig: { agentName: "Vizij" },
      motionGraphs: [
        {
          id: "program",
          spec: { nodes: [{ id: "n1" }], edges: [] },
          resetValues: {
            "rig/face/smile": 0.2,
          },
        },
      ],
      activeMotionGraphId: "program",
    });

    expect(bundle).toMatchObject({
      version: 1,
      metadata: {
        faceId: "face",
        source: "source.glb",
        previousBundleVersion: 1,
        previousExportedAt: "2026-05-30T00:00:00.000Z",
        authoredAnimationClips: 1,
        animationPayloadCount: 2,
        speechConfig: { agentName: "Vizij" },
        activeMotionGraphId: "program",
      },
      poses: {
        config: {
          faceId: "face",
        },
        metadata: {
          poseIr: {
            faceId: "face",
          },
          diagnosticSummary: {
            errors: 0,
            warnings: 1,
            info: 0,
          },
        },
      },
    });
    expect(bundle?.animations?.map((entry) => entry.id)).toEqual([
      AUTHORED_TIMELINE_CLIP_ID,
      "z-existing",
    ]);
    expect(bundle?.graphs?.map((graph) => graph.kind)).toEqual([
      "rig",
      "pose-driver",
      "motiongraph",
    ]);
    expect(
      bundle?.graphs?.find((graph) => graph.kind === "motiongraph")?.metadata,
    ).toMatchObject({
      resetValues: {
        "rig/face/smile": 0.2,
      },
    });
  });
});

describe("prepareAuthoringVizijBundleForExport", () => {
  it("prepares pose, authored animation, motiongraph, and validation as one support-owned export transaction", async () => {
    const poseSpec = {
      nodes: [{ id: "pose_record_smile", type: "constant" }],
      edges: [],
    } as unknown as GraphSpec;
    const buildPoseGraphSpec = vi.fn().mockReturnValue({ spec: poseSpec });
    const validatePoseGraphSpec = vi.fn().mockReturnValue([]);
    const auditBundleGraphs = vi.fn().mockResolvedValue([]);

    const result = await prepareAuthoringVizijBundleForExport({
      includeVizijBundle: true,
      includeImportedAnimations: false,
      faceId: "face",
      sourceName: "source.glb",
      loadedBundle: null,
      poseGraphFileName: "pose_graph",
      poseConfigCandidate: {
        version: 1,
        faceId: "legacy",
        neutralInputs: { [INPUT.id]: 0 },
        poses: [
          {
            id: "smile",
            values: { [INPUT.id]: 1 },
          },
        ],
      },
      poseIr: {
        version: 1,
        faceId: "legacy",
      },
      buildPoseGraphSpec,
      validatePoseGraphSpec,
      animatablesForExport: {},
      animatableComponents: [],
      bindings: {} as any,
      inputBindings: {} as any,
      standardInputsById: new Map([[INPUT.id, INPUT]]),
      featureLabelOverrides: {},
      fallbackAuthoredAnimationClip: CLIP,
      fallbackMotionGraphSpec: { nodes: [{ id: "n1" }], edges: [] },
      auditBundleGraphs,
    });

    expect(result.error).toBeNull();
    expect(buildPoseGraphSpec).toHaveBeenCalledWith(
      expect.objectContaining({ faceId: "face" }),
      [INPUT],
      {},
    );
    expect(validatePoseGraphSpec).toHaveBeenCalledWith(poseSpec, [INPUT]);
    expect(auditBundleGraphs).toHaveBeenCalledWith(
      expect.objectContaining({ graphs: expect.any(Array) }),
      { validOutputTargets: undefined },
    );
    expect(result.bundle).toMatchObject({
      poses: {
        config: {
          faceId: "face",
        },
      },
      metadata: {
        authoredAnimationClips: 1,
      },
    });
    expect(result.bundle?.graphs?.map((graph) => graph.kind)).toContain(
      "motiongraph",
    );
  });

  it("returns a pose validation error before exporting invalid authored pose graphs", async () => {
    const auditBundleGraphs = vi.fn().mockResolvedValue([]);

    const result = await prepareAuthoringVizijBundleForExport({
      includeVizijBundle: true,
      includeImportedAnimations: false,
      faceId: "face",
      sourceName: null,
      loadedBundle: null,
      poseConfigCandidate: {
        version: 1,
        neutralInputs: { [INPUT.id]: 0 },
        poses: [{ id: "smile", values: { [INPUT.id]: 1 } }],
      },
      buildPoseGraphSpec: vi.fn().mockReturnValue({
        spec: {
          nodes: [{ id: "pose_record_smile", type: "constant" }],
          edges: [],
        } as unknown as GraphSpec,
      }),
      validatePoseGraphSpec: vi.fn().mockReturnValue(["pose invalid"]),
      animatablesForExport: {},
      animatableComponents: [],
      bindings: {} as any,
      inputBindings: {} as any,
      standardInputsById: new Map([[INPUT.id, INPUT]]),
      featureLabelOverrides: {},
      auditBundleGraphs,
    });

    expect(result.error).toEqual({
      kind: "pose-graph-validation",
      message: "Pose graph is invalid:\npose invalid",
    });
    expect(auditBundleGraphs).not.toHaveBeenCalled();
  });

  it("prunes pose payloads when the built pose graph has no pose constants", async () => {
    const result = await prepareAuthoringVizijBundleForExport({
      includeVizijBundle: true,
      includeImportedAnimations: false,
      faceId: "face",
      sourceName: null,
      loadedBundle: null,
      poseConfigCandidate: {
        version: 1,
        neutralInputs: { [INPUT.id]: 0 },
        poses: [{ id: "smile", values: { [INPUT.id]: 1 } }],
      },
      buildPoseGraphSpec: vi.fn().mockReturnValue({
        spec: {
          nodes: [{ id: "pose_neutral_record", type: "constant" }],
          edges: [],
        } as unknown as GraphSpec,
      }),
      validatePoseGraphSpec: vi.fn().mockReturnValue(["pose invalid"]),
      animatablesForExport: {},
      animatableComponents: [],
      bindings: {} as any,
      inputBindings: {} as any,
      standardInputsById: new Map([[INPUT.id, INPUT]]),
      featureLabelOverrides: {},
      auditBundleGraphs: vi.fn().mockResolvedValue([]),
    });

    expect(result.error).toBeNull();
    expect(result.poseConfig).toBeNull();
    expect(result.poseGraphSpec).toBeNull();
    expect(result.bundle?.poses).toBeNull();
  });
});
