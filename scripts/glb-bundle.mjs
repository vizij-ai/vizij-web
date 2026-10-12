/**
 * Read and write a face GLB's `VIZIJ_bundle` in place: the JSON chunk parsed
 * and re-encoded, every other chunk carried verbatim. Shared by the scripts
 * that edit a face's bundle graphs.
 */

const JSON_CHUNK = 0x4e4f534a;
const GLB_MAGIC = 0x46546c67;

/** Split a GLB into its JSON document and its trailing chunks, verbatim. */
export function parseGlb(buf) {
  if (buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error("not a GLB (bad magic)");
  }
  const total = buf.readUInt32LE(8);
  const chunks = [];
  let json = null;
  let offset = 12;
  while (offset < total) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK && json === null) {
      json = JSON.parse(data.toString("utf8"));
      chunks.push({ type, data: null });
    } else {
      chunks.push({ type, data });
    }
    offset += 8 + length;
  }
  if (json === null) {
    throw new Error("the GLB carries no JSON chunk");
  }
  return { json, chunks };
}

/** Re-encode a GLB, the JSON chunk rewritten and every other chunk verbatim. */
export function writeGlb(json, chunks) {
  const encoded = chunks.map((chunk) => {
    const data =
      chunk.data === null
        ? Buffer.from(JSON.stringify(json), "utf8")
        : chunk.data;
    // glTF requires 4-byte-aligned chunks: JSON pads with spaces, binary with
    // zeroes, so a padded chunk stays valid as its own content type.
    const padding = (4 - (data.length % 4)) % 4;
    const pad = Buffer.alloc(padding, chunk.type === JSON_CHUNK ? 0x20 : 0x00);
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length + padding, 0);
    header.writeUInt32LE(chunk.type, 4);
    return Buffer.concat([header, data, pad]);
  });
  const body = Buffer.concat(encoded);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/**
 * The `VIZIJ_bundle` object: on a node's `extensions`, else the document's —
 * the same two places `vizij-bundle` looks, in the same order.
 */
export function findBundle(json) {
  for (const node of json.nodes ?? []) {
    const bundle = node.extensions?.VIZIJ_bundle;
    if (bundle) {
      return bundle;
    }
  }
  const bundle = json.extensions?.VIZIJ_bundle;
  if (bundle) {
    return bundle;
  }
  throw new Error("the GLB carries no VIZIJ_bundle");
}
