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

test("applyVizijBundle strips stale descendant bundles for the export window", async () => {
  const { applyVizijBundle } = await import("../src/functions/vizij-bundle.ts");
  const root = new Group();
  const carrier = new Group();
  root.add(carrier);
  const staleBundle = { version: 1, graphs: [{ id: "old", kind: "rig" }] };
  carrier.userData.gltfExtensions = {
    VIZIJ_bundle: staleBundle,
    OTHER_ext: { keep: true },
  };
  const freshBundle = {
    version: 1,
    graphs: [{ id: "standard::ros4hri", kind: "standard-profile" }],
  };

  const detach = applyVizijBundle(root, freshBundle);
  // While attached: the root carries the fresh bundle, the descendant's stale
  // copy is gone (it would shadow the fresh one for first-match readers), and
  // its unrelated extensions survive.
  assert.equal(root.userData.gltfExtensions.VIZIJ_bundle, freshBundle);
  assert.equal(carrier.userData.gltfExtensions.VIZIJ_bundle, undefined);
  assert.equal(carrier.userData.gltfExtensions.OTHER_ext.keep, true);

  detach();
  // Detached: the descendant's original extensions are restored intact.
  assert.equal(carrier.userData.gltfExtensions.VIZIJ_bundle, staleBundle);
  assert.equal(root.userData?.gltfExtensions, undefined);
});
