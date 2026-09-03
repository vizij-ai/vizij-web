import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  animationClipContentSignature,
  createPropsRigTargetCatalog,
  dedupeImportedClips,
  importGltfAnimations,
} from "..";
import {
  bundleAnimationEntryToClipIr,
  clipIrToBundleAnimationEntry,
} from "../../utils/animationClipCompiler";
import type { AnimationClipIR } from "../../types/animationClipIr";
import type { GltfJsonLike } from "../gltfAnimationChannels";
import { modelGeometryDerivedInputPaths } from "./makeGlb";
import { readGlbJson } from "./readGlbJson";
import { reencodeClipToGlb } from "./reencodeGlb";

const ASSET_DIR = path.resolve(__dirname, "../../../public/assets");
const assetPath = (name: string) => path.join(ASSET_DIR, name);
const CYCLES = 3;

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

/**
 * One full authoring cycle: store the clip in the bundle, read it back, export
 * it as native glTF animation, and import that again. This is the sequence a
 * real workflow performs — author, save, hand the GLB to Blender, take it
 * back — so running it repeatedly is what exposes drift that a single pass
 * hides.
 */
function cycle(
  sourceJson: GltfJsonLike,
  catalog: ReturnType<typeof createPropsRigTargetCatalog>,
  clip: AnimationClipIR,
): AnimationClipIR {
  const throughBundle = bundleAnimationEntryToClipIr(
    clipIrToBundleAnimationEntry(clip),
  );
  if (!throughBundle) {
    throw new Error("clip did not survive the bundle round trip");
  }
  const { clips } = importGltfAnimations({
    glb: reencodeClipToGlb(sourceJson, throughBundle),
    catalog,
  });
  if (clips.length !== 1) {
    throw new Error(`expected one clip from re-import, got ${clips.length}`);
  }
  return clips[0]!;
}

function setup(file: string) {
  const sourceJson = readGlbJson(assetPath(file));
  const catalog = createPropsRigTargetCatalog(
    modelGeometryDerivedInputPaths(sourceJson),
  );
  const initial = importGltfAnimations({
    glb: readArrayBuffer(file),
    catalog,
  }).clips[0]!;
  return { sourceJson, catalog, initial };
}

/** Largest absolute value difference between two clips, per channel. */
function maxValueDrift(left: AnimationClipIR, right: AnimationClipIR): number {
  const byChannel = new Map(right.tracks.map((t) => [t.channel, t]));
  let worst = 0;
  for (const track of left.tracks) {
    const other = byChannel.get(track.channel);
    if (!other) {
      return Number.POSITIVE_INFINITY;
    }
    track.keyframes.forEach((keyframe, index) => {
      const compare = other.keyframes[index];
      if (!compare) {
        worst = Number.POSITIVE_INFINITY;
        return;
      }
      worst = Math.max(worst, Math.abs(keyframe.value - compare.value));
      worst = Math.max(worst, Math.abs(keyframe.time - compare.time));
    });
  }
  return worst;
}

