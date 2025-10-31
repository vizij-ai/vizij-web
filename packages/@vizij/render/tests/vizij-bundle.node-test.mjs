import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { Group } from "three";
import { extractVizijBundle } from "../src/functions/vizij-bundle.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseGlbJson(buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const view = new DataView(arrayBuffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error("Invalid GLB magic header");
  }
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a) {
    throw new Error("Expected JSON chunk as first GLB chunk");
  }
  const jsonBytes = new Uint8Array(arrayBuffer, 20, chunkLength);
  const jsonText = new TextDecoder().decode(jsonBytes);
  return JSON.parse(jsonText);
}

test("extracts VIZIJ bundle metadata from example GLB", () => {
  const glbPath = path.resolve(__dirname, "../public/example.glb");
  const buffer = readFileSync(glbPath);
  const gltfJson = parseGlbJson(buffer);

  const rootGroup = new Group();
  rootGroup.name = "Scene";

  const bundle = extractVizijBundle(rootGroup, gltfJson);
  assert.ok(bundle, "bundle should be present");
  assert.equal(bundle.version, 1, "bundle version should be 1");
  assert.ok((bundle.graphs ?? []).length > 0, "should include rig graphs");
  assert.ok(
    (bundle.poses?.config?.poses ?? []).length > 0,
    "should include pose definitions",
  );
});
