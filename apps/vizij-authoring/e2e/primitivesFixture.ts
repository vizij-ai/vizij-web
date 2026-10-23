/**
 * A face made of RobotData primitives only: an ellipse and a rectangle under
 * one root group, as a GLB with a JSON chunk and no binary data.
 *
 * No shipped face carries either kind, so the picking spec builds this one.
 * Each is a node with no mesh, its width and height as its scale on X and Y
 * (as `buildSceneGraph` exports one); the renderer draws it from its
 * RobotData (`width`, `height`, `fillColor`, `fillOpacity`). The fill colours are
 * saturated and far apart — magenta and green — so a spec finds each shape
 * on screen by its hue, whatever the renderer's shading does to the exact
 * value.
 */

/** Element ids are UUIDs, as the Vizij format requires of RobotData. */
export const PRIMITIVES = {
  ellipse: { id: "3f6c1b52-8d4e-4a7b-9c21-5e0d7a9b1c01", name: "GateEllipse" },
  rectangle: {
    id: "3f6c1b52-8d4e-4a7b-9c21-5e0d7a9b1c02",
    name: "GateRectangle",
  },
} as const;

/**
 * World units. The face's `rootBounds` are 400 × 300. Each shape
 * is 90 × 80, its centre 100 to the left or right of the face's: apart
 * whether a renderer reads `width` and `height` as the shape's extent or as
 * its radii, and inside the bounds either way.
 */
const WIDTH = 90;
const HEIGHT = 80;
const OFFSET = 100;

function staticFeature(value: unknown) {
  return { animated: false, value };
}

export function primitivesGlb(): Buffer {
  const root = {
    id: "3f6c1b52-8d4e-4a7b-9c21-5e0d7a9b1c00",
    name: "GateRoot",
    tags: [],
    type: "group",
    root: true,
    features: {
      translation: staticFeature({ x: 0, y: 0, z: 0 }),
      rotation: staticFeature({ x: 0, y: 0, z: 0 }),
      scale: staticFeature({ x: 1, y: 1, z: 1 }),
    },
    rootBounds: { center: { x: 0, y: 0 }, size: { x: 400, y: 300 } },
    children: [PRIMITIVES.ellipse.id, PRIMITIVES.rectangle.id],
  };
  const shape = (
    entry: { id: string; name: string },
    type: "ellipse" | "rectangle",
    x: number,
    fillColor: { r: number; g: number; b: number },
  ) => ({
    id: entry.id,
    name: entry.name,
    tags: [],
    type,
    features: {
      translation: staticFeature({ x, y: 0, z: 1 }),
      rotation: staticFeature({ x: 0, y: 0, z: 0 }),
      width: staticFeature(WIDTH),
      height: staticFeature(HEIGHT),
      fillColor: staticFeature(fillColor),
      fillOpacity: staticFeature(1),
    },
  });
  const ellipse = shape(PRIMITIVES.ellipse, "ellipse", -OFFSET, {
    r: 1,
    g: 0,
    b: 1,
  });
  const rectangle = shape(PRIMITIVES.rectangle, "rectangle", OFFSET, {
    r: 0,
    g: 1,
    b: 0,
  });
  const node = (robotData: { name: string }, extra: object = {}) => ({
    name: robotData.name,
    extensions: { RobotData: robotData },
    ...extra,
  });
  const gltf = {
    asset: { version: "2.0", generator: "vizij-authoring e2e" },
    extensionsUsed: ["RobotData"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      node(root, { children: [1, 2] }),
      node(ellipse, {
        translation: [-OFFSET, 0, 1],
        scale: [WIDTH, HEIGHT, 1],
      }),
      node(rectangle, {
        translation: [OFFSET, 0, 1],
        scale: [WIDTH, HEIGHT, 1],
      }),
    ],
  };
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.byteLength % 4)) % 4, 0x20),
  ]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + padded.byteLength, 8);
  const chunk = Buffer.alloc(8);
  chunk.writeUInt32LE(padded.byteLength, 0);
  chunk.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunk, padded]);
}
