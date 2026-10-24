// Faces as Semio Studio writes them: features per axis (`translation.x`,
// `rotation.r`, `color.g`), each axis on an animatable of its own or on a
// component `<id>.<axis>` of a compound one, and rotations named roll, pitch
// and yaw. They load, build their scene graph and export without loss.
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadGLTFFromBlobWithBundle,
  parseGlbJsonChunk,
} from "../src/functions/load-gltf.ts";
import { exportScene } from "../src/functions/export.ts";
import { buildSceneGraph } from "../src/functions/build-scene-graph.ts";

const EPSILON = 1e-6;

const still = (value) => ({ animated: false, value });
const axis = (id, value) => ({
  animated: true,
  value: { id, name: id, type: "number", default: value, constraints: {} },
});

/** A GLB container of `json` and its binary chunk `bin`. */
function glb(json, bin) {
  const pad = (bytes, fill) => {
    const padded = new Uint8Array((bytes.length + 3) & ~3).fill(fill);
    padded.set(bytes);
    return padded;
  };
  const jsonChunk = pad(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binChunk = pad(bin, 0);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(jsonChunk, 20);
  const binStart = 20 + jsonChunk.length;
  view.setUint32(binStart, binChunk.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true);
  bytes.set(binChunk, binStart + 8);
  return buffer;
}

/** A unit square in the XY plane: four positions and six indices. */
function unitSquare() {
  const positions = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]);
  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);
  return bin;
}

const ROBOT_DATA = {
  // An earlier Studio form: a group's rotation whole, as roll, pitch, yaw.
  root: {
    id: "root",
    name: "Face",
    tags: [],
    type: "group",
    root: true,
    features: {
      translation: still({ x: 0, y: 0, z: 0 }),
      rotation: still({ r: 0, p: 0, y: 0.5 }),
    },
    rootBounds: { center: { x: 0, y: 0 }, size: { x: 4, y: 3 } },
    children: ["plate", "eye"],
  },
  // Each translation and the yaw on an animatable of its own; the colour on
  // the components of the compound animatable `tint`.
  plate: {
    id: "plate",
    name: "Plate",
    tags: [],
    type: "shape",
    material: "phong",
    features: {
      "translation.x": axis("plate-x", 0.25),
      "translation.y": axis("plate-y", -0.5),
      "translation.z": still(0),
      "rotation.r": still(0),
      "rotation.p": still(0),
      "rotation.y": axis("plate-yaw", 0.3),
      "scale.x": still(2),
      "scale.y": still(1),
      "scale.z": still(1),
      "color.r": axis("tint.r", 0.1),
      "color.g": axis("tint.g", 0.2),
      "color.b": axis("tint.b", 0.3),
      "emissive.r": still(0.4),
      "emissive.g": still(0),
      "emissive.b": still(0),
      shininess: still(30),
    },
  },
  // Static features, per axis, the way Studio's seeded faces carry them.
  eye: {
    id: "eye",
    name: "Eye",
    tags: [],
    type: "ellipse",
    features: {
      "translation.x": still(-0.7),
      "translation.y": still(0.45),
      "rotation.r": still(0),
      width: still(0.55),
      height: still(0.4),
      fillOpacity: still(1),
      "fillColor.r": still(0.29),
      "fillColor.g": still(0.78),
      "fillColor.b": still(0.94),
    },
  },
};

function studioFace(robotData = ROBOT_DATA) {
  const json = {
    asset: { version: "2.0" },
    extensionsUsed: ["RobotData"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: [1, 2], extensions: { RobotData: robotData.root } },
      {
        mesh: 0,
        translation: [0.25, -0.5, 0],
        extensions: { RobotData: robotData.plate },
      },
      {
        translation: [-0.7, 0.45, 0],
        extensions: { RobotData: robotData.eye },
      },
    ],
    meshes: [
      {
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }],
      },
    ],
    materials: [
      { pbrMetallicRoughness: { metallicFactor: 0.5, roughnessFactor: 0.5 } },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 4,
        type: "VEC3",
        min: [-0.5, -0.5, 0],
        max: [0.5, 0.5, 0],
      },
      { bufferView: 1, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 48 },
      { buffer: 0, byteOffset: 48, byteLength: 12 },
    ],
    buffers: [{ byteLength: 60 }],
  };
  return glb(json, unitSquare());
}

