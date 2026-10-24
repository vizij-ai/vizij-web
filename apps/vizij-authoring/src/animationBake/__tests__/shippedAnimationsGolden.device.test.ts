// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describe as describeGlb } from "@vizij/runtime";
import type { ExportAnimationRoot } from "@vizij/render";
import { bakeAuthoredClips } from "../bakeAuthoredClips";
import { buildBakeChannelIndex } from "../bakeChannelIndex";
import { bakeClipToTrackSpecs } from "../bakeClip";
import {
  bakeChannelKeys,
  composeBakeGraph,
  outputPathsOfSpec,
} from "../bakeGraphSources";
import { createBakeTargetIndex, type BakeTargetElement } from "../bakeTargets";
import {
  createPropsRigTargetCatalog,
  importGltfAnimations,
} from "../../animationImport";
import { modelGeometryDerivedInputPaths } from "../../animationImport/__tests__/makeGlb";
import { readGlbJson } from "../../animationImport/__tests__/readGlbJson";
import { clipInputValuesAtTime } from "../../components/animation/clipPreview";
import { poseFromClipAtTime } from "../../poseRig/poseFromClip";
import type { AnimationClipIR } from "../../types/animationClipIr";
import { bundleAnimationEntryToClipIr } from "../../utils/animationClipCompiler";

/**
 * What the shipped faces' animations bake and preview to, pinned.
 *
 * The golden file holds what the bake, the scrub preview and pose sampling
 * produce for every animation `public/assets` ships: the graph bake of the
 * faces' bundle animations (Hugo's and Quori's extended faces) through their
 * composed rig, the node bake of the Blender exports' imported animations,
 * and each track's value on a 60 Hz grid and at every keyframe. A change to
 * how authoring evaluates an animation shows up here as a difference from
 * the file. `VIZIJ_WRITE_GOLDEN=1` rewrites it.
 */

const ASSET_DIR = path.resolve(__dirname, "../../../public/assets");
const GOLDEN = path.resolve(__dirname, "golden/shippedAnimations.json");

/** Faces whose bundle carries animations and the graphs the bake steps. */
const BUNDLE_FACES = [
  "Hugo_Current_Extended.glb",
  "Quori_Current_Extended.glb",
] as const;
/** Faces whose glTF animations import as node-channel animations. */
const BLENDER_FACES = [
  "Hugo_Latest_Blender_Export.glb",
  "Quori_Latest_Blender_Export.glb",
  "Toasty_Latest_Blender_Export.glb",
] as const;

/** Values are compared to this absolute tolerance. */
const TOLERANCE = 1e-6;

interface BundleLike {
  graphs?: unknown;
  animations?: Parameters<typeof bundleAnimationEntryToClipIr>[0][];
}

function readBundle(file: string): BundleLike {
  const json = readGlbJson(path.join(ASSET_DIR, file)) as {
    extensions?: { VIZIJ_bundle?: BundleLike };
    nodes?: Array<{ extensions?: { VIZIJ_bundle?: BundleLike } }>;
  };
  const bundle =
    json.extensions?.VIZIJ_bundle ??
    json.nodes?.find((node) => node.extensions?.VIZIJ_bundle)?.extensions
      ?.VIZIJ_bundle;
  if (!bundle) {
    throw new Error(`${file} carries no VIZIJ_bundle`);
  }
  return bundle;
}

