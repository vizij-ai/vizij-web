import { closeSync, openSync, readSync } from "node:fs";
import { parseGlbJsonChunk } from "@vizij/render";
import type { GltfJsonLike } from "../gltfAnimationChannels";

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;

/**
 * Reads only a GLB's JSON chunk.
 *
 * The corpus assets are several megabytes each and the binary chunk is
 * irrelevant to channel resolution, so this reads the header, learns the JSON
 * chunk length, and reads just that prefix.
 */
export function readGlbJson(filePath: string): GltfJsonLike {
  const fd = openSync(filePath, "r");
  try {
    const header = Buffer.alloc(GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES);
    readSync(fd, header, 0, header.byteLength, 0);
    const jsonChunkLength = header.readUInt32LE(GLB_HEADER_BYTES);

    const prefixLength =
      GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonChunkLength;
    const prefix = Buffer.alloc(prefixLength);
    readSync(fd, prefix, 0, prefixLength, 0);

    const arrayBuffer = prefix.buffer.slice(
      prefix.byteOffset,
      prefix.byteOffset + prefix.byteLength,
    ) as ArrayBuffer;

    const json = parseGlbJsonChunk(arrayBuffer);
    if (!json || typeof json !== "object") {
      throw new Error(`Unable to parse GLB JSON chunk: ${filePath}`);
    }
    return json as GltfJsonLike;
  } finally {
    closeSync(fd);
  }
}
