import test from "node:test";
import assert from "node:assert/strict";
import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  MeshStandardMaterial,
} from "three";
import { importMesh } from "../src/functions/gltf-loading/import-mesh.ts";

function importSingleMesh(mesh, colorLookup = {}) {
  const [world, animatables, shapeId, newColorLookup] = importMesh(
    mesh,
    ["default"],
    colorLookup,
  );
  return { shape: world[shapeId], animatables, newColorLookup };
}

function featureAnimatable(shape, animatables, key) {
  const feature = shape.features[key];
  assert.ok(feature, `expected feature "${key}" on shape`);
  assert.equal(feature.animated, true);
  const animatable = animatables[feature.value];
  assert.ok(animatable, `expected animatable for feature "${key}"`);
  return animatable;
}

test("standard material imports roughness, metalness, and emissive", () => {
  const material = new MeshStandardMaterial({
    color: 0x336699,
    roughness: 0.4,
    metalness: 0.7,
    emissive: 0x102030,
  });
  material.emissiveIntensity = 2.5;
  material.name = "Painted Metal";
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = "Panel";

  const { shape, animatables } = importSingleMesh(mesh);

  assert.equal(shape.material, "standard");

  const roughness = featureAnimatable(shape, animatables, "roughness");
  assert.equal(roughness.type, "number");
  assert.equal(roughness.default, 0.4);
  assert.deepEqual(roughness.constraints, { min: 0, max: 1 });
  assert.equal(roughness.name, "Painted Metal roughness");

  const metalness = featureAnimatable(shape, animatables, "metalness");
  assert.equal(metalness.default, 0.7);

  const emissive = featureAnimatable(shape, animatables, "emissive");
  assert.equal(emissive.type, "rgb");
  assert.equal(emissive.name, "Painted Metal emissive");
  assert.deepEqual(emissive.constraints, { min: [0, 0, 0], max: [1, 1, 1] });
  const expectedEmissive = material.emissive;
  assert.deepEqual(emissive.default, {
    r: expectedEmissive.r,
    g: expectedEmissive.g,
    b: expectedEmissive.b,
  });

  const emissiveIntensity = featureAnimatable(
    shape,
    animatables,
    "emissiveIntensity",
  );
  assert.equal(emissiveIntensity.type, "number");
  assert.equal(emissiveIntensity.default, 2.5);
  assert.deepEqual(emissiveIntensity.constraints, { min: 0 });
  assert.equal(emissiveIntensity.name, "Painted Metal emissive intensity");

  assert.equal(shape.features.shininess, undefined);
  assert.equal(shape.features.specular, undefined);
});

test("black color with emissive is no longer remapped to a basic material", () => {
  const material = new MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xff2200,
  });
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = "Glow";

  const { shape, animatables } = importSingleMesh(mesh);

  assert.equal(shape.material, "standard");

  const color = featureAnimatable(shape, animatables, "color");
  assert.deepEqual(color.default, { r: 0, g: 0, b: 0 });

  const emissive = featureAnimatable(shape, animatables, "emissive");
  const expectedEmissive = material.emissive;
  assert.deepEqual(emissive.default, {
    r: expectedEmissive.r,
    g: expectedEmissive.g,
    b: expectedEmissive.b,
  });
});

test("phong material imports shininess, specular, and emissive", () => {
  const material = new MeshPhongMaterial({
    color: 0x996633,
    shininess: 42,
    specular: 0x445566,
    emissive: 0x001122,
  });
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = "Shiny";

  const { shape, animatables } = importSingleMesh(mesh);

  assert.equal(shape.material, "phong");

  const shininess = featureAnimatable(shape, animatables, "shininess");
  assert.equal(shininess.type, "number");
  assert.equal(shininess.default, 42);
  assert.deepEqual(shininess.constraints, { min: 0 });
  assert.equal(shininess.name, "Shiny shininess");

  const specular = featureAnimatable(shape, animatables, "specular");
  assert.equal(specular.type, "rgb");
  const expectedSpecular = material.specular;
  assert.deepEqual(specular.default, {
    r: expectedSpecular.r,
    g: expectedSpecular.g,
    b: expectedSpecular.b,
  });

  featureAnimatable(shape, animatables, "emissive");

  assert.equal(shape.features.roughness, undefined);
  assert.equal(shape.features.metalness, undefined);
});

test("basic material does not fabricate PBR features", () => {
  const material = new MeshBasicMaterial({ color: 0xffffff });
  const mesh = new Mesh(new BoxGeometry(), material);
  mesh.name = "Flat";

  const { shape, animatables } = importSingleMesh(mesh);

  assert.equal(shape.material, "basic");
  featureAnimatable(shape, animatables, "color");
  featureAnimatable(shape, animatables, "opacity");
  assert.equal(shape.features.roughness, undefined);
  assert.equal(shape.features.metalness, undefined);
  assert.equal(shape.features.emissive, undefined);
  assert.equal(shape.features.emissiveIntensity, undefined);
  assert.equal(shape.features.shininess, undefined);
  assert.equal(shape.features.specular, undefined);
});

test("meshes sharing a named material share all material animatables", () => {
  const material = new MeshStandardMaterial({
    color: 0x336699,
    roughness: 0.25,
    metalness: 0.5,
    emissive: 0x111111,
  });
  material.name = "Shared";

  const meshA = new Mesh(new BoxGeometry(), material);
  meshA.name = "A";
  const meshB = new Mesh(new BoxGeometry(), material);
  meshB.name = "B";

  const first = importSingleMesh(meshA);
  const second = importSingleMesh(meshB, first.newColorLookup);

  const keys = [
    "color",
    "opacity",
    "roughness",
    "metalness",
    "emissive",
    "emissiveIntensity",
  ];
  for (const key of keys) {
    assert.equal(
      second.shape.features[key].value,
      first.shape.features[key].value,
      `expected shared animatable id for "${key}"`,
    );
  }

  // The second import must not re-create the shared animatables.
  for (const key of keys) {
    assert.equal(
      second.animatables[second.shape.features[key].value],
      undefined,
    );
  }
});
