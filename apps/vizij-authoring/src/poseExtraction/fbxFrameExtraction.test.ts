import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  Euler,
  Group,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import type { World } from "@vizij/render";
import {
  channelSampleToRawValue,
  indexRawChannels,
  sampleFrameToInputValues,
  sampleFrameToRenderWrites,
  sampleRawTrackAtTime,
  summarizeClips,
  type RawChannelBinding,
} from "./fbxFrameExtraction";

// Build a minimal scene + Vizij world mirroring how `@vizij/render` imports a
// GLB node: a named Object3D whose uuid keys a renderable with translation /
// rotation / scale features referencing animatable ids.
function buildFixture() {
  const node = new Object3D();
  node.name = "Head";
  const scene = new Group();
  scene.add(node);

  const world = {
    [node.uuid]: {
      id: node.uuid,
      name: "Head",
      type: "group",
      features: {
        translation: { animated: true, value: "anim-translation" },
        rotation: { animated: true, value: "anim-rotation" },
        scale: { animated: true, value: "anim-scale" },
      },
    },
  } as unknown as World;

  return { node, scene, world };
}

describe("sampleRawTrackAtTime", () => {
  it("interpolates a vector track linearly", () => {
    const track = new VectorKeyframeTrack(
      "Head.position",
      [0, 1],
      [0, 0, 0, 10, 20, 30],
    );
    expect(sampleRawTrackAtTime(track, 0)).toEqual([0, 0, 0]);
    expect(sampleRawTrackAtTime(track, 0.5)).toEqual([5, 10, 15]);
    expect(sampleRawTrackAtTime(track, 1)).toEqual([10, 20, 30]);
  });

  it("slerps a quaternion track", () => {
    const qa = new Quaternion().setFromEuler(new Euler(0, 0, 0));
    const qb = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2));
    const track = new QuaternionKeyframeTrack(
      "Head.quaternion",
      [0, 1],
      [qa.x, qa.y, qa.z, qa.w, qb.x, qb.y, qb.z, qb.w],
    );
    const mid = sampleRawTrackAtTime(track, 0.5);
    expect(mid).toHaveLength(4);
    const q = new Quaternion(mid[0], mid[1], mid[2], mid[3]);
    const euler = new Euler().setFromQuaternion(q, "XYZ");
    // Halfway between 0 and 90 degrees about Z.
    expect(euler.z).toBeCloseTo(Math.PI / 4, 5);
  });
});

describe("channelSampleToRawValue", () => {
  const base: RawChannelBinding = {
    clipId: "clip",
    trackIndex: 0,
    trackName: "Head.position",
    track: new VectorKeyframeTrack("Head.position", [0], [0, 0, 0]),
    nodeName: "Head",
    nodeUuid: "uuid",
    property: "translation",
    animatableId: "anim-translation",
    animatableType: "vector3",
    valueSize: 3,
  };

  it("maps translation samples to a vector3", () => {
    expect(channelSampleToRawValue(base, [1, 2, 3])).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("converts a quaternion sample to an XYZ euler matching the renderer", () => {
    const q = new Quaternion().setFromEuler(new Euler(0.1, 0.2, 0.3, "XYZ"));
    const value = channelSampleToRawValue(
      { ...base, property: "rotation", animatableType: "euler", valueSize: 4 },
      [q.x, q.y, q.z, q.w],
    );
    expect(value).toBeDefined();
    const euler = value as { x: number; y: number; z: number };
    expect(euler.x).toBeCloseTo(0.1, 5);
    expect(euler.y).toBeCloseTo(0.2, 5);
    expect(euler.z).toBeCloseTo(0.3, 5);
  });

  it("returns undefined for unmapped weights channels", () => {
    expect(
      channelSampleToRawValue({ ...base, property: "weights" }, [0.5]),
    ).toBeUndefined();
  });
});

describe("indexRawChannels", () => {
  it("resolves tracks to the owning renderable animatables", () => {
    const { node, scene, world } = buildFixture();
    const track = new VectorKeyframeTrack(
      "Head.position",
      [0, 1],
      [0, 0, 0, 1, 1, 1],
    );
    const clip = new AnimationClip("wave", 1, [track]);

    const bindings = indexRawChannels([clip], scene, world);
    expect(bindings).toHaveLength(1);
    const [binding] = bindings;
    expect(binding.clipId).toBe("wave");
    expect(binding.property).toBe("translation");
    expect(binding.nodeUuid).toBe(node.uuid);
    expect(binding.animatableId).toBe("anim-translation");
    expect(binding.animatableType).toBe("vector3");
  });

  it("marks tracks for unknown nodes as unmapped", () => {
    const { scene, world } = buildFixture();
    const track = new VectorKeyframeTrack(
      "Bone_01.position",
      [0, 1],
      [0, 0, 0, 1, 1, 1],
    );
    const clip = new AnimationClip("bones", 1, [track]);

    const [binding] = indexRawChannels([clip], scene, world);
    expect(binding.animatableId).toBeNull();
  });
});

describe("sampleFrame helpers", () => {
  function buildClipAndBindings() {
    const { scene, world } = buildFixture();
    const posTrack = new VectorKeyframeTrack(
      "Head.position",
      [0, 1],
      [0, 0, 0, 2, 4, 6],
    );
    const clip = new AnimationClip("wave", 1, [posTrack]);
    const bindings = indexRawChannels([clip], scene, world);
    return { bindings };
  }

  it("produces render-store writes for mapped channels", () => {
    const { bindings } = buildClipAndBindings();
    const writes = sampleFrameToRenderWrites(bindings, "wave", 0.5, "default");
    expect(writes).toEqual([
      {
        id: "anim-translation",
        namespace: "default",
        value: { x: 1, y: 2, z: 3 },
      },
    ]);
  });

  it("maps sampled components onto resolved input ids", () => {
    const { bindings } = buildClipAndBindings();
    const resolveInputId = (componentId: string): string | null => {
      const map: Record<string, string> = {
        "anim-translation:x": "input-x",
        "anim-translation:y": "input-y",
        "anim-translation:z": "input-z",
      };
      return map[componentId] ?? null;
    };
    const values = sampleFrameToInputValues(
      bindings,
      "wave",
      0.5,
      resolveInputId,
    );
    expect(values).toEqual({
      "input-x": 1,
      "input-y": 2,
      "input-z": 3,
    });
  });

  it("skips components without a resolved input", () => {
    const { bindings } = buildClipAndBindings();
    const values = sampleFrameToInputValues(bindings, "wave", 1, () => null);
    expect(values).toEqual({});
  });
});

describe("summarizeClips", () => {
  it("derives stable ids and names", () => {
    const named = new AnimationClip("wave", 2, []);
    const unnamed = new AnimationClip("", 1.5, []);
    const [a, b] = summarizeClips([named, unnamed]);
    expect(a).toMatchObject({ id: "wave", name: "wave", duration: 2 });
    expect(b).toMatchObject({ id: "fbx-animation-1", name: "Animation 2" });
  });
});
