import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  animationClipContentSignature,
  createPropsRigTargetCatalog,
  dedupeImportedClips,
  importGltfAnimations,
} from "..";
import type { AnimationClipIR } from "../../types/animationClipIr";
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

function importClip(file: string, clipId?: string): AnimationClipIR {
  const json = readGlbJson(assetPath(file));
  const catalog = createPropsRigTargetCatalog(
    modelGeometryDerivedInputPaths(json),
  );
  return importGltfAnimations({
    glb: readArrayBuffer(file),
    catalog,
    ...(clipId ? { clipIdPrefix: clipId } : {}),
  }).clips[0]!;
}

const FILE = "Quori_Latest_Blender_Export.glb";
const available = existsSync(assetPath(FILE));

describe("animationClipContentSignature", () => {
  const base: AnimationClipIR = {
    schemaVersion: 1,
    id: "a",
    name: "A",
    duration: 1,
    tracks: [
      {
        id: "t0",
        variableId: "propsrig_lid_scale_x",
        channel: "propsrig/lid/scale/x",
        interpolation: "linear",
        keyframes: [
          { id: "k0", time: 0, value: 0 },
          { id: "k1", time: 1, value: 1 },
        ],
      },
    ],
  };

  it("ignores id, name, label, colour and keyframe ids", () => {
    const cosmetic: AnimationClipIR = {
      ...base,
      id: "different",
      name: "Different",
      tracks: [
        {
          ...base.tracks[0]!,
          id: "renamed",
          label: "Some Label",
          color: "#ff0000",
          keyframes: base.tracks[0]!.keyframes.map((k, i) => ({
            ...k,
            id: `other-${i}`,
          })),
        },
      ],
    };
    expect(animationClipContentSignature(cosmetic)).toBe(
      animationClipContentSignature(base),
    );
  });

  it("changes when a value, time, channel or duration changes", () => {
    const signature = animationClipContentSignature(base);
    const mutate = (clip: AnimationClipIR) =>
      animationClipContentSignature(clip);

    expect(
      mutate({
        ...base,
        tracks: [
          {
            ...base.tracks[0]!,
            keyframes: [
              base.tracks[0]!.keyframes[0]!,
              { ...base.tracks[0]!.keyframes[1]!, value: 0.5 },
            ],
          },
        ],
      }),
    ).not.toBe(signature);

    expect(
      mutate({
        ...base,
        tracks: [{ ...base.tracks[0]!, channel: "propsrig/lid/scale/y" }],
      }),
    ).not.toBe(signature);

    expect(mutate({ ...base, duration: 2 })).not.toBe(signature);
  });

  it("ignores track order", () => {
    const second = {
      ...base.tracks[0]!,
      id: "t1",
      channel: "propsrig/lid/scale/y",
      variableId: "propsrig_lid_scale_y",
    };
    const forward: AnimationClipIR = {
      ...base,
      tracks: [base.tracks[0]!, second],
    };
    const reversed: AnimationClipIR = {
      ...base,
      tracks: [second, base.tracks[0]!],
    };
    expect(animationClipContentSignature(reversed)).toBe(
      animationClipContentSignature(forward),
    );
  });

  it("ignores detached tracks, which never reach output", () => {
    const withDetached: AnimationClipIR = {
      ...base,
      tracks: [
        ...base.tracks,
        {
          id: "t9",
          variableId: "propsrig_gone_scale_x",
          channel: "propsrig/gone/scale/x",
          interpolation: "linear",
          detached: true,
          keyframes: [{ id: "k0", time: 0, value: 5 }],
        },
      ],
    };
    expect(animationClipContentSignature(withDetached)).toBe(
      animationClipContentSignature(base),
    );
  });
});

describe("dedupeImportedClips", () => {
  it("returns everything when nothing is present yet", () => {
    const clip = { ...({} as AnimationClipIR) };
    const result = dedupeImportedClips({ clips: [], existing: [] });
    expect(result.fresh).toEqual([]);
    expect(result.duplicates).toEqual([]);
    void clip;
  });

  it("de-duplicates within a single batch", () => {
    const clip: AnimationClipIR = {
      schemaVersion: 1,
      id: "a",
      duration: 1,
      tracks: [
        {
          id: "t",
          variableId: "v",
          channel: "propsrig/a/scale/x",
          interpolation: "linear",
          keyframes: [{ id: "k", time: 0, value: 1 }],
        },
      ],
    };
    const result = dedupeImportedClips({
      clips: [clip, { ...clip, id: "b", name: "B" }],
      existing: [],
    });
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});

describe.runIf(available)("dedupe against a real import", () => {
  it("importing the same GLB twice yields no second clip", () => {
    const first = importClip(FILE, "authoring.timeline.clip.1");
    // A second import allocates a different clip id, exactly as the app does.
    const second = importClip(FILE, "authoring.timeline.clip.2");
    expect(second.id).not.toBe(first.id);

    const result = dedupeImportedClips({
      clips: [second],
      existing: [{ name: "Quori_Latest_Blender_Export", clip: first }],
    });
    expect(result.fresh).toEqual([]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0]!.existingName).toBe(
      "Quori_Latest_Blender_Export",
    );
  });

  it("keeps a clip whose content genuinely differs", () => {
    const first = importClip(FILE, "authoring.timeline.clip.1");
    const edited: AnimationClipIR = {
      ...first,
      id: "authoring.timeline.clip.2",
      tracks: first.tracks.map((track, index) =>
        index === 0
          ? {
              ...track,
              keyframes: track.keyframes.map((keyframe, keyIndex) =>
                keyIndex === 0
                  ? { ...keyframe, value: keyframe.value + 1 }
                  : keyframe,
              ),
            }
          : track,
      ),
    };
    const result = dedupeImportedClips({
      clips: [edited],
      existing: [{ name: "Original", clip: first }],
    });
    expect(result.fresh).toHaveLength(1);
    expect(result.duplicates).toEqual([]);
  });

  it("still de-duplicates after a bundle round trip", () => {
    // Storage must not perturb content enough to defeat de-duplication.
    const first = importClip(FILE, "authoring.timeline.clip.1");
    const second = importClip(FILE, "authoring.timeline.clip.2");
    expect(animationClipContentSignature(second)).toBe(
      animationClipContentSignature(first),
    );
  });
});
