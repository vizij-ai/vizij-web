import { readFile, writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  loadMainPreset,
  openAdvancedExportOptions,
  openExportDialog,
  readTabCount,
} from "./helpers";

/**
 * A pose config exported and imported again replaces the face's poses: the
 * import of the exported file, less its last pose, leaves the face one pose
 * short.
 */
test("pose config export/import roundtrip @workflow", async ({
  page,
}, testInfo) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const posesTab = page.getByTestId("control-authoring-tab-poses");
  const initialCount = await readTabCount(posesTab);
  expect(initialCount, "the face loads with its poses").toBeGreaterThan(1);

  await openExportDialog(page);
  await openAdvancedExportOptions(page);

  const download = await expectDownload(page, async () => {
    await page.getByTestId("export-pose-config-button").click();
  });

  expect(download.suggestedFilename()).toMatch(/pose_config\.json$/i);
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Expected exported pose config to be saved locally");
  }
  const config = JSON.parse(await readFile(downloadPath, "utf8")) as {
    poses: unknown[];
  };
  expect(config.poses).toHaveLength(initialCount);
  config.poses.pop();
  const editedPath = testInfo.outputPath("pose_config.json");
  await writeFile(editedPath, JSON.stringify(config));

  await page.getByTestId("import-pose-config-input").setInputFiles(editedPath);
  await page.getByRole("button", { name: "Close" }).click();

  await expect.poll(() => readTabCount(posesTab)).toBe(initialCount - 1);
});
