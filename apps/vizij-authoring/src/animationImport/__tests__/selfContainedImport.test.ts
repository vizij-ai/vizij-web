import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPropsRigTargetCatalog, importGltfAnimations } from "..";
import { modelGeometryDerivedInputPaths } from "./makeGlb";
import { readGlbJson } from "./readGlbJson";

const ASSET_DIR = path.resolve(__dirname, "../../../public/assets");
const assetPath = (name: string) => path.join(ASSET_DIR, name);

function readArrayBuffer(name: string): ArrayBuffer {
  const buffer = readFileSync(assetPath(name));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/**
 * The real user flow: load a Blender export as the face, then import that same
 * file's animations. The face has no `RobotData`, so its rig is regenerated
 * from geometry — meaning both sides of the match come from one file.
 *
 * The corpus test resolves each Blender export against its `*_Current.glb`
 * counterpart instead, which does not cover this case.
 */
const CASES = [
  { face: "Quori", file: "Quori_Latest_Blender_Export.glb", tracks: 37 },
  { face: "Hugo", file: "Hugo_Latest_Blender_Export.glb", tracks: 31 },
  { face: "Toasty", file: "Toasty_Latest_Blender_Export.glb", tracks: 8 },
] as const;

const available = CASES.every((entry) => existsSync(assetPath(entry.file)));

describe.runIf(available)("self-contained GLB animation import", () => {
  it.each(CASES)(
    "$face resolves against a rig generated from its own geometry",
    ({ file, tracks }) => {
      const json = readGlbJson(assetPath(file));
      const catalog = createPropsRigTargetCatalog(
        modelGeometryDerivedInputPaths(json),
      );
      const result = importGltfAnimations({
        glb: readArrayBuffer(file),
        catalog,
      });

      expect(result.stats.unresolvedChannels).toBe(0);
      expect(result.clips).toHaveLength(1);
      expect(result.clips[0]!.tracks).toHaveLength(tracks);
    },
  );

  it("reports Toasty's constant tracks so a flat timeline is explained", () => {
    // Blender writes a weights channel per mesh covering every morph target,
    // so CurveUp/CurveDn/Round/FullScreen arrive as genuine all-zero columns.
    // Only the two Lid_UpDn tracks carry the blink.
    const file = "Toasty_Latest_Blender_Export.glb";
    const json = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const { clips, diagnostics } = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    });

    const note = diagnostics.find((entry) => entry.code === "constant-tracks");
    expect(note?.message).toContain("6 of 8");

    const varying = clips[0]!.tracks.filter((track) => {
      const first = track.keyframes[0]!.value;
      return track.keyframes.some((k) => Math.abs(k.value - first) > 1e-9);
    });
    expect(varying.map((track) => track.channel).sort()).toEqual([
      "propsrig/l_tlid/lid_updn/value",
      "propsrig/r_tlid/lid_updn/value",
    ]);
    // Those two are a blink: 1 -> 0 -> 1.
    const values = varying[0]!.keyframes.map((k) => k.value);
    expect(Math.min(...values)).toBeCloseTo(0, 6);
    expect(Math.max(...values)).toBeCloseTo(1, 6);
  });

  it("imports Toasty's three morph animations", () => {
    // Toasty's animation is entirely morph-based, so if morph feature keys did
    // not line up it would import zero tracks while Quori and Hugo still got
    // their translation/scale ones.
    const file = "Toasty_Latest_Blender_Export.glb";
    const json = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const { clips, stats } = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    });

    expect(stats.sourceAnimations).toBe(3);
    expect(clips[0]!.tracks.map((track) => track.channel).sort()).toEqual([
      "propsrig/faceshadowgeo/fullscreen/value",
      "propsrig/faceshadowgeo/round/value",
      "propsrig/l_tlid/curvedn/value",
      "propsrig/l_tlid/curveup/value",
      "propsrig/l_tlid/lid_updn/value",
      "propsrig/r_tlid/curvedn/value",
      "propsrig/r_tlid/curveup/value",
      "propsrig/r_tlid/lid_updn/value",
    ]);
  });
});
