// Loads shipped faces, rebuilds each one's scene graph from the world model
// with no renderer, exports it, and reloads the export.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Euler, Quaternion } from "three";
import {
  loadGLTFFromBlobWithBundle,
  parseGlbJsonChunk,
} from "../src/functions/load-gltf.ts";
import { exportScene } from "../src/functions/export.ts";
import { buildSceneGraph } from "../src/functions/build-scene-graph.ts";
import { selectExportableGroupEntries } from "../src/functions/exportable-bodies.ts";

const ASSETS = new URL(
  "../../../../apps/vizij-authoring/public/assets/",
  import.meta.url,
);
const FACES = [
  "Quori_Current_Extended",
  "Hugo_Current_Extended",
  "Toasty_Current",
];
const EPSILON = 1e-6;

async function load(bytes) {
  return loadGLTFFromBlobWithBundle(new Blob([bytes]));
}

/** Paths at which `a` and `b` differ; numbers compare within `EPSILON`. */
function diff(a, b, path = "", out = []) {
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > EPSILON) out.push(path);
  } else if (
    a === null ||
    b === null ||
    typeof a !== "object" ||
    typeof b !== "object"
  ) {
    if (a !== b) out.push(path);
  } else if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(path);
  } else {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      diff(a[key], b[key], `${path}/${key}`, out);
    }
  }
  return out;
}

function bundleOf(json) {
  const carrier = json.nodes.find((node) => node.extensions?.VIZIJ_bundle);
  return carrier?.extensions.VIZIJ_bundle ?? json.extensions?.VIZIJ_bundle;
}

/** The world as data: geometry objects reduced to their attribute names. */
function plainWorld(world) {
  return Object.fromEntries(
    Object.entries(world).map(([id, { geometry, ...entry }]) => [
      id,
      geometry
        ? {
            ...entry,
            attributes: Object.keys(geometry.attributes).sort(),
            morphAttributes: Object.fromEntries(
              Object.entries(geometry.morphAttributes).map(([k, v]) => [
                k,
                v.length,
              ]),
            ),
          }
        : entry,
    ]),
  );
}

const SCALAR_KEYS = ["f32", "f64", "i64", "i32", "u64", "u32", "float"];
const scalar = (value) =>
  typeof value === "number"
    ? value
    : SCALAR_KEYS.map((k) => value?.[k]).find((v) => typeof v === "number");
const components = (value) =>
  value?.struct
    ? value.struct.fields.map((field) => scalar(field.value))
    : [value.x, value.y, value.z];

function featureDefault(feature) {
  return feature.animated ? feature.value.default : feature.value;
}

/** The node TRS and mesh weights that `RobotData`'s authored defaults imply. */
function trsFromDefaults(robotData) {
  const { translation, rotation, scale } = robotData.features;
  const [rx, ry, rz] = components(featureDefault(rotation));
  const q = new Quaternion().setFromEuler(new Euler(rx, ry, rz, "ZYX"));
  return {
    translation: components(featureDefault(translation)),
    rotation: [q.x, q.y, q.z, q.w],
    scale: scale ? components(featureDefault(scale)) : [1, 1, 1],
  };
}

for (const face of FACES) {
  test(`${face} exports headlessly and reloads unchanged`, async () => {
    const sourceBytes = (await readFile(new URL(`${face}.glb`, ASSETS))).buffer;
    const source = parseGlbJsonChunk(sourceBytes);
    const loaded = await load(sourceBytes);

    const [root] = selectExportableGroupEntries(loaded.world);
    const glb = await exportScene(
      buildSceneGraph(loaded.world, loaded.animatables, root.id),
      {
        bundle: loaded.bundle,
      },
    );
    const output = parseGlbJsonChunk(glb);

    for (const key of [
      "nodes",
      "meshes",
      "materials",
      "accessors",
      "bufferViews",
    ]) {
      assert.equal(output[key].length, source[key].length, `${key} count`);
    }
    assert.deepEqual(
      output.nodes.map((node) => node.name),
      source.nodes.map((node) => node.name),
    );
    source.nodes.forEach((node, index) => {
      assert.deepEqual(
        output.nodes[index].extensions?.RobotData,
        node.extensions?.RobotData,
        `RobotData of ${node.name}`,
      );
    });
    // The renderer's picking metadata (`extras.selection`) is not written.
    source.nodes.forEach((node, index) => {
      const { selection: _selection, ...extras } = node.extras ?? {};
      assert.deepEqual(
        output.nodes[index].extras ?? {},
        extras,
        `extras of ${node.name}`,
      );
    });
    assert.equal(
      JSON.stringify(bundleOf(output)),
      JSON.stringify(bundleOf(source)),
    );
    assert.deepEqual(diff(output.materials, source.materials), []);
    assert.deepEqual(
      output.meshes.map((mesh) => mesh.extras?.targetNames),
      source.meshes.map((mesh) => mesh.extras?.targetNames),
    );

    // Node TRS and morph weights are the authored defaults.
    output.nodes.forEach((node) => {
      const robotData = node.extensions?.RobotData;
      if (!robotData) return;
      const expected = trsFromDefaults(robotData);
      const actual = {
        translation: node.translation ?? [0, 0, 0],
        rotation: node.rotation ?? [0, 0, 0, 1],
        scale: node.scale ?? [1, 1, 1],
      };
      if (diff(actual.rotation, expected.rotation).length > 0) {
        expected.rotation = expected.rotation.map((c) => -c);
      }
      assert.deepEqual(diff(actual, expected), [], `TRS of ${node.name}`);
      const targets = output.meshes[node.mesh]?.extras?.targetNames;
      if (targets) {
        const weights = targets.map((target) =>
          scalar(featureDefault(robotData.features[target])),
        );
        assert.deepEqual(
          diff(output.meshes[node.mesh].weights, weights),
          [],
          `weights of ${node.name}`,
        );
      }
    });

    const reloaded = await load(glb);
    assert.deepEqual(
      diff(plainWorld(reloaded.world), plainWorld(loaded.world)),
      [],
    );
    assert.deepEqual(diff(reloaded.animatables, loaded.animatables), []);
    assert.deepEqual(diff(reloaded.bundle, loaded.bundle), []);
    assert.equal(reloaded.animations.length, loaded.animations.length);
  });
}
