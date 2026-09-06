import { describe, expect, it } from "vitest";
import { Euler, Quaternion } from "three";
import {
  convertGltfAnimations,
  createPropsRigTargetCatalog,
  inferGltfAnimationGrouping,
  type GltfAnimationCurve,
  type GltfAnimationDocument,
} from "..";

type Quat = InstanceType<typeof Quaternion>;
const D = Math.PI / 180;

function quatZYX(x: number, y: number, z: number): Quat {
  return new Quaternion().setFromEuler(new Euler(x, y, z, "ZYX"));
}

function curve(
  overrides: Partial<GltfAnimationCurve> = {},
): GltfAnimationCurve {
  return {
    nodeName: "L_Eye",
    path: "translation",
    interpolation: "LINEAR",
    times: [0, 1],
    values: [0, 0, 0, 1, 2, 3],
    stride: 3,
    ...overrides,
  };
}

function doc(
  curves: GltfAnimationCurve[],
  overrides: Partial<GltfAnimationDocument> = {},
): GltfAnimationDocument {
  return {
    animations: [{ name: "TestAction", index: 0, curves }],
    readErrors: [],
    ...overrides,
  };
}

const catalogOf = (...paths: string[]) => createPropsRigTargetCatalog(paths);

const FULL_TRANSLATION = catalogOf(
  "/propsrig/l_eye/translation/x",
  "/propsrig/l_eye/translation/y",
  "/propsrig/l_eye/translation/z",
);

/**
 * `convertGltfAnimations` is a pure type conversion: decoded glTF curves in,
 * Vizij clips out. These tests build documents as literals, so each behaviour
 * is pinned in isolation rather than inferred from a whole GLB.
 */
