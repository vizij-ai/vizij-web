import test from "node:test";
import assert from "node:assert/strict";
import {
  patchGlbJson,
  patchVizijBundleMetadata,
} from "../src/functions/export.ts";

/**
 * Amending a finished GLB replaced a second full `GLTFExporter` pass, which
 * froze the UI thread for seconds on real assets. That is only a good trade if
 * the rewrite is exact: the JSON chunk must stay 4-byte aligned and every
 * later chunk must survive untouched, or the file is corrupt.
 */

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BIN_CHUNK_TYPE = 0x004e4942;

function buildGlb(json, binary = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])) {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonLength = jsonBytes.length + jsonPad;
  const binPad = (4 - (binary.length % 4)) % 4;
  const binLength = binary.length + binPad;

  const total = 12 + 8 + jsonLength + 8 + binLength;
  const out = new ArrayBuffer(total);
  const bytes = new Uint8Array(out);
  const view = new DataView(out);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, GLB_JSON_CHUNK_TYPE, true);
  bytes.set(jsonBytes, 20);
  for (let i = 0; i < jsonPad; i += 1) {
    bytes[20 + jsonBytes.length + i] = 0x20;
  }
  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, GLB_BIN_CHUNK_TYPE, true);
  bytes.set(binary, binHeader + 8);
  return out;
}

function readChunks(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(
    new TextDecoder().decode(bytes.slice(20, 20 + jsonLength)).trim(),
  );
  const binHeader = 20 + jsonLength;
  const binLength = view.getUint32(binHeader, true);
  return {
    json,
    jsonLength,
    declaredTotal: view.getUint32(8, true),
    actualTotal: buffer.byteLength,
    binary: bytes.slice(binHeader + 8, binHeader + 8 + binLength),
  };
}

test("patchGlbJson keeps the file valid and the binary chunk intact", () => {
  const original = buildGlb({
    asset: { version: "2.0" },
    nodes: [{ name: "A" }],
  });
  const patched = patchGlbJson(original, (json) => {
    json.extras = { hello: "world" };
    return true;
  });

  const chunks = readChunks(patched);
  assert.equal(chunks.json.extras.hello, "world");
  assert.equal(chunks.json.nodes[0].name, "A");
  // Header length must match reality, and the JSON chunk must stay aligned.
  assert.equal(chunks.declaredTotal, chunks.actualTotal);
  assert.equal(chunks.jsonLength % 4, 0);
  assert.deepEqual([...chunks.binary], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("patchGlbJson returns the original buffer when nothing changed", () => {
  const original = buildGlb({ asset: { version: "2.0" } });
  assert.equal(
    patchGlbJson(original, () => false),
    original,
  );
});

test("patchGlbJson leaves a non-GLB buffer alone rather than corrupting it", () => {
  const notGlb = new ArrayBuffer(32);
  assert.equal(
    patchGlbJson(notGlb, () => true),
    notGlb,
  );
  const empty = new ArrayBuffer(0);
  assert.equal(
    patchGlbJson(empty, () => true),
    empty,
  );
});

test("patchVizijBundleMetadata merges into a node-level bundle", () => {
  // Where the exporter actually puts it: `applyVizijBundle` writes the bundle
  // to the export root's userData, which lands as a node extension.
  const original = buildGlb({
    asset: { version: "2.0" },
    nodes: [
      { name: "Root", extensions: { VIZIJ_bundle: { metadata: { keep: 1 } } } },
    ],
  });

  const patched = patchVizijBundleMetadata(original, {
    bakedAnimations: [{ animationIndex: 0, clipId: "clip.1" }],
  });

  const bundle = readChunks(patched).json.nodes[0].extensions.VIZIJ_bundle;
  assert.equal(bundle.metadata.keep, 1, "existing metadata must survive");
  assert.equal(bundle.metadata.bakedAnimations[0].clipId, "clip.1");
});

test("patchVizijBundleMetadata merges into a root-level bundle", () => {
  const original = buildGlb({
    asset: { version: "2.0" },
    extensions: { VIZIJ_bundle: {} },
  });
  const patched = patchVizijBundleMetadata(original, { bakedAnimations: [] });
  assert.deepEqual(
    readChunks(patched).json.extensions.VIZIJ_bundle.metadata.bakedAnimations,
    [],
  );
});

test("patchVizijBundleMetadata is a no-op when no bundle is present", () => {
  const original = buildGlb({ asset: { version: "2.0" }, nodes: [] });
  assert.equal(patchVizijBundleMetadata(original, { a: 1 }), original);
});
