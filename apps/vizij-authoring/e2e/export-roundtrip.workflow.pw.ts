import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  loadMainPreset,
  waitForMainFaceReady,
} from "./helpers";

/**
 * An exported face, imported and exported again, is the same face. A face is
 * what its GLB's RobotData declares: each element, keyed by its RobotData id,
 * with its RobotData, its Vizij bundle (which carries its clips, programs and
 * graphs), its node's translation, rotation and scale, its mesh — materials,
 * morph weights, and the bytes of every accessor its primitives read — and
 * the elements under it. The export writes each element as the document
 * authors it, so its transforms and weights are its authored values.
 *
 * Left out of the comparison, each for its reason:
 * - glTF nodes without RobotData, and where they sit: the scene wrappers the
 *   exporter writes around the face are not part of it;
 * - `extras`: three.js `userData` the exporter writes through, to which the
 *   importer adds its own (node names, morph target names);
 * - the glTF animations: the export bakes them from the bundle's clips for
 *   other tools to play, and the clips themselves travel in the bundle;
 * - the bundle's timestamps (`exportedAt`, `previousExportedAt`,
 *   `createdAt`, `updatedAt`, `generatedAt`), its `metadata.source` (the
 *   imported file's name) and the generated id of a graph's IR: they record
 *   the export, not the face.
 */

test.describe.configure({ timeout: 360_000 });

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const EXPORT_RECORD_KEYS = new Set([
  "exportedAt",
  "previousExportedAt",
  "createdAt",
  "updatedAt",
  "generatedAt",
]);

type Gltf = {
  nodes?: Array<{ [key: string]: Json }>;
  meshes?: Array<{ [key: string]: Json }>;
  materials?: Json[];
  accessors?: Array<{ [key: string]: Json }>;
  bufferViews?: Array<{ [key: string]: Json }>;
};

/** Writes the face out with the toolbar's Save, which runs the GLB export. */
async function saveGlb(page: Page): Promise<Buffer> {
  const save = page.getByTestId("app-save-button");
  await expect(save).toBeEnabled();
  const download = await expectDownload(page, async () => {
    await save.click();
  });
  expect(download.suggestedFilename()).toMatch(/\.glb$/i);
  const path = await download.path();
  if (!path) {
    throw new Error("the saved GLB did not resolve to a local path");
  }
  return readFile(path);
}

/** A GLB's JSON chunk and its binary chunk. */
function chunks(glb: Buffer): { json: Gltf; bin: Buffer } {
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength;
  const bin =
    binStart + 8 <= glb.byteLength
      ? glb.subarray(binStart + 8, binStart + 8 + glb.readUInt32LE(binStart))
      : Buffer.alloc(0);
  return { json, bin };
}

/** `value` without `extras`, and in the bundle without the export's record. */
function strip(value: Json, path: string[] = []): Json {
  if (Array.isArray(value)) {
    return value.map((entry) => strip(entry, path));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const out: { [key: string]: Json } = {};
  for (const [key, entry] of Object.entries(value)) {
    const parent = path[path.length - 1];
    const inBundle = path.includes("VIZIJ_bundle");
    if (key === "extras") continue;
    if (inBundle && EXPORT_RECORD_KEYS.has(key)) continue;
    if (
      parent === "metadata" &&
      path[path.length - 2] === "VIZIJ_bundle" &&
      key === "source"
    ) {
      continue;
    }
    if (inBundle && parent === "ir" && key === "id") continue;
    out[key] = strip(entry, [...path, key]);
  }
  return out;
}

/** The face a GLB declares (see the comparison above). */
function face({ json: gltf, bin }: { json: Gltf; bin: Buffer }): Json {
  const nodes = gltf.nodes ?? [];
  const idOf = (index: number): string => {
    const robotData = (nodes[index]?.extensions as { [key: string]: Json })
      ?.RobotData as { id?: string } | undefined;
    return robotData?.id ?? `node without RobotData: ${nodes[index]?.name}`;
  };
  /** An accessor's description and the bytes of its buffer view. */
  const accessorOf = (index: Json): Json => {
    if (typeof index !== "number") return null;
    const { bufferView, ...accessor } = gltf.accessors![index]!;
    if (typeof bufferView !== "number") return accessor;
    const view = gltf.bufferViews![bufferView]!;
    const start = Number(view.byteOffset ?? 0);
    const bytes = bin.subarray(start, start + Number(view.byteLength));
    return {
      ...accessor,
      byteStride: view.byteStride ?? null,
      bytes: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const accessorsOf = (map: Json): Json =>
    Object.fromEntries(
      Object.entries((map ?? {}) as { [key: string]: Json }).map(
        ([attribute, index]) => [attribute, accessorOf(index)],
      ),
    );
  const meshOf = (index: Json): Json => {
    if (typeof index !== "number") return null;
    const mesh = gltf.meshes![index]!;
    const primitives = (mesh.primitives as Array<{ [key: string]: Json }>).map(
      (primitive) => ({
        ...primitive,
        attributes: accessorsOf(primitive.attributes ?? null),
        indices: accessorOf(primitive.indices ?? null),
        targets: ((primitive.targets as Json[] | undefined) ?? []).map(
          accessorsOf,
        ),
        material:
          typeof primitive.material === "number"
            ? gltf.materials![primitive.material]!
            : null,
      }),
    );
    return strip({ ...mesh, primitives });
  };
  const elements: { [id: string]: Json } = {};
  nodes.forEach((node, index) => {
    const extensions = node.extensions as { [key: string]: Json } | undefined;
    if (!extensions?.RobotData) return;
    elements[idOf(index)] = {
      translation: node.translation ?? null,
      rotation: node.rotation ?? null,
      scale: node.scale ?? null,
      extensions: strip(extensions, ["extensions"]),
      mesh: meshOf(node.mesh ?? null),
      children: ((node.children as number[] | undefined) ?? []).map(idOf),
    };
  });
  return elements;
}

test("an exported face, imported and exported again, is the same face @workflow", async ({
  page,
}, testInfo) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const first = await saveGlb(page);
  await page.getByTestId("app-import-file-input").setInputFiles({
    name: "roundtrip.glb",
    mimeType: "model/gltf-binary",
    buffer: first,
  });
  await waitForMainFaceReady(page);
  const second = await saveGlb(page);
  for (const [name, body] of [
    ["first.glb", first],
    ["second.glb", second],
  ] as const) {
    const path = testInfo.outputPath(name);
    await writeFile(path, body);
    await testInfo.attach(name, { path, contentType: "model/gltf-binary" });
  }

  const exported = face(chunks(first)) as {
    [id: string]: { extensions: { [key: string]: Json } };
  };
  expect(
    Object.keys(exported).length,
    "the export declares the face's elements in RobotData",
  ).toBeGreaterThan(10);
  expect(
    Object.values(exported).some(
      (element) => element.extensions.VIZIJ_bundle !== undefined,
    ),
    "the export carries the face's Vizij bundle",
  ).toBe(true);
  expect(face(chunks(second))).toEqual(exported);
});