function close(actual, expected, label) {
  actual.forEach((value, index) => {
    assert.ok(
      Math.abs(value - expected[index]) <= EPSILON,
      `${label}[${index}]: ${value} ≠ ${expected[index]}`,
    );
  });
}

for (const aggressiveImport of [false, true]) {
  test(`a Studio face loads with its features per axis (aggressiveImport: ${aggressiveImport})`, async () => {
    const { world, animatables } = await loadGLTFFromBlobWithBundle(
      new Blob([studioFace()]),
      aggressiveImport,
    );
    assert.deepEqual(Object.keys(world).sort(), ["eye", "plate", "root"]);
    assert.deepEqual(world.plate.features["translation.x"], {
      animated: true,
      value: "plate-x",
    });
    assert.deepEqual(world.plate.features["color.g"], {
      animated: true,
      value: "tint.g",
    });
    assert.deepEqual(world.eye.features["fillColor.r"], still(0.29));
    assert.equal(animatables["plate-yaw"].type, "number");
    assert.equal(animatables["tint.b"].default, 0.3);
  });
}

test("a Studio face's scene graph takes its per-axis features and its roll, pitch, yaw", async () => {
  const { world, animatables } = await loadGLTFFromBlobWithBundle(
    new Blob([studioFace()]),
  );
  const root = buildSceneGraph(world, animatables, "root");
  const [plate, eye] = root.children;

  close(root.rotation.toArray().slice(0, 3), [0, 0, 0.5], "root rotation");
  assert.equal(root.rotation.order, "ZYX");
  close(plate.position.toArray(), [0.25, -0.5, 0], "plate position");
  close(plate.rotation.toArray().slice(0, 3), [0, 0, 0.3], "plate rotation");
  close(plate.scale.toArray(), [2, 1, 1], "plate scale");
  close(plate.material.color.toArray(), [0.1, 0.2, 0.3], "plate color");
  close(plate.material.emissive.toArray(), [0.4, 0, 0], "plate emissive");
  close(eye.position.toArray(), [-0.7, 0.45, 0], "eye position");
  close(eye.scale.toArray(), [0.55, 0.4, 1], "eye scale");
});

test("a Studio face exports the RobotData it was loaded with", async () => {
  const loaded = await loadGLTFFromBlobWithBundle(new Blob([studioFace()]));
  const exported = await exportScene(
    buildSceneGraph(loaded.world, loaded.animatables, "root"),
  );
  const output = parseGlbJsonChunk(exported);
  for (const [id, robotData] of Object.entries(ROBOT_DATA)) {
    const node = output.nodes.find(
      (entry) => entry.extensions?.RobotData?.id === id,
    );
    assert.deepEqual(
      node?.extensions.RobotData.features,
      robotData.features,
      `${id}'s features`,
    );
  }
  const plate = output.nodes.find((node) => node.name === "Plate");
  close(plate.translation, [0.25, -0.5, 0], "exported plate translation");

  const reloaded = await loadGLTFFromBlobWithBundle(new Blob([exported]));
  assert.deepEqual(reloaded.animatables, loaded.animatables);
});

test("an element missing a required feature is named, whole and per axis alike", async () => {
  const { width: _width, ...eyeFeatures } = ROBOT_DATA.eye.features;
  const {
    "translation.x": _x,
    "translation.y": _y,
    "translation.z": _z,
    ...plateFeatures
  } = ROBOT_DATA.plate.features;
  await assert.rejects(
    loadGLTFFromBlobWithBundle(
      new Blob([
        studioFace({
          ...ROBOT_DATA,
          eye: { ...ROBOT_DATA.eye, features: eyeFeatures },
        }),
      ]),
    ),
    { message: "An element of type ellipse lacks width in its features" },
  );
  await assert.rejects(
    loadGLTFFromBlobWithBundle(
      new Blob([
        studioFace({
          ...ROBOT_DATA,
          plate: { ...ROBOT_DATA.plate, features: plateFeatures },
        }),
      ]),
    ),
    { message: "An element of type shape lacks translation in its features" },
  );
});