function readArrayBuffer(file: string): ArrayBuffer {
  const buffer = readFileSync(path.join(ASSET_DIR, file));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

const VECTOR_FEATURES = new Set(["translation", "rotation", "scale"]);

/**
 * The face's elements and animatables as `describe` reads them from the GLB,
 * in the shapes the export hands the bake: the world's animated features,
 * the animatables (a vector feature by its `x`/`y`/`z` default), the bake
 * targets at rest and the exported tree.
 */
async function sceneOf(file: string) {
  const description = (await describeGlb(
    new Uint8Array(readFileSync(path.join(ASSET_DIR, file))),
  )) as unknown as {
    elements: Array<{ name: string; morphTargets?: string[] }>;
    animatables: Record<string, { feature: string; node: string }>;
  };
  const world: Record<
    string,
    {
      name: string;
      features: Record<string, { animated: true; value: string }>;
    }
  > = {};
  const animatables: Record<string, { type: string; default: unknown }> = {};
  for (const [id, animatable] of Object.entries(description.animatables)) {
    const element = (world[animatable.node] ??= {
      name: animatable.node,
      features: {},
    });
    element.features[animatable.feature] = { animated: true, value: id };
    animatables[id] = VECTOR_FEATURES.has(animatable.feature)
      ? { type: "vector3", default: { x: 0, y: 0, z: 0 } }
      : { type: "number", default: 0 };
  }
  const morphs = new Map(
    description.elements.map((element) => [
      element.name,
      element.morphTargets ?? [],
    ]),
  );
  const elements: BakeTargetElement[] = Object.keys(world).map((name) => ({
    elementName: name,
    translation: [0, 0, 0],
    rotationEuler: [0, 0, 0],
    scale: [1, 1, 1],
    morphFeatureKeys: morphs.get(name) ?? [],
  }));
  const nodes: ExportAnimationRoot[] = elements.map((element) => ({
    name: element.elementName,
    morphTargetDictionary: Object.fromEntries(
      element.morphFeatureKeys.map((key, index) => [key, index]),
    ),
    traverse: () => {},
  }));
  const root: ExportAnimationRoot = {
    name: "Scene",
    traverse: (callback) => {
      callback(root);
      nodes.forEach((node) => callback(node));
    },
  };
  return { world, animatables, targets: createBakeTargetIndex(elements), root };
}

/**
 * Times to sample `clip` at. On a grid (an authored animation): every 1/60 s,
 * every keyframe, and a millisecond either side of each. Otherwise (an
 * imported animation, linear throughout): every keyframe and the midpoint
 * between each two.
 */
function previewTimes(clip: AnimationClipIR, grid: boolean): number[] {
  const keys = [
    ...new Set(clip.tracks.flatMap((t) => t.keyframes.map((k) => k.time))),
  ].sort((left, right) => left - right);
  const times = new Set<number>(keys);
  if (grid) {
    const end = Math.max(clip.duration, ...keys);
    for (let frame = 0; frame <= Math.ceil(end * 60); frame += 1) {
      times.add(frame / 60);
    }
    for (const key of keys) {
      times.add(Math.max(0, key - 1e-3));
      times.add(key + 1e-3);
    }
  } else {
    keys.slice(1).forEach((key, index) => times.add((keys[index]! + key) / 2));
  }
  return [...times].sort((left, right) => left - right);
}

/** Rounded to a nanounit: what the golden file stores. */
const stored = (value: number) => Math.round(value * 1e9) / 1e9;

/** A record of values per time as one row per time, over `ids`. */
function rows(ids: string[], records: Record<string, number>[]) {
  return records.map((record) =>
    ids.map((id) => (id in record ? stored(record[id]!) : null)),
  );
}

/** What the scrub preview shows at `previewTimes`, and the pose a frame
 * saves at each keyframe. */
async function previewOf(clip: AnimationClipIR, grid: boolean) {
  const times = previewTimes(clip, grid);
  const preview: Record<string, number>[] = [];
  for (const time of times) {
    preview.push(await clipInputValuesAtTime(clip.tracks, time));
  }
  const inputIds = [...new Set(clip.tracks.map((track) => track.variableId))];
  const knownInputIds = new Set(inputIds);
  const keyTimes = [
    ...new Set(clip.tracks.flatMap((t) => t.keyframes.map((k) => k.time))),
  ].sort((left, right) => left - right);
  const poses: Record<string, number>[] = [];
  for (const time of keyTimes) {
    poses.push(
      (await poseFromClipAtTime({ clip, time, knownInputIds })).values,
    );
  }
  return {
    inputIds,
    times: times.map(stored),
    preview: rows(inputIds, preview),
    keyTimes: keyTimes.map(stored),
    poses: rows(inputIds, poses),
  };
}

interface ExportedTrack {
  name: string;
  times: ArrayLike<number>;
  values: ArrayLike<number>;
}

const plain = (track: ExportedTrack) => ({
  name: track.name,
  times: Array.from(track.times, stored),
  values: Array.from(track.values, stored),
});

async function bundleFaceGolden(file: string) {
  const bundle = readBundle(file);
  const clips = (bundle.animations ?? [])
    .map((entry) => bundleAnimationEntryToClipIr(entry))
    .filter((clip): clip is AnimationClipIR => clip !== null);
  const spec = await composeBakeGraph(bundle);
  const scene = await sceneOf(file);
  const { animations, report } = await bakeAuthoredClips({
    clips,
    spec,
    outputs: buildBakeChannelIndex({
      world: scene.world,
      animatables: scene.animatables,
      restrictToPaths: new Set(outputPathsOfSpec(spec)),
    }),
    channelKeys: await bakeChannelKeys(
      bundle,
      clips.flatMap((clip) => clip.tracks.map((track) => track.channel)),
    ),
    targets: scene.targets,
    root: scene.root,
  });
  const previews: Record<string, Awaited<ReturnType<typeof previewOf>>> = {};
  for (const clip of clips) {
    previews[clip.id] = await previewOf(clip, true);
  }
  return {
    bake: {
      propagationTicks: report.propagationTicks,
      outcomes: report.outcomes.map((outcome) => ({
        clipId: outcome.clipId,
        frameCount: outcome.sample.frameCount,
        sampledChannels: outcome.sample.sampledChannels,
        constantChannels: outcome.sample.constantChannels,
        keyframesBefore: outcome.decimate.keyframesBefore,
        keyframesAfter: outcome.decimate.keyframesAfter,
        bakedChannels: outcome.bake.bakedChannels,
      })),
      animations: (
        animations as Array<{ name: string; tracks: ExportedTrack[] }>
      ).map((animation) => ({
        name: animation.name,
        tracks: animation.tracks.map(plain),
      })),
    },
    previews,
  };
}

async function blenderFaceGolden(file: string) {
  const json = readGlbJson(path.join(ASSET_DIR, file));
  const clip = importGltfAnimations({
    glb: readArrayBuffer(file),
    catalog: createPropsRigTargetCatalog(modelGeometryDerivedInputPaths(json)),
  }).clips[0]!;
  const elements: BakeTargetElement[] = (json.nodes ?? []).flatMap((node) => {
    const name = typeof node?.name === "string" ? node.name : "";
    const raw = node as { translation?: number[]; scale?: number[] };
    return name
      ? [
          {
            elementName: name,
            translation: [
              raw.translation?.[0] ?? 0,
              raw.translation?.[1] ?? 0,
              raw.translation?.[2] ?? 0,
            ] as [number, number, number],
            rotationEuler: [0, 0, 0] as [number, number, number],
            scale: [
              raw.scale?.[0] ?? 1,
              raw.scale?.[1] ?? 1,
              raw.scale?.[2] ?? 1,
            ] as [number, number, number],
            morphFeatureKeys: [],
          },
        ]
      : [];
  });
  const { tracks } = await bakeClipToTrackSpecs({
    clip,
    targets: createBakeTargetIndex(elements),
  });
  return {
    bake: tracks.map(plain),
    previews: { [clip.id]: await previewOf(clip, false) },
  };
}

async function computeGolden() {
  const faces: Record<string, unknown> = {};
  for (const file of BUNDLE_FACES) {
    faces[file] = await bundleFaceGolden(file);
  }
  for (const file of BLENDER_FACES) {
    faces[file] = await blenderFaceGolden(file);
  }
  return faces;
}

/** Every number of `actual` within `TOLERANCE` of `expected`'s, every other
 * value equal; the first difference names its path. */
function compare(
  actual: unknown,
  expected: unknown,
  at: string,
): string | null {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(actual - expected) <= TOLERANCE
      ? null
      : `${at}: ${actual} where the golden has ${expected}`;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length !== expected.length) {
      return `${at}: ${actual.length} entries where the golden has ${expected.length}`;
    }
    for (let index = 0; index < expected.length; index += 1) {
      const difference = compare(
        actual[index],
        expected[index],
        `${at}[${index}]`,
      );
      if (difference) {
        return difference;
      }
    }
    return null;
  }
  if (
    expected &&
    actual &&
    typeof expected === "object" &&
    typeof actual === "object"
  ) {
    const keys = Object.keys(expected as object);
    const actualKeys = Object.keys(actual as object);
    if (keys.sort().join() !== actualKeys.sort().join()) {
      return `${at}: keys ${actualKeys.join(",")} where the golden has ${keys.join(",")}`;
    }
    for (const key of keys) {
      const difference = compare(
        (actual as Record<string, unknown>)[key],
        (expected as Record<string, unknown>)[key],
        `${at}.${key}`,
      );
      if (difference) {
        return difference;
      }
    }
    return null;
  }
  return Object.is(actual, expected)
    ? null
    : `${at}: ${JSON.stringify(actual)} where the golden has ${JSON.stringify(expected)}`;
}

const available = [...BUNDLE_FACES, ...BLENDER_FACES].every((file) =>
  existsSync(path.join(ASSET_DIR, file)),
);

describe.runIf(available)("the shipped faces' animations", () => {
  it("bake and preview as the golden file holds", async () => {
    const actual = await computeGolden();
    if (process.env.VIZIJ_WRITE_GOLDEN === "1") {
      writeFileSync(GOLDEN, `${JSON.stringify(actual)}\n`);
    }
    const expected = JSON.parse(readFileSync(GOLDEN, "utf8")) as unknown;
    expect(compare(actual, expected, "golden")).toBeNull();
  }, 600_000);
});
