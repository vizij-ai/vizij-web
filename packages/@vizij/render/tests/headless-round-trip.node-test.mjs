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

// No shipped face carries an ellipse or a rectangle; these two do, one with
// static features and one with animated ones.
const number = (id, value) => ({
  id,
  type: "number",
  default: value,
  constraints: {},
});
const PRIMITIVES = {
  world: {
    root: {
      id: "root",
      name: "Root",
      tags: [],
      type: "group",
      root: true,
      features: {
        translation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
      },
      rootBounds: { center: { x: 0, y: 0 }, size: { x: 4, y: 3 } },
      children: ["eye", "mouth"],
    },
    eye: {
      id: "eye",
      name: "Eye",
      tags: [],
      type: "ellipse",
      features: {
        translation: { animated: false, value: { x: -0.5, y: 0.4, z: 0.1 } },
        rotation: { animated: false, value: { x: 0, y: 0, z: 0.25 } },
        width: { animated: false, value: 0.3 },
        height: { animated: false, value: 0.5 },
        fillColor: { animated: false, value: { r: 0.1, g: 0.2, b: 0.9 } },
        fillOpacity: { animated: false, value: 0.8 },
        strokeWidth: { animated: false, value: 0.02 },
      },
    },
    mouth: {
      id: "mouth",
      name: "Mouth",
      tags: [],
      type: "rectangle",
      features: {
        translation: {
          animated: true,
          value: "mouth-translation",
        },
        rotation: { animated: false, value: { x: 0, y: 0, z: 0 } },
        width: { animated: true, value: "mouth-width" },
        height: { animated: true, value: "mouth-height" },
        fillColor: { animated: true, value: "mouth-fill" },
        fillOpacity: { animated: true, value: "mouth-opacity" },
      },
    },
  },
  animatables: {
    "mouth-translation": {
      id: "mouth-translation",
      type: "vector3",
      default: { x: 0, y: -0.6, z: 0.1 },
      constraints: {},
    },
    "mouth-width": number("mouth-width", 1.2),
    "mouth-height": number("mouth-height", 0.2),
    "mouth-fill": {
      id: "mouth-fill",
      type: "rgb",
      default: { r: 0.8, g: 0.1, b: 0.1 },
      constraints: {},
    },
    "mouth-opacity": number("mouth-opacity", 1),
  },
};

test("an ellipse and a rectangle export as the RobotData the Bevy view draws", async () => {
  const { world, animatables } = PRIMITIVES;
  const glb = await exportScene(buildSceneGraph(world, animatables, "root"));
  const output = parseGlbJsonChunk(glb);

  const node = (name) => output.nodes.find((entry) => entry.name === name);
  for (const [name, type] of [
    ["Eye", "ellipse"],
    ["Mouth", "rectangle"],
  ]) {
    const robotData = node(name).extensions?.RobotData;
    assert.equal(robotData?.type, type, `${name}'s type`);
    for (const feature of ["width", "height", "fillColor", "fillOpacity"]) {
      assert.ok(robotData.features[feature], `${name}'s ${feature}`);
    }
    // The view generates the mesh from the RobotData.
    assert.equal(node(name).mesh, undefined, `${name} carries no mesh`);
  }
  assert.deepEqual(node("Eye").extensions.RobotData.features.fillColor, {
    animated: false,
    value: { r: 0.1, g: 0.2, b: 0.9 },
  });
  assert.deepEqual(node("Mouth").extensions.RobotData.features.width, {
    animated: true,
    value: animatables["mouth-width"],
  });

  // Translation and rotation are the node's; width and height its scale.
  const eye = node("Eye");
  assert.deepEqual(diff(eye.translation, [-0.5, 0.4, 0.1]), []);
  assert.deepEqual(diff(eye.scale, [0.3, 0.5, 1]), []);
  const mouth = node("Mouth");
  assert.deepEqual(diff(mouth.translation, [0, -0.6, 0.1]), []);
  assert.deepEqual(diff(mouth.scale, [1.2, 0.2, 1]), []);

  const reloaded = await load(glb);
  assert.deepEqual(diff(plainWorld(reloaded.world), plainWorld(world)), []);
  assert.deepEqual(diff(reloaded.animatables, animatables), []);
});