describe("convertGltfAnimations", () => {
  describe("vector channels", () => {
    it("splits a stride-3 curve into one scalar track per component", () => {
      const { clips } = convertGltfAnimations({
        document: doc([curve()]),
        catalog: FULL_TRANSLATION,
      });
      const tracks = clips[0]!.tracks;
      expect(tracks.map((t) => t.channel).sort()).toEqual([
        "propsrig/l_eye/translation/x",
        "propsrig/l_eye/translation/y",
        "propsrig/l_eye/translation/z",
      ]);
      const byChannel = new Map(tracks.map((t) => [t.channel, t]));
      expect(
        byChannel
          .get("propsrig/l_eye/translation/y")!
          .keyframes.map((k) => k.value),
      ).toEqual([0, 2]);
    });

    it("derives variableId from the channel path", () => {
      const { clips } = convertGltfAnimations({
        document: doc([curve()]),
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });
      expect(clips[0]!.tracks[0]!.variableId).toBe(
        "propsrig_l_eye_translation_x",
      );
    });

    it("keeps only the components present in the catalog", () => {
      const { clips, stats } = convertGltfAnimations({
        document: doc([curve()]),
        catalog: catalogOf("/propsrig/l_eye/translation/z"),
      });
      expect(clips[0]!.tracks).toHaveLength(1);
      expect(stats.resolvedChannels).toBe(1);
      expect(stats.unresolvedChannels).toBe(2);
    });

    it("maps scale to the scale feature", () => {
      const { clips } = convertGltfAnimations({
        document: doc([curve({ path: "scale" })]),
        catalog: catalogOf("/propsrig/l_eye/scale/x"),
      });
      expect(clips[0]!.tracks[0]!.channel).toBe("propsrig/l_eye/scale/x");
    });
  });

  describe("interpolation", () => {
    it("carries LINEAR and STEP through", () => {
      for (const [source, expected] of [
        ["LINEAR", "linear"],
        ["STEP", "step"],
      ] as const) {
        const { clips } = convertGltfAnimations({
          document: doc([curve({ interpolation: source })]),
          catalog: catalogOf("/propsrig/l_eye/translation/x"),
        });
        expect(clips[0]!.tracks[0]!.interpolation).toBe(expected);
      }
    });

    it("preserves CUBICSPLINE tangents from the triplet layout", () => {
      // glTF stores (inTangent, value, outTangent) per key.
      const { clips } = convertGltfAnimations({
        document: doc([
          curve({
            interpolation: "CUBICSPLINE",
            times: [0, 1],
            values: [
              ...[9, 9, 9], // key 0 inTangent
              ...[0, 0, 0], // key 0 value
              ...[8, 8, 8], // key 0 outTangent
              ...[7, 7, 7], // key 1 inTangent
              ...[1, 2, 3], // key 1 value
              ...[6, 6, 6], // key 1 outTangent
            ],
          }),
        ]),
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });
      const track = clips[0]!.tracks[0]!;
      expect(track.interpolation).toBe("cubic");
      expect(track.keyframes.map((k) => k.value)).toEqual([0, 1]);
      expect(track.keyframes.map((k) => k.inTangent)).toEqual([9, 7]);
      expect(track.keyframes.map((k) => k.outTangent)).toEqual([8, 6]);
    });
  });

  describe("morph weights", () => {
    it("emits one track per morph target, keyed by feature key", () => {
      const { clips } = convertGltfAnimations({
        document: doc([
          curve({
            path: "weights",
            stride: 2,
            times: [0, 1],
            values: [0, 0.25, 1, 0.75],
            morphFeatureKeys: ["lid_updn", "curveup"],
          }),
        ]),
        catalog: catalogOf(
          "/propsrig/l_eye/lid_updn/value",
          "/propsrig/l_eye/curveup/value",
        ),
      });
      const byChannel = new Map(
        clips[0]!.tracks.map((t) => [
          t.channel,
          t.keyframes.map((k) => k.value),
        ]),
      );
      // Column-major slicing: target 0 is [0, 1], target 1 is [0.25, 0.75].
      expect(byChannel.get("propsrig/l_eye/lid_updn/value")).toEqual([0, 1]);
      expect(byChannel.get("propsrig/l_eye/curveup/value")).toEqual([
        0.25, 0.75,
      ]);
    });

    it("reports a weights curve with no morph targets", () => {
      const { clips, diagnostics } = convertGltfAnimations({
        document: doc([
          curve({
            path: "weights",
            stride: 1,
            values: [0, 1],
            morphFeatureKeys: [],
          }),
        ]),
        catalog: catalogOf("/propsrig/l_eye/lid_updn/value"),
      });
      expect(clips).toEqual([]);
      expect(
        diagnostics.some(
          (entry) => entry.code === "unresolved-no-morph-targets",
        ),
      ).toBe(true);
    });
  });

  describe("rotation", () => {
    const rotationCatalog = catalogOf(
      "/propsrig/l_eye/rotation/x",
      "/propsrig/l_eye/rotation/y",
      "/propsrig/l_eye/rotation/z",
    );

    it("converts quaternions to euler ZYX and forces linear", () => {
      const a = quatZYX(0, 0, 0);
      const b = quatZYX(0, 0, 30 * D);
      const { clips } = convertGltfAnimations({
        document: doc([
          curve({
            path: "rotation",
            stride: 4,
            times: [0, 1],
            values: [a.x, a.y, a.z, a.w, b.x, b.y, b.z, b.w],
          }),
        ]),
        catalog: rotationCatalog,
      });
      const byChannel = new Map(clips[0]!.tracks.map((t) => [t.channel, t]));
      const z = byChannel.get("propsrig/l_eye/rotation/z")!;
      expect(z.interpolation).toBe("linear");
      expect(z.keyframes.map((k) => k.value)).toEqual([
        expect.closeTo(0, 6),
        expect.closeTo(30 * D, 6),
      ]);
    });

    it("corrects a sign-flipped quaternion sequence", () => {
      const a = quatZYX(0, 0, 10 * D);
      const b = quatZYX(0, 0, 12 * D);
      const { clips } = convertGltfAnimations({
        document: doc([
          curve({
            path: "rotation",
            stride: 4,
            times: [0, 1],
            values: [a.x, a.y, a.z, a.w, -b.x, -b.y, -b.z, -b.w],
          }),
        ]),
        catalog: rotationCatalog,
      });
      const z = clips[0]!.tracks.find(
        (t) => t.channel === "propsrig/l_eye/rotation/z",
      )!;
      expect(z.keyframes[1]!.value).toBeCloseTo(12 * D, 6);
    });

    it("reports cubic rotation as degraded to linear", () => {
      const q = quatZYX(0, 0, 20 * D);
      const { diagnostics } = convertGltfAnimations({
        document: doc([
          curve({
            path: "rotation",
            stride: 4,
            interpolation: "CUBICSPLINE",
            times: [0],
            values: [...[9, 9, 9, 9], ...[q.x, q.y, q.z, q.w], ...[8, 8, 8, 8]],
          }),
        ]),
        catalog: rotationCatalog,
      });
      expect(
        diagnostics.find((e) => e.code === "rotation-cubic-to-linear"),
      ).toBeDefined();
    });

    it("warns about keys on the euler singularity", () => {
      const q = quatZYX(0, 90 * D, 30 * D);
      const { diagnostics } = convertGltfAnimations({
        document: doc([
          curve({
            path: "rotation",
            stride: 4,
            times: [0],
            values: [q.x, q.y, q.z, q.w],
          }),
        ]),
        catalog: rotationCatalog,
      });
      expect(
        diagnostics.find((e) => e.code === "rotation-gimbal-keys")?.severity,
      ).toBe("warning");
    });
  });

  describe("grouping", () => {
    it("treats a single animation as a scene animation", () => {
      expect(inferGltfAnimationGrouping(doc([curve()]))).toBe("single-scene");
    });

    it("detects Blender per-Action mode from names and curve counts", () => {
      const document: GltfAnimationDocument = {
        animations: [
          { name: "Face_Tran_CAction", index: 0, curves: [curve()] },
          { name: "Key.001Action.002", index: 1, curves: [curve()] },
          { name: "LTLid_CAction.001", index: 2, curves: [curve()] },
        ],
        readErrors: [],
      };
      expect(inferGltfAnimationGrouping(document)).toBe("per-action");
    });

    it("treats few animations with many curves as per-animation", () => {
      const many = Array.from({ length: 6 }, () => curve());
      const document: GltfAnimationDocument = {
        animations: [
          { name: "Walk", index: 0, curves: many },
          { name: "Run", index: 1, curves: many },
        ],
        readErrors: [],
      };
      expect(inferGltfAnimationGrouping(document)).toBe("per-animation");
    });

    it("reassembles per-Action fragments onto one shared timeline", () => {
      // Fragments occupy disjoint sub-ranges of one timeline; shifting each to
      // zero would collapse the choreography.
      const document: GltfAnimationDocument = {
        animations: [
          {
            name: "EarlyAction",
            index: 0,
            curves: [
              curve({
                nodeName: "A",
                times: [0, 0.5],
                values: [0, 0, 0, 1, 1, 1],
              }),
            ],
          },
          {
            name: "LateAction.001",
            index: 1,
            curves: [
              curve({
                nodeName: "B",
                times: [4, 5],
                values: [0, 0, 0, 2, 2, 2],
              }),
            ],
          },
        ],
        readErrors: [],
      };
      const { clips, grouping } = convertGltfAnimations({
        document,
        catalog: catalogOf(
          "/propsrig/a/translation/x",
          "/propsrig/b/translation/x",
        ),
      });
      expect(grouping).toBe("per-action");
      expect(clips).toHaveLength(1);
      expect(clips[0]!.duration).toBeCloseTo(5, 6);
      const byChannel = new Map(clips[0]!.tracks.map((t) => [t.channel, t]));
      expect(
        byChannel.get("propsrig/a/translation/x")!.keyframes[0]!.time,
      ).toBe(0);
      expect(
        byChannel.get("propsrig/b/translation/x")!.keyframes[0]!.time,
      ).toBe(4);
    });

    it("merges two animations that drive the same channel", () => {
      const document: GltfAnimationDocument = {
        animations: [
          {
            name: "FirstAction",
            index: 0,
            curves: [curve({ times: [0], values: [1, 0, 0] })],
          },
          {
            name: "SecondAction",
            index: 1,
            curves: [curve({ times: [2], values: [3, 0, 0] })],
          },
        ],
        readErrors: [],
      };
      const { clips } = convertGltfAnimations({
        document,
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });
      expect(clips[0]!.tracks).toHaveLength(1);
      expect(clips[0]!.tracks[0]!.keyframes.map((k) => k.time)).toEqual([0, 2]);
    });

    it("splits independent animations into a clip each", () => {
      // An NLA export: two self-contained animations, each driving the same
      // channel over the same span. They used to be concatenated into one
      // track, where the compiler's one-key-per-time dedupe then *discarded*
      // the overlap — silent data loss on a workflow the importer's own
      // diagnostic recommends.
      const overlapping = (nodeName: string) => [
        curve({ nodeName, times: [0, 1], values: [0, 0, 0, 1, 1, 1] }),
        curve({
          nodeName,
          path: "scale" as const,
          times: [0, 1],
          values: [1, 1, 1, 2, 2, 2],
        }),
        curve({
          nodeName,
          path: "rotation" as const,
          times: [0, 1],
          stride: 4,
          values: [0, 0, 0, 1, 0, 0, 0, 1],
        }),
      ];
      const document: GltfAnimationDocument = {
        animations: [
          { name: "Wave", index: 0, curves: overlapping("L_Eye") },
          { name: "Nod", index: 1, curves: overlapping("L_Eye") },
        ],
        readErrors: [],
      };

      const { clips, grouping } = convertGltfAnimations({
        document,
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });

      expect(grouping).toBe("per-animation");
      expect(clips).toHaveLength(2);
      expect(clips.map((clip) => clip.name)).toEqual(["Wave", "Nod"]);
      // Every keyframe survives: two per animation, not two in total.
      for (const clip of clips) {
        const track = clip.tracks.find(
          (entry) => entry.channel === "propsrig/l_eye/translation/x",
        );
        expect(track?.keyframes.map((k) => k.time)).toEqual([0, 1]);
      }
      // Distinct ids, since clip id is the identity everywhere downstream.
      expect(new Set(clips.map((clip) => clip.id)).size).toBe(2);
    });

    it("warns rather than silently dropping keys that collide in one clip", () => {
      // Per-action fragments legitimately share a timeline, so a collision
      // there is merged — but the user still loses a value, and should be told.
      const document: GltfAnimationDocument = {
        animations: [
          {
            name: "FirstAction",
            index: 0,
            curves: [curve({ times: [0, 1], values: [1, 0, 0, 2, 0, 0] })],
          },
          {
            name: "SecondAction",
            index: 1,
            curves: [curve({ times: [1], values: [9, 0, 0] })],
          },
        ],
        readErrors: [],
      };

      const { grouping, diagnostics } = convertGltfAnimations({
        document,
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });

      expect(grouping).toBe("per-action");
      const collision = diagnostics.find(
        (entry) => entry.code === "channel-time-collision",
      );
      expect(collision?.severity).toBe("warning");
      expect(collision?.message).toContain("SecondAction");
    });
  });

  describe("diagnostics and stats", () => {
    it("accounts for every scalar channel", () => {
      const { stats } = convertGltfAnimations({
        document: doc([curve()]),
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });
      expect(stats.scalarChannels).toBe(3);
      expect(stats.resolvedChannels + stats.unresolvedChannels).toBe(3);
      expect(stats.sourceAnimations).toBe(1);
      expect(stats.keyframes).toBe(2);
    });

    it("reports an unnamed node once per scalar it would have produced", () => {
      const { diagnostics } = convertGltfAnimations({
        document: doc([curve({ nodeName: "" })]),
        catalog: FULL_TRANSLATION,
      });
      expect(
        diagnostics.find((e) => e.code === "unresolved-unnamed-node")?.message,
      ).toContain("3 channel(s)");
    });

    it("surfaces decode errors from the document", () => {
      const { diagnostics } = convertGltfAnimations({
        document: doc([], { readErrors: ['"Bad": sparse accessor'] }),
        catalog: FULL_TRANSLATION,
      });
      expect(
        diagnostics.find((e) => e.code === "sampler-read-failed")?.severity,
      ).toBe("error");
    });

    it("reports an empty document rather than returning silently", () => {
      const { clips, diagnostics } = convertGltfAnimations({
        document: { animations: [], readErrors: [] },
        catalog: FULL_TRANSLATION,
      });
      expect(clips).toEqual([]);
      expect(
        diagnostics.find((e) => e.code === "no-native-animations"),
      ).toBeDefined();
    });

    it("reports a stride mismatch instead of emitting garbage keyframes", () => {
      const { clips, diagnostics } = convertGltfAnimations({
        // 2 keys at stride 3 needs 6 values; give 5.
        document: doc([curve({ times: [0, 1], values: [0, 0, 0, 1, 1] })]),
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });
      expect(clips).toEqual([]);
      expect(
        diagnostics.find((e) => e.code === "sampler-stride-mismatch")?.severity,
      ).toBe("error");
    });

    it("reports constant tracks so a flat timeline is explained", () => {
      const { diagnostics } = convertGltfAnimations({
        document: doc([curve({ times: [0, 1], values: [5, 0, 0, 5, 0, 0] })]),
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
      });
      expect(
        diagnostics.find((e) => e.code === "constant-tracks")?.message,
      ).toContain("1 of 1");
    });

    it("names the clip and id from the options", () => {
      const { clips } = convertGltfAnimations({
        document: doc([curve()]),
        catalog: catalogOf("/propsrig/l_eye/translation/x"),
        clipId: "authoring.timeline.clip.7",
        clipName: "My Clip",
      });
      expect(clips[0]!.id).toBe("authoring.timeline.clip.7");
      expect(clips[0]!.name).toBe("My Clip");
    });
  });

  describe("purity", () => {
    it("is deterministic and does not mutate its input", () => {
      const document = doc([curve()]);
      const snapshot = JSON.stringify(document);
      const first = convertGltfAnimations({
        document,
        catalog: FULL_TRANSLATION,
      });
      const second = convertGltfAnimations({
        document,
        catalog: FULL_TRANSLATION,
      });
      expect(JSON.stringify(document)).toBe(snapshot);
      expect(JSON.stringify(second.clips)).toBe(JSON.stringify(first.clips));
    });
  });
});
