import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPropsRigTargetCatalog, importGltfAnimations } from "..";
import type { AnimationClipIR } from "../../types/animationClipIr";
import { modelGeometryDerivedInputPaths } from "./makeGlb";
import { reencodeClipToGlb } from "./reencodeGlb";
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

const FILES = [
  "Quori_Latest_Blender_Export.glb",
  "Hugo_Latest_Blender_Export.glb",
  "Toasty_Latest_Blender_Export.glb",
] as const;

const available = FILES.every((file) => existsSync(assetPath(file)));

function byChannel(clip: AnimationClipIR) {
  return new Map(clip.tracks.map((track) => [track.channel, track]));
}

/**
 * import -> re-encode to GLB -> import again.
 *
 * Goes through real GLB bytes (accessors, bufferViews, chunk framing), so it
 * covers the encode/decode symmetry the plan flags as the risky part: vector
 * recombination, morph targets addressed by name versus index, and the
 * euler <-> quaternion conversion.
 *
 * The encoder here is test-only; production baking of authored clips needs
 * graph sampling and is not implemented (plan phase 3).
 */
describe.runIf(available)("import -> GLB -> import round trip", () => {
  it.each(FILES)("%s re-imports onto identical channels", (file) => {
    const sourceJson = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(sourceJson),
    );

    const first = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;

    const second = importGltfAnimations({
      glb: reencodeClipToGlb(sourceJson, first),
      catalog,
    }).clips[0]!;

    expect(second.tracks.map((t) => t.channel).sort()).toEqual(
      first.tracks.map((t) => t.channel).sort(),
    );
    expect(second.duration).toBeCloseTo(first.duration, 5);
  });

  it.each(FILES)("%s preserves times and non-rotation values", (file) => {
    const sourceJson = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(sourceJson),
    );
    const first = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;
    const second = importGltfAnimations({
      glb: reencodeClipToGlb(sourceJson, first),
      catalog,
    }).clips[0]!;

    const after = byChannel(second);
    for (const track of first.tracks) {
      const restored = after.get(track.channel);
      expect(restored, track.channel).toBeDefined();
      expect(restored!.keyframes).toHaveLength(track.keyframes.length);

      restored!.keyframes.forEach((keyframe, index) => {
        // Times are float32 in both directions, so they survive exactly.
        expect(keyframe.time).toBeCloseTo(track.keyframes[index]!.time, 6);
      });

      if (track.channel.includes("/rotation/")) {
        // Rotation goes euler -> quaternion (float32) -> euler, so it is
        // compared with tolerance rather than exactly.
        restored!.keyframes.forEach((keyframe, index) => {
          expect(keyframe.value).toBeCloseTo(track.keyframes[index]!.value, 4);
        });
        continue;
      }

      restored!.keyframes.forEach((keyframe, index) => {
        expect(keyframe.value).toBeCloseTo(track.keyframes[index]!.value, 6);
      });
    }
  });

  it("keeps Quori's rotation continuous after a GLB round trip", () => {
    // The re-encode collapses euler to a quaternion, which discards the
    // unwrapped branch. Re-importing must re-derive a continuous curve rather
    // than reintroducing a 2π snap.
    const file = "Quori_Latest_Blender_Export.glb";
    const sourceJson = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(sourceJson),
    );
    const first = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;
    const second = importGltfAnimations({
      glb: reencodeClipToGlb(sourceJson, first),
      catalog,
    }).clips[0]!;

    const rotation = second.tracks.filter((t) =>
      t.channel.includes("/rotation/"),
    );
    expect(rotation.length).toBe(6);
    for (const track of rotation) {
      for (let i = 1; i < track.keyframes.length; i += 1) {
        expect(
          Math.abs(track.keyframes[i]!.value - track.keyframes[i - 1]!.value),
        ).toBeLessThan(Math.PI);
      }
    }
  });

  it("keeps Toasty's morph targets addressed by the right name", () => {
    // The encoder writes morph columns by target order and the importer reads
    // them back by name: a mismatch would silently swap Lid_UpDn with CurveUp.
    const file = "Toasty_Latest_Blender_Export.glb";
    const sourceJson = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(sourceJson),
    );
    const first = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;
    const second = importGltfAnimations({
      glb: reencodeClipToGlb(sourceJson, first),
      catalog,
    }).clips[0]!;

    const after = byChannel(second);
    const blink = after.get("propsrig/l_tlid/lid_updn/value")!;
    expect(Math.max(...blink.keyframes.map((k) => k.value))).toBeCloseTo(1, 5);
    expect(Math.min(...blink.keyframes.map((k) => k.value))).toBeCloseTo(0, 5);
    // The columns that were flat stay flat — not shuffled into the blink slot.
    for (const channel of [
      "propsrig/l_tlid/curveup/value",
      "propsrig/l_tlid/curvedn/value",
    ]) {
      const track = after.get(channel)!;
      expect(Math.max(...track.keyframes.map((k) => Math.abs(k.value)))).toBe(
        0,
      );
    }
  });
});
