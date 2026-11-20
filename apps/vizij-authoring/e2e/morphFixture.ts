/**
 * A face with one morphed part the morph target cleanup rewrites: a mouth
 * modelled as a single polygon, triangulated as a fan from one corner, whose
 * `smile` target bends it into a crescent the fan cannot follow.
 *
 * The outline has `2 × LIP` vertices, the upper lip then the lower, resting
 * almost closed. No shipped face is guaranteed to need the cleanup, so the
 * cleanup spec builds this one in code.
 */

const LIP = 12;

function band(bend: number, halfWidth: number): Array<[number, number]> {
  const xs = Array.from({ length: LIP }, (_, i) => -1 + (2 * i) / (LIP - 1));
  const centre = (x: number) => bend * (x * x - 1);
  const upper = xs.map((x): [number, number] => [x, centre(x) + halfWidth]);
  const lower = [...xs]
    .reverse()
    .map((x): [number, number] => [x, centre(x) - halfWidth]);
  // Counter-clockwise seen from +z.
  return [...upper, ...lower].reverse();
}

/** The fan from vertex 0 the fixture is exported with. */
export const FAN: Array<[number, number, number]> = Array.from(
  { length: 2 * LIP - 2 },
  (_, i) => [0, i + 1, i + 2],
);

export function morphedMouthGlb(): Buffer {
  const rest = band(0, 0.02);
  const smile = band(0.6, 0.08);
  const count = rest.length;
  const positions = new Float32Array(rest.flatMap(([x, y]) => [x, y, 0]));
  const deltas = new Float32Array(
    smile.flatMap(([x, y], i) => [x - rest[i][0], y - rest[i][1], 0]),
  );
  const normals = new Float32Array(rest.flatMap(() => [0, 0, 1]));
  const indices = new Uint16Array(FAN.flat());
  const pad = (n: number) => Math.ceil(n / 4) * 4;
  const normalOffset = positions.byteLength;
  const indexOffset = normalOffset + normals.byteLength;
  const deltaOffset = indexOffset + pad(indices.byteLength);
  const bin = Buffer.alloc(deltaOffset + deltas.byteLength);
  Buffer.from(positions.buffer).copy(bin, 0);
  Buffer.from(normals.buffer).copy(bin, normalOffset);
  Buffer.from(indices.buffer).copy(bin, indexOffset);
  Buffer.from(deltas.buffer).copy(bin, deltaOffset);

  const min = (k: number, values: Float32Array) =>
    Math.min(...Array.from(values).filter((_, i) => i % 3 === k));
  const max = (k: number, values: Float32Array) =>
    Math.max(...Array.from(values).filter((_, i) => i % 3 === k));
  const bounds = (values: Float32Array) => ({
    min: [0, 1, 2].map((k) => min(k, values)),
    max: [0, 1, 2].map((k) => max(k, values)),
  });
  const document = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: "mouth", mesh: 0 }],
    meshes: [
      {
        name: "mouth",
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 3 },
            indices: 1,
            targets: [{ POSITION: 2 }],
            material: 0,
          },
        ],
        weights: [0],
        extras: { targetNames: ["smile"] },
      },
    ],
    materials: [
      {
        name: "mouth",
        pbrMetallicRoughness: { baseColorFactor: [0.9, 0.1, 0.2, 1] },
        doubleSided: true,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count,
        type: "VEC3",
        ...bounds(positions),
      },
      {
        bufferView: 1,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
      {
        bufferView: 2,
        componentType: 5126,
        count,
        type: "VEC3",
        ...bounds(deltas),
      },
      { bufferView: 3, componentType: 5126, count, type: "VEC3" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength },
      { buffer: 0, byteOffset: deltaOffset, byteLength: deltas.byteLength },
      { buffer: 0, byteOffset: normalOffset, byteLength: normals.byteLength },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  return glb(document, bin);
}

function glb(document: object, bin: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(document));
  const jsonChunk = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 0x20),
  ]);
  const binChunk = Buffer.concat([
    bin,
    Buffer.alloc((4 - (bin.length % 4)) % 4, 0),
  ]);
  const header = Buffer.alloc(12);
  header.write("glTF", 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunk = (data: Buffer, kind: string) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.write(kind, 4);
    return Buffer.concat([head, data]);
  };
  return Buffer.concat([
    header,
    chunk(jsonChunk, "JSON"),
    chunk(binChunk, "BIN\0"),
  ]);
}

/**
 * The triangles of the first mesh with morph targets in a GLB, each sorted
 * so two files can be compared whatever order their vertices are wound in.
 */
export function morphedTriangles(file: Buffer): string[] {
  const jsonLength = file.readUInt32LE(12);
  const document = JSON.parse(
    file.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as {
    meshes: Array<{
      primitives: Array<{ indices?: number; targets?: unknown[] }>;
    }>;
    accessors: Array<{
      bufferView: number;
      byteOffset?: number;
      count: number;
      componentType: number;
    }>;
    bufferViews: Array<{ byteOffset?: number }>;
  };
  const binStart = 20 + jsonLength + 8;
  const primitive = document.meshes
    .flatMap((mesh) => mesh.primitives)
    .find((p) => (p.targets?.length ?? 0) > 0 && p.indices !== undefined);
  if (!primitive || primitive.indices === undefined) {
    throw new Error("no indexed morphed primitive in the GLB");
  }
  const accessor = document.accessors[primitive.indices];
  const view = document.bufferViews[accessor.bufferView];
  const size = accessor.componentType === 5125 ? 4 : 2;
  const start = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = (i: number) =>
    size === 4
      ? file.readUInt32LE(start + i * size)
      : file.readUInt16LE(start + i * size);
  const triangles: string[] = [];
  for (let t = 0; t < accessor.count / 3; t += 1) {
    triangles.push(
      [read(3 * t), read(3 * t + 1), read(3 * t + 2)]
        .sort((a, b) => a - b)
        .join(","),
    );
  }
  return triangles.sort();
}
