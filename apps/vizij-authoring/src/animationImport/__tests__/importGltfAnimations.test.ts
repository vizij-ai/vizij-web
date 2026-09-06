import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildCatalogFromRobotData,
  importGltfAnimations,
  inferGltfAnimationGrouping,
  readGltfAnimationDocument,
} from "..";
import { readGlbJson } from "./readGlbJson";

const ASSET_DIR = path.resolve(__dirname, "../../../public/assets");

function assetPath(name: string): string {
  return path.join(ASSET_DIR, name);
}

function readArrayBuffer(name: string): ArrayBuffer {
  const buffer = readFileSync(assetPath(name));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

const CASES = [
  {
    face: "Quori",
    blenderExport: "Quori_Latest_Blender_Export.glb",
    targetFace: "Quori_Current.glb",
    tracks: 37,
    duration: 5,
  },
  {
    face: "Hugo",
    blenderExport: "Hugo_Latest_Blender_Export.glb",
    targetFace: "Hugo_Current.glb",
    tracks: 31,
    duration: 5,
  },
  {
    face: "Toasty",
    blenderExport: "Toasty_Latest_Blender_Export.glb",
    targetFace: "Toasty_Current.glb",
    tracks: 8,
    duration: 21.958333,
  },
] as const;

const available = CASES.every(
  (entry) =>
    existsSync(assetPath(entry.blenderExport)) &&
    existsSync(assetPath(entry.targetFace)),
);

describe.runIf(available)("importGltfAnimations", () => {
  describe.each(CASES)(
    "$face",
    ({ blenderExport, targetFace, tracks, duration }) => {
      it("imports one clip carrying real keyframe data", () => {
        const catalog = buildCatalogFromRobotData(
          readGlbJson(assetPath(targetFace)),
        );
        const result = importGltfAnimations({
          glb: readArrayBuffer(blenderExport),
          catalog,
        });

        expect(result.clips).toHaveLength(1);
        const clip = result.clips[0]!;
        expect(clip.tracks).toHaveLength(tracks);
        expect(clip.duration).toBeCloseTo(duration, 4);
        expect(result.stats.keyframes).toBeGreaterThan(0);

        // Every track carries decoded, finite, time-ordered keyframes.
        for (const track of clip.tracks) {
          expect(track.keyframes.length).toBeGreaterThan(0);
          for (const keyframe of track.keyframes) {
            expect(Number.isFinite(keyframe.time)).toBe(true);
            expect(Number.isFinite(keyframe.value)).toBe(true);
          }
          const times = track.keyframes.map((k) => k.time);
          expect([...times].sort((a, b) => a - b)).toEqual(times);
          // compileAnimationClipIr strips the leading slash, matching the
          // channel convention already used by bundle clips.
          expect(track.channel.startsWith("propsrig/")).toBe(true);
        }
      });

      it("detects per-action grouping and says how to preserve grouping", () => {
        const grouping = inferGltfAnimationGrouping(
          readGltfAnimationDocument(readArrayBuffer(blenderExport)),
        );
        expect(grouping).toBe("per-action");

        const catalog = buildCatalogFromRobotData(
          readGlbJson(assetPath(targetFace)),
        );
        const result = importGltfAnimations({
          glb: readArrayBuffer(blenderExport),
          catalog,
        });
        const note = result.diagnostics.find(
          (entry) => entry.code === "per-action-grouping",
        );
        expect(note?.remediation).toContain("NLA Tracks");
      });
    },
  );

  it("preserves Quori's shared timeline instead of collapsing fragments to zero", () => {
    // The fragments occupy disjoint sub-ranges of one 0..5s timeline. If import
    // shifted each animation to zero, every track would start at 0 and the
    // choreography would be destroyed.
    const catalog = buildCatalogFromRobotData(
      readGlbJson(assetPath("Quori_Current.glb")),
    );
    const { clips } = importGltfAnimations({
      glb: readArrayBuffer("Quori_Latest_Blender_Export.glb"),
      catalog,
    });
    const clip = clips[0]!;

    const faceTranslation = clip.tracks.find(
      (track) => track.channel === "propsrig/face_tran_rot_c/translation/x",
    );
    const leftEyeScale = clip.tracks.find(
      (track) => track.channel === "propsrig/l_eye/scale/x",
    );
    expect(faceTranslation).toBeDefined();
    expect(leftEyeScale).toBeDefined();

    // Face translation lives at the head of the timeline...
    expect(faceTranslation!.keyframes[0]!.time).toBeCloseTo(0, 5);
    expect(
      faceTranslation!.keyframes[faceTranslation!.keyframes.length - 1]!.time,
    ).toBeCloseTo(0.708333, 4);
    // ...while the eye scale starts late and runs to the end.
    expect(leftEyeScale!.keyframes[0]!.time).toBeCloseTo(2.375, 4);
    expect(
      leftEyeScale!.keyframes[leftEyeScale!.keyframes.length - 1]!.time,
    ).toBeCloseTo(5, 4);
  });

  it("imports rotation as continuous euler curves", () => {
    const catalog = buildCatalogFromRobotData(
      readGlbJson(assetPath("Quori_Current.glb")),
    );
    const { clips } = importGltfAnimations({
      glb: readArrayBuffer("Quori_Latest_Blender_Export.glb"),
      catalog,
    });
    const rotationTracks = clips[0]!.tracks.filter((track) =>
      track.channel.includes("/rotation/"),
    );
    // LTLid and RTLid each carry a rotation channel -> 2 nodes x 3 components.
    expect(rotationTracks).toHaveLength(6);
    expect(rotationTracks.map((track) => track.channel).sort()).toEqual([
      "propsrig/ltlid/rotation/x",
      "propsrig/ltlid/rotation/y",
      "propsrig/ltlid/rotation/z",
      "propsrig/rtlid/rotation/x",
      "propsrig/rtlid/rotation/y",
      "propsrig/rtlid/rotation/z",
    ]);

    for (const track of rotationTracks) {
      expect(track.keyframes.length).toBeGreaterThan(0);
      // Euler conversion collapses to linear: quaternion tangents have no
      // euler equivalent.
      expect(track.interpolation).toBe("linear");
      for (const keyframe of track.keyframes) {
        expect(Number.isFinite(keyframe.value)).toBe(true);
        // Radians, and unwrapping should not run away on a real rig.
        expect(Math.abs(keyframe.value)).toBeLessThan(4 * Math.PI);
      }
      // No 2π discontinuity between adjacent keys.
      for (let i = 1; i < track.keyframes.length; i += 1) {
        const delta = Math.abs(
          track.keyframes[i]!.value - track.keyframes[i - 1]!.value,
        );
        expect(delta).toBeLessThan(Math.PI);
      }
    }
  });

  it("keeps Toasty's ~9s gap between its two moments", () => {
    const catalog = buildCatalogFromRobotData(
      readGlbJson(assetPath("Toasty_Current.glb")),
    );
    const { clips } = importGltfAnimations({
      glb: readArrayBuffer("Toasty_Latest_Blender_Export.glb"),
      catalog,
    });
    const clip = clips[0]!;
    const shadow = clip.tracks.find((t) =>
      t.channel.startsWith("propsrig/faceshadowgeo/"),
    );
    const lid = clip.tracks.find((t) =>
      t.channel.startsWith("propsrig/l_tlid/"),
    );
    expect(shadow!.keyframes[0]!.time).toBeCloseTo(10.541667, 4);
    expect(lid!.keyframes[0]!.time).toBeCloseTo(21.541667, 4);
  });
});
