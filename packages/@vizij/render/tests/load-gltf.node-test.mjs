import test from "node:test";
import assert from "node:assert/strict";
import { Group } from "three";
import { GLTFLoader } from "three-stdlib";
import {
  loadGLTFWithBundle,
  loadGLTFFromBlobWithBundle,
  parseGlbJsonChunk,
} from "../src/functions/load-gltf.ts";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_JSON_PADDING_BYTE = 0x20;

function createGlbBuffer(json) {
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const paddedLength = (encoded.length + 3) & ~3;
  const totalLength = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + paddedLength;
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(GLB_HEADER_BYTES, paddedLength, true);
  view.setUint32(GLB_HEADER_BYTES + 4, GLB_JSON_CHUNK_TYPE, true);

  const jsonStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  bytes.fill(GLB_JSON_PADDING_BYTE, jsonStart, jsonStart + paddedLength);
  bytes.set(encoded, jsonStart);
  return buffer;
}

test("parseGlbJsonChunk returns parser JSON payload for valid GLB bytes", () => {
  const expected = {
    asset: { version: "2.0" },
    extensions: { VIZIJ_bundle: { version: 1, metadata: { source: "test" } } },
  };
  const buffer = createGlbBuffer(expected);
  const parsed = parseGlbJsonChunk(buffer);
  assert.deepEqual(parsed, expected);
});

test("loadGLTFWithBundle falls back to GLB JSON chunk when loader parser JSON is missing", async (t) => {
  const parserJson = {
    asset: { version: "2.0" },
    extensions: {
      VIZIJ_bundle: { version: 1, metadata: { source: "url-fallback" } },
    },
  };
  const buffer = createGlbBuffer(parserJson);

  t.mock.method(GLTFLoader.prototype, "loadAsync", async () => ({
    scene: new Group(),
    animations: [],
  }));

  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    return new Response(buffer, {
      status: 200,
      headers: { "Content-Type": "model/gltf-binary" },
    });
  });

  const asset = await loadGLTFWithBundle(
    "https://example.com/reference-face.glb",
    ["default"],
  );

  assert.equal(fetchMock.mock.calls.length, 1);
  assert.equal(asset.bundle?.metadata?.source, "url-fallback");
});

test("loadGLTFFromBlobWithBundle recovers parser JSON from blob bytes when parser JSON is missing", async (t) => {
  const parserJson = {
    asset: { version: "2.0" },
    extensions: {
      VIZIJ_bundle: { version: 1, metadata: { source: "blob-fallback" } },
    },
  };
  const buffer = createGlbBuffer(parserJson);

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  Object.defineProperty(URL, "createObjectURL", {
    value: undefined,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    value: undefined,
    configurable: true,
    writable: true,
  });

  t.after(() => {
    Object.defineProperty(URL, "createObjectURL", {
      value: originalCreateObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: originalRevokeObjectURL,
      configurable: true,
      writable: true,
    });
  });

  t.mock.method(GLTFLoader.prototype, "parse", (input, _path, onLoad) => {
    assert.ok(input instanceof ArrayBuffer);
    onLoad({
      scene: new Group(),
      animations: [],
    });
  });

  const blob = new Blob([buffer], { type: "model/gltf-binary" });
  const asset = await loadGLTFFromBlobWithBundle(blob, ["default"]);

  assert.equal(asset.bundle?.metadata?.source, "blob-fallback");
});
