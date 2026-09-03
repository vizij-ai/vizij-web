/**
 * Minimal glTF accessor decoding, sufficient for animation samplers.
 *
 * Written rather than reused from Three.js on purpose: decoding here keeps the
 * whole animation import path free of Three and of any GLTFLoader-specific
 * naming or track-splitting behavior, so it is deterministic and testable in
 * plain Node.
 *
 * Sparse accessors are not supported — animation samplers do not use them in
 * practice, and a silent wrong answer would be worse than an explicit refusal.
 */

const GLB_MAGIC = 0x46546c67;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BIN_CHUNK_TYPE = 0x004e4942;

const COMPONENT_TYPE_BYTES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENT_COUNT: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

export interface GltfAccessorSource {
  json: {
    accessors?: ReadonlyArray<Record<string, unknown>>;
    bufferViews?: ReadonlyArray<Record<string, unknown>>;
    buffers?: ReadonlyArray<Record<string, unknown>>;
  };
  /** The GLB `BIN` chunk, or the buffer referenced by `buffers[0]`. */
  binary: ArrayBuffer | null;
}

export interface GlbChunks {
  json: Record<string, unknown>;
  binary: ArrayBuffer | null;
}

/** Splits a GLB into its JSON and BIN chunks. */
export function readGlbChunks(buffer: ArrayBuffer): GlbChunks {
  if (buffer.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    throw new Error("Not a GLB: file is too short.");
  }
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("Not a GLB: bad magic.");
  }

  let json: Record<string, unknown> | null = null;
  let binary: ArrayBuffer | null = null;
  let offset = GLB_HEADER_BYTES;

  while (offset + GLB_CHUNK_HEADER_BYTES <= buffer.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > buffer.byteLength) {
      break;
    }

    if (chunkType === GLB_JSON_CHUNK_TYPE && !json) {
      const text = new TextDecoder().decode(
        new Uint8Array(buffer, dataStart, chunkLength),
      );
      json = JSON.parse(text) as Record<string, unknown>;
    } else if (chunkType === GLB_BIN_CHUNK_TYPE && !binary) {
      binary = buffer.slice(dataStart, dataEnd);
    }

    // Chunks are 4-byte aligned.
    offset = dataEnd + ((4 - (chunkLength % 4)) % 4);
  }

  if (!json) {
    throw new Error("GLB contains no JSON chunk.");
  }
  return { json, binary };
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads an accessor as a flat `number[]`.
 *
 * Normalized integer accessors are scaled to their float range, matching the
 * glTF spec, so callers always receive real values.
 */
export function readAccessorAsFloats(
  source: GltfAccessorSource,
  accessorIndex: number,
): number[] {
  const accessor = source.json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new Error(`Accessor ${accessorIndex} not found.`);
  }
  if (accessor.sparse) {
    throw new Error(
      `Accessor ${accessorIndex} is sparse, which animation import does not support.`,
    );
  }

  const count = asNumber(accessor.count);
  const componentType = asNumber(accessor.componentType);
  const type = typeof accessor.type === "string" ? accessor.type : "";
  if (count === null || componentType === null || !type) {
    throw new Error(`Accessor ${accessorIndex} is malformed.`);
  }

  const componentCount = TYPE_COMPONENT_COUNT[type];
  const componentBytes = COMPONENT_TYPE_BYTES[componentType];
  if (!componentCount || !componentBytes) {
    throw new Error(
      `Accessor ${accessorIndex} uses unsupported type ${type}/${componentType}.`,
    );
  }

  const total = count * componentCount;
  const bufferViewIndex = asNumber(accessor.bufferView);
  if (bufferViewIndex === null) {
    // Spec: an accessor without a bufferView reads as zeroes.
    return new Array<number>(total).fill(0);
  }

  const bufferView = source.json.bufferViews?.[bufferViewIndex];
  if (!bufferView) {
    throw new Error(`BufferView ${bufferViewIndex} not found.`);
  }
  if (!source.binary) {
    throw new Error(
      "Accessor data requested but no binary chunk is available (external buffers are not supported).",
    );
  }

  const viewOffset = asNumber(bufferView.byteOffset) ?? 0;
  const accessorOffset = asNumber(accessor.byteOffset) ?? 0;
  const declaredStride = asNumber(bufferView.byteStride);
  const elementBytes = componentCount * componentBytes;
  const stride =
    declaredStride && declaredStride > 0 ? declaredStride : elementBytes;

  const base = viewOffset + accessorOffset;
  const lastByte = base + stride * (count - 1) + elementBytes;
  if (lastByte > source.binary.byteLength) {
    throw new Error(
      `Accessor ${accessorIndex} reads past the end of the binary chunk.`,
    );
  }

  const view = new DataView(source.binary);
  const normalized = accessor.normalized === true;
  const out: number[] = new Array<number>(total);

  for (let element = 0; element < count; element += 1) {
    const elementBase = base + element * stride;
    for (let component = 0; component < componentCount; component += 1) {
      const at = elementBase + component * componentBytes;
      let value: number;
      switch (componentType) {
        case 5126:
          value = view.getFloat32(at, true);
          break;
        case 5125:
          value = view.getUint32(at, true);
          break;
        case 5123:
          value = view.getUint16(at, true);
          if (normalized) value /= 65535;
          break;
        case 5122:
          value = view.getInt16(at, true);
          if (normalized) value = Math.max(value / 32767, -1);
          break;
        case 5121:
          value = view.getUint8(at);
          if (normalized) value /= 255;
          break;
        case 5120:
          value = view.getInt8(at);
          if (normalized) value = Math.max(value / 127, -1);
          break;
        default:
          throw new Error(`Unsupported componentType ${componentType}.`);
      }
      out[element * componentCount + component] = value;
    }
  }

  return out;
}
