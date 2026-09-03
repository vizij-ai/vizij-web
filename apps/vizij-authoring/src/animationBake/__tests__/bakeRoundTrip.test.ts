import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveMorphFeatureKeys } from "@vizij/render";
import { bakeClipToTrackSpecs, createBakeTargetIndex } from "..";
import type { BakeTargetElement } from "..";
import {
  createPropsRigTargetCatalog,
  importGltfAnimations,
} from "../../animationImport";
import type { GltfJsonLike } from "../../animationImport/gltfAnimationChannels";
import { modelGeometryDerivedInputPaths } from "../../animationImport/__tests__/makeGlb";
import { readGlbJson } from "../../animationImport/__tests__/readGlbJson";

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
 * Bake targets built from the source GLB's own nodes, standing in for the
 * live authoring world: node names, rest transforms, and morph feature keys.
 */
function bakeTargetsFor(json: GltfJsonLike) {
  const elements: BakeTargetElement[] = [];
  (json.nodes ?? []).forEach((node) => {
    const name = typeof node?.name === "string" ? node.name : "";
    if (!name) {
      return;
    }
    const raw = node as unknown as {
      translation?: number[];
      scale?: number[];
      mesh?: number;
    };
    const morphNames =
      typeof raw.mesh === "number"
        ? json.meshes?.[raw.mesh]?.extras?.targetNames
        : null;
    elements.push({
      elementName: name,
      translation: [
        raw.translation?.[0] ?? 0,
        raw.translation?.[1] ?? 0,
        raw.translation?.[2] ?? 0,
      ],
      rotationEuler: [0, 0, 0],
      scale: [raw.scale?.[0] ?? 1, raw.scale?.[1] ?? 1, raw.scale?.[2] ?? 1],
      morphFeatureKeys: Array.isArray(morphNames)
        ? deriveMorphFeatureKeys(
            morphNames.map((entry) => (typeof entry === "string" ? entry : "")),
          )
        : [],
    });
  });
  return createBakeTargetIndex(elements);
}

const FILES = [
  "Quori_Latest_Blender_Export.glb",
  "Hugo_Latest_Blender_Export.glb",
  "Toasty_Latest_Blender_Export.glb",
] as const;

const available = FILES.every((file) => existsSync(assetPath(file)));

/**
 * import -> **production baker** -> compare.
 *
 * The GLB round-trip suite in `animationImport/__tests__` uses a test-only
 * encoder; this exercises the real `bakeClipToTrackSpecs`, so the shape it
 * produces is held to the same standard.
 */
describe.runIf(available)("import -> bake", () => {
  it.each(FILES)("%s bakes every imported channel", (file) => {
    const json = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const clip = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;

    const { tracks, report } = bakeClipToTrackSpecs({
      clip,
      targets: bakeTargetsFor(json),
    });

    // Imported clips are already node-level, so nothing should need sampling.
    expect(report.skipped).toEqual([]);
    expect(report.bakedChannels).toHaveLength(clip.tracks.length);
    expect(tracks.length).toBeGreaterThan(0);

    for (const spec of tracks) {
      expect(spec.values).toHaveLength(spec.times.length * spec.stride);
      expect(spec.times.every((time) => Number.isFinite(time))).toBe(true);
      expect(spec.values.every((value) => Number.isFinite(value))).toBe(true);
      // Times must be sorted for THREE keyframe tracks.
      expect([...spec.times].sort((a, b) => a - b)).toEqual(spec.times);
    }
  });

  it("collapses Quori's 37 scalar channels into per-node glTF channels", () => {
    const file = "Quori_Latest_Blender_Export.glb";
    const json = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const clip = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;
    const { tracks } = bakeClipToTrackSpecs({
      clip,
      targets: bakeTargetsFor(json),
    });

    // 37 scalars regroup into 9 vector/quaternion channels plus 4 morphs.
    expect(clip.tracks).toHaveLength(37);
    const byProperty = tracks.reduce<Record<string, number>>((acc, spec) => {
      acc[spec.property] = (acc[spec.property] ?? 0) + 1;
      return acc;
    }, {});
    expect(byProperty).toEqual({
      position: 5,
      quaternion: 2,
      scale: 4,
      morphTargetInfluences: 4,
    });
    expect(tracks.filter((t) => t.stride === 4)).toHaveLength(2);
  });

  it("bakes Toasty's morph channels by feature key", () => {
    const file = "Toasty_Latest_Blender_Export.glb";
    const json = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const clip = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;
    const { tracks } = bakeClipToTrackSpecs({
      clip,
      targets: bakeTargetsFor(json),
    });

    expect(tracks.map((spec) => spec.name).sort()).toEqual([
      "FaceShadowGeo.morphTargetInfluences[fullscreen]",
      "FaceShadowGeo.morphTargetInfluences[round]",
      "L_TLid.morphTargetInfluences[curvedn]",
      "L_TLid.morphTargetInfluences[curveup]",
      "L_TLid.morphTargetInfluences[lid_updn]",
      "R_TLid.morphTargetInfluences[curvedn]",
      "R_TLid.morphTargetInfluences[curveup]",
      "R_TLid.morphTargetInfluences[lid_updn]",
    ]);

    const blink = tracks.find(
      (spec) => spec.name === "L_TLid.morphTargetInfluences[lid_updn]",
    )!;
    expect(Math.max(...blink.values)).toBeCloseTo(1, 6);
    expect(Math.min(...blink.values)).toBeCloseTo(0, 6);
  });

  it("reports euler-to-quaternion as lossy on rotation", () => {
    const file = "Quori_Latest_Blender_Export.glb";
    const json = readGlbJson(assetPath(file));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const clip = importGltfAnimations({
      glb: readArrayBuffer(file),
      catalog,
    }).clips[0]!;
    const { report } = bakeClipToTrackSpecs({
      clip,
      targets: bakeTargetsFor(json),
    });
    expect(report.lossy).toContain("euler-to-quaternion");
  });
});