describe.runIf(available)("repeated import/export cycles", () => {
  it.each(FILES)("%s keeps its shape across 3 cycles", (file) => {
    const { sourceJson, catalog, initial } = setup(file);
    const channels = initial.tracks.map((t) => t.channel).sort();
    const keyCounts = [...initial.tracks]
      .sort((a, b) => a.channel.localeCompare(b.channel))
      .map((t) => t.keyframes.length);

    let current = initial;
    for (let pass = 1; pass <= CYCLES; pass += 1) {
      current = cycle(sourceJson, catalog, current);
      expect(
        current.tracks.map((t) => t.channel).sort(),
        `cycle ${pass}`,
      ).toEqual(channels);
      expect(
        [...current.tracks]
          .sort((a, b) => a.channel.localeCompare(b.channel))
          .map((t) => t.keyframes.length),
        `cycle ${pass} keyframe counts`,
      ).toEqual(keyCounts);
      expect(current.duration, `cycle ${pass} duration`).toBeCloseTo(
        initial.duration,
        5,
      );
    }
  });

  it.each(FILES)("%s converges — drift does not accumulate", (file) => {
    const { sourceJson, catalog, initial } = setup(file);

    const first = cycle(sourceJson, catalog, initial);
    const second = cycle(sourceJson, catalog, first);
    const third = cycle(sourceJson, catalog, second);

    const initialDrift = maxValueDrift(initial, first);
    const laterDrift = maxValueDrift(second, third);

    // The first pass may quantize (euler -> float32 quaternion -> euler).
    // After that the representation is already float32-representable, so
    // further cycles must be exactly stable. An accumulating error would show
    // up here as laterDrift growing rather than collapsing to zero.
    expect(initialDrift).toBeLessThan(1e-3);
    expect(laterDrift).toBe(0);
  });

  it.each(FILES)("%s is content-identical from cycle 2 onward", (file) => {
    const { sourceJson, catalog, initial } = setup(file);
    const first = cycle(sourceJson, catalog, initial);
    const second = cycle(sourceJson, catalog, first);
    const third = cycle(sourceJson, catalog, second);

    // Signatures are what de-duplication compares, so equality here is what
    // stops repeated round trips from spawning duplicate clips.
    expect(animationClipContentSignature(third)).toBe(
      animationClipContentSignature(second),
    );
  });

  it.each(FILES)("%s de-duplicates on every cycle", (file) => {
    const { sourceJson, catalog, initial } = setup(file);

    let previous = cycle(sourceJson, catalog, initial);
    for (let pass = 2; pass <= CYCLES; pass += 1) {
      const next = cycle(sourceJson, catalog, previous);
      const { fresh, duplicates } = dedupeImportedClips({
        clips: [next],
        existing: [{ name: `cycle-${pass - 1}`, clip: previous }],
      });
      expect(fresh, `cycle ${pass} should not add a clip`).toEqual([]);
      expect(
        duplicates,
        `cycle ${pass} should report a duplicate`,
      ).toHaveLength(1);
      previous = next;
    }
  });

  it("keeps Toasty's blink and its flat columns distinct across cycles", () => {
    // The blink is the only real motion in the file; the other six columns are
    // genuinely zero. A regrouping bug in either direction would smear one into
    // the other, and repeated cycles would amplify it.
    const { sourceJson, catalog, initial } = setup(
      "Toasty_Latest_Blender_Export.glb",
    );
    let current = initial;
    for (let pass = 0; pass < CYCLES; pass += 1) {
      current = cycle(sourceJson, catalog, current);
    }
    const byChannel = new Map(current.tracks.map((t) => [t.channel, t]));

    for (const channel of [
      "propsrig/l_tlid/lid_updn/value",
      "propsrig/r_tlid/lid_updn/value",
    ]) {
      const values = byChannel.get(channel)!.keyframes.map((k) => k.value);
      expect(Math.min(...values)).toBeCloseTo(0, 6);
      expect(Math.max(...values)).toBeCloseTo(1, 6);
    }
    for (const channel of [
      "propsrig/l_tlid/curveup/value",
      "propsrig/l_tlid/curvedn/value",
      "propsrig/faceshadowgeo/round/value",
      "propsrig/faceshadowgeo/fullscreen/value",
    ]) {
      const values = byChannel.get(channel)!.keyframes.map((k) => k.value);
      expect(Math.max(...values.map(Math.abs))).toBe(0);
    }
  });

  it("keeps Quori's rotation continuous across cycles", () => {
    const { sourceJson, catalog, initial } = setup(
      "Quori_Latest_Blender_Export.glb",
    );
    let current = initial;
    for (let pass = 0; pass < CYCLES; pass += 1) {
      current = cycle(sourceJson, catalog, current);
      const rotation = current.tracks.filter((t) =>
        t.channel.includes("/rotation/"),
      );
      expect(rotation).toHaveLength(6);
      for (const track of rotation) {
        for (let i = 1; i < track.keyframes.length; i += 1) {
          expect(
            Math.abs(track.keyframes[i]!.value - track.keyframes[i - 1]!.value),
            `${track.channel} cycle ${pass + 1}`,
          ).toBeLessThan(Math.PI);
        }
      }
    }
  });
});
