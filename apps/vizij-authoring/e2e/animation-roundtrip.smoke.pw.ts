import { readFile, writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  loadMainPreset,
  waitForMainFaceReady,
} from "./helpers";

/**
 * The round trip, through the real export and the real import.
 *
 * `bakedAnimationProvenance` is thoroughly unit-tested, but both sides of it
 * are hand-built there: the records come from literals, not from an export,
 * and the animations from fixtures, not from a file the exporter wrote. The
 * one thing those tests cannot answer is whether the two fingerprints — the
 * one export computes by reading back the GLB it just wrote, and the one
 * import computes when reading that GLB again — actually agree.
 *
 * If they disagree at all, every re-import of our own export reads as "edited
 * in Blender" and offers a second copy of every clip. That is the
 * two-clips-out-three-back bug the mechanism exists to prevent, arrived at
 * from the other direction, and nothing below the integration can see it.
 */

test.describe.configure({ timeout: 240_000 });

async function readAnimationCount(page: Page): Promise<number> {
  const tab = page.getByRole("tab", { name: /^Animations \(\d+\)$/ });
  const text = (await tab.textContent())?.trim() ?? "";
  const match = text.match(/\((\d+)\)/);
  if (!match) {
    throw new Error(`Could not read an animation count from "${text}"`);
  }
  return Number.parseInt(match[1]!, 10);
}

/**
 * Writes the scene out via the toolbar's Save, which is what an author uses:
 * it runs the same GLB export as the dialog without the modal in the way.
 */
async function saveGlb(page: Page): Promise<string> {
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
  return path;
}

/**
 * Rewrites the first baked animation's interpolation in a GLB's JSON chunk.
 *
 * Stands in for "someone opened this in Blender and changed the motion".
 * Interpolation is part of the fingerprint and lives in the JSON chunk, so it
 * is the one edit that can be made without touching accessor data — and it is
 * a real edit, not a synthetic marker.
 */
function editBakedAnimation(glb: Buffer): Buffer {
  const HEADER = 12;
  const jsonLength = glb.readUInt32LE(HEADER);
  const jsonStart = HEADER + 8;
  const json = JSON.parse(
    glb.subarray(jsonStart, jsonStart + jsonLength).toString("utf8"),
  ) as {
    animations?: Array<{ samplers: Array<{ interpolation?: string }> }>;
  };

  const sampler = json.animations?.[0]?.samplers?.[0];
  if (!sampler) {
    throw new Error("the exported GLB carried no baked animation to edit");
  }
  sampler.interpolation = sampler.interpolation === "STEP" ? "LINEAR" : "STEP";

  // Re-pad the JSON chunk to 4 bytes with spaces, as the spec requires.
  const edited = Buffer.from(JSON.stringify(json), "utf8");
  const padded = Buffer.concat([
    edited,
    Buffer.alloc((4 - (edited.byteLength % 4)) % 4, 0x20),
  ]);
  const rest = glb.subarray(jsonStart + jsonLength);
  const out = Buffer.concat([
    glb.subarray(0, HEADER),
    Buffer.alloc(8),
    padded,
    rest,
  ]);
  out.writeUInt32LE(padded.byteLength, HEADER);
  out.write("JSON", HEADER + 4, "ascii");
  out.writeUInt32LE(out.byteLength, 8);
  return out;
}

test("re-importing our own export loads each clip once @smoke", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();

  const before = await readAnimationCount(page);
  expect(
    before,
    "the preset should carry animations for the round trip to mean anything",
  ).toBeGreaterThan(0);

  const glbPath = await saveGlb(page);
  const bytes = await readFile(glbPath);
  expect(bytes.byteLength).toBeGreaterThan(0);

  // Re-import the file we just wrote. Export deliberately writes each clip
  // twice — losslessly into VIZIJ_bundle, and baked into glTF channels so
  // Blender can see the motion — so this is the moment the same clip is
  // offered from two directions.
  await page.getByTestId("app-import-file-input").setInputFiles(glbPath);
  await waitForMainFaceReady(page);
  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();

  const after = await readAnimationCount(page);
  expect(
    after,
    `re-import changed the clip count from ${before} to ${after}; ` +
      "each bundle clip should come back exactly once, so the baked copies " +
      "were either duplicated (fingerprints disagree) or the bundle was lost",
  ).toBe(before);
});

test("a baked animation edited elsewhere comes back alongside its clip @smoke", async ({
  page,
}, testInfo) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  const before = await readAnimationCount(page);

  const glbPath = await saveGlb(page);
  const edited = editBakedAnimation(await readFile(glbPath));
  const editedPath = testInfo.outputPath("edited.glb");
  await writeFile(editedPath, edited);

  // Baking exists so the motion can be changed outside Vizij. An animation
  // that no longer matches what we wrote is new information, and skipping it
  // as a duplicate would silently discard someone's work — so both are kept
  // and only a person can say which they meant.
  await page.getByTestId("app-import-file-input").setInputFiles(editedPath);
  await waitForMainFaceReady(page);
  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();

  const after = await readAnimationCount(page);
  expect(
    after,
    `an edited baked animation should be kept alongside its authored clip, ` +
      `so the count should have risen from ${before}; it is ${after}. ` +
      "Unchanged means the edit was mistaken for a duplicate and dropped.",
  ).toBeGreaterThan(before);
});
