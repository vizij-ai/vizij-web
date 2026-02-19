import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { Group } from "three";
import {
  extractVizijBundle,
  extractVizijBundleResult,
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

test("prefers current alias over legacy alias deterministically", () => {
  const rootGroup = new Group();
  rootGroup.userData = {
    gltfExtensions: {
      vizij_bundle: { version: 1, metadata: { source: "legacy" } },
      VIZIJ_bundle: { version: 1, metadata: { source: "current" } },
    },
  };

  const result = extractVizijBundleResult(rootGroup);
  assert.equal(
    result.bundle?.metadata?.source,
    "current",
    "current alias should win over legacy alias",
  );
  assert.equal(result.selection?.source.alias, "VIZIJ_bundle");
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "bundle-candidate-ignored" &&
        diagnostic.source.alias === "vizij_bundle",
    ),
    "legacy candidate should be reported as ignored",
  );
});

test("selects first deterministic candidate when multiple entries are present", () => {
  const rootGroup = new Group();
  const parserJson = {
    nodes: [
      {
        extensions: {
          VIZIJ_bundle: [
            { version: 1, metadata: { marker: "first" } },
            { version: 1, metadata: { marker: "second" } },
          ],
        },
      },
    ],
  };

  const result = extractVizijBundleResult(rootGroup, parserJson);
  assert.equal(
    result.bundle?.metadata?.marker,
    "first",
    "first candidate should be selected",
  );
  assert.equal(result.selection?.source.entryIndex, 0);
  assert.ok(
    result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === "bundle-candidate-ignored" &&
        diagnostic.source.entryIndex === 1,
    ),
    "non-selected candidate should be reported",
  );
});

test("reports unsupported variants explicitly", () => {
  const rootGroup = new Group();
  rootGroup.userData = {
    gltfExtensions: {
      VIZIJ_bundle: {
        variant: "vizij_bundle_v2",
      },
    },
  };

  const result = extractVizijBundleResult(rootGroup);
  assert.equal(result.bundle, null, "unsupported variants should not resolve");
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "unsupported-bundle-variant",
    ),
    "unsupported variant diagnostic should be emitted",
  );
  assert.ok(
    result.diagnostics.some(
      (diagnostic) => diagnostic.code === "no-supported-bundle-candidate",
    ),
    "missing supported candidate diagnostic should be emitted",
  );
});
