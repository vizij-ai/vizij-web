import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { Group } from "three";
import {
  applyVizijBundle,
  extractVizijBundle,
} from "../src/functions/vizij-bundle.ts";

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

test("prefers root-level parser extension over node and scene extensions", () => {
  const rootGroup = new Group();
  const parserJson = {
    extensions: {
      VIZIJ_bundle: { version: 1, metadata: { source: "root" } },
    },
    nodes: [
      {
        extensions: {
          VIZIJ_bundle: { version: 1, metadata: { source: "node" } },
        },
      },
    ],
    scenes: [
      {
        extensions: {
          VIZIJ_bundle: { version: 1, metadata: { source: "scene" } },
        },
      },
    ],
  };

  const bundle = extractVizijBundle(rootGroup, parserJson);
  assert.ok(bundle, "bundle should be found");
  assert.equal(bundle.metadata?.source, "root");
});

test("applyVizijBundle replaces stale subtree bundles while attached", () => {
  const rootGroup = new Group();
  rootGroup.name = "Root";
  rootGroup.userData.gltfExtensions = {
    VIZIJ_bundle: { version: 1, metadata: { source: "old-root" } },
    OTHER_extension: { enabled: true },
  };

  const childGroup = new Group();
  childGroup.name = "Child";
  childGroup.userData.gltfExtensions = {
    VIZIJ_bundle: { version: 1, metadata: { source: "old-child" } },
  };
  rootGroup.add(childGroup);

  const restore = applyVizijBundle(rootGroup, {
    version: 1,
    metadata: { source: "new-root" },
  });

  const appliedBundle = extractVizijBundle(rootGroup);
  assert.ok(appliedBundle, "bundle should be found while applied");
  assert.equal(appliedBundle.metadata?.source, "new-root");
  assert.equal(rootGroup.userData.gltfExtensions.OTHER_extension.enabled, true);
  assert.equal(childGroup.userData.gltfExtensions, undefined);

  restore();

  const restoredBundle = extractVizijBundle(rootGroup);
  assert.ok(restoredBundle, "bundle should be restored");
  assert.equal(restoredBundle.metadata?.source, "old-root");
  assert.equal(
    childGroup.userData.gltfExtensions.VIZIJ_bundle.metadata.source,
    "old-child",
  );
});
