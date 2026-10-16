// The bounds Fit to Geometry measures: meshes, and ellipse and rectangle
// elements, which carry no mesh.
import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh } from "three";
import { buildSceneGraph } from "../src/functions/build-scene-graph.ts";
import { deriveRootBounds } from "../src/functions/gltf-loading/traverse-three.ts";

const EPSILON = 1e-6;

function assertBounds(actual, expected) {
  assert.ok(actual, "bounds are found");
  for (const axis of ["x", "y"]) {
    assert.ok(
      Math.abs(actual.center[axis] - expected.center[axis]) <= EPSILON,
      `center.${axis}: ${actual.center[axis]} ≠ ${expected.center[axis]}`,
    );
    assert.ok(
      Math.abs(actual.size[axis] - expected.size[axis]) <= EPSILON,
      `size.${axis}: ${actual.size[axis]} ≠ ${expected.size[axis]}`,
    );
  }
}

const still = (value) => ({ animated: false, value });

// An ellipse of radii 0.5 × 0.25 at (-1, 0), turned a quarter about Z, so it
// spans x -1.25…-0.75 and y -0.5…0.5; a 1 × 2 rectangle at (2, 1), spanning
// x 1.5…2.5 and y 0…2.
const WORLD = {
  root: {
    id: "root",
    name: "Root",
    tags: [],
    type: "group",
    root: true,
    features: {
      translation: still({ x: 0, y: 0, z: 0 }),
      rotation: still({ x: 0, y: 0, z: 0 }),
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
      translation: still({ x: -1, y: 0, z: 0 }),
      rotation: still({ x: 0, y: 0, z: Math.PI / 2 }),
      width: still(0.5),
      height: still(0.25),
      fillColor: still({ r: 1, g: 0, b: 1 }),
    },
  },
  mouth: {
    id: "mouth",
    name: "Mouth",
    tags: [],
    type: "rectangle",
    features: {
      translation: still({ x: 2, y: 1, z: 0 }),
      rotation: still({ x: 0, y: 0, z: 0 }),
      width: still(1),
      height: still(2),
      fillColor: still({ r: 0, g: 1, b: 0 }),
    },
  },
};

const EXPECTED = {
  center: { x: (-1.25 + 2.5) / 2, y: (-0.5 + 2) / 2 },
  size: { x: 2.5 + 1.25, y: 2 + 0.5 },
};

test("an ellipse and a rectangle count as their shapes", () => {
  assertBounds(deriveRootBounds(buildSceneGraph(WORLD, {}, "root")), EXPECTED);
});

test("a mesh beside them widens the bounds", () => {
  const scene = new Group();
  scene.add(buildSceneGraph(WORLD, {}, "root"));
  const box = new Mesh(new BoxGeometry(1, 1, 1));
  box.position.set(5, -3, 0);
  scene.add(box);
  assertBounds(deriveRootBounds(scene), {
    center: { x: (-1.25 + 5.5) / 2, y: (-3.5 + 2) / 2 },
    size: { x: 5.5 + 1.25, y: 2 + 3.5 },
  });
});

test("a scene with neither has no bounds", () => {
  assert.equal(deriveRootBounds(new Group()), null);
});
