// Baked tracks become an animation for `exportScene`, each bound by node name
// first, and the animation reaches the GLB.
import test from "node:test";
import assert from "node:assert/strict";
import {
  Group,
  NumberKeyframeTrack,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import { createExportAnimation } from "../src/functions/export-animation.ts";
import { exportScene } from "../src/functions/export.ts";
import { parseGlbJsonChunk } from "../src/functions/load-gltf.ts";

/** A root holding `L_Eye` (a group) and `Mouth` (a node with morphs). */
function fakeRoot() {
  const eye = { name: "L_Eye", traverse: (callback) => callback(eye) };
  const mouth = {
    name: "Mouth",
    morphTargetDictionary: { smile: 0 },
    traverse: (callback) => callback(mouth),
  };
  const root = {
    name: "Scene",
    traverse: (callback) => {
      callback(root);
      eye.traverse(callback);
      mouth.traverse(callback);
    },
  };
  return root;
}

const position = {
  name: "L_Eye.position",
  property: "position",
  elementName: "L_Eye",
  times: [0, 1],
  values: [0, 0, 0, 1, 2, 3],
  stride: 3,
};
const quaternion = {
  name: "L_Eye.quaternion",
  property: "quaternion",
  elementName: "L_Eye",
  times: [0, 1],
  values: [0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2],
  stride: 4,
};
const smile = {
  name: "Mouth.morphTargetInfluences[smile]",
  property: "morphTargetInfluences",
  elementName: "Mouth",
  times: [0, 1],
  values: [0, 1],
  stride: 1,
};

test("builds one keyframe track per bound track, typed by property", () => {
  const { animation, issues } = createExportAnimation({
    name: "Blink",
    duration: 1,
    tracks: [position, quaternion, smile],
    root: fakeRoot(),
  });

  assert.deepEqual(issues, []);
  assert.equal(animation.name, "Blink");
  assert.equal(animation.duration, 1);
  assert.deepEqual(
    animation.tracks.map((track) => track.name),
    [position.name, quaternion.name, smile.name],
  );
  assert.ok(animation.tracks[0] instanceof VectorKeyframeTrack);
  assert.ok(animation.tracks[1] instanceof QuaternionKeyframeTrack);
  assert.ok(animation.tracks[2] instanceof NumberKeyframeTrack);
  assert.deepEqual(Array.from(animation.tracks[0].values), position.values);
});

test("leaves out and reports each track that would not bind", () => {
  const { animation, issues } = createExportAnimation({
    name: "Partial",
    duration: 1,
    tracks: [
      position,
      { ...position, name: "Ghost.position", elementName: "Ghost" },
      { ...quaternion, values: [0, 0, 0, 1] },
      { ...smile, name: "Mouth.morphTargetInfluences[frown]" },
    ],
    root: fakeRoot(),
  });

  assert.deepEqual(
    animation.tracks.map((track) => track.name),
    [position.name],
  );
  assert.deepEqual(
    issues.map(({ trackName, reason, detail }) => [trackName, reason, detail]),
    [
      ["Ghost.position", "node-not-found", "Ghost"],
      ["L_Eye.quaternion", "bad-stride", "4 values for 2 times at stride 4"],
      ["Mouth.morphTargetInfluences[frown]", "morph-target-not-found", "frown"],
    ],
  );
});

test("gives no animation when no track binds", () => {
  const { animation, issues } = createExportAnimation({
    name: "Nothing",
    duration: 1,
    tracks: [{ ...position, elementName: "Ghost" }],
    root: fakeRoot(),
  });

  assert.equal(animation, null);
  assert.equal(issues.length, 1);
});

test("exportScene writes the animation as glTF channels on the named node", async () => {
  const root = new Group();
  root.name = "Face";
  const eye = new Group();
  eye.name = "L_Eye";
  root.add(eye);

  const { animation } = createExportAnimation({
    name: "Look",
    duration: 1,
    tracks: [position, quaternion],
    root,
  });
  const json = parseGlbJsonChunk(
    await exportScene(root, { animations: [animation] }),
  );

  assert.equal(json.animations.length, 1);
  assert.equal(json.animations[0].name, "Look");
  const targets = json.animations[0].channels.map(({ target }) => [
    json.nodes[target.node].name,
    target.path,
  ]);
  assert.deepEqual(targets.sort(), [
    ["L_Eye", "rotation"],
    ["L_Eye", "translation"],
  ]);
});
