import { expect, test } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  loadMainPreset,
  openAdvancedExportOptions,
  openExportDialog,
  readTabCount,
} from "./helpers";

test("pose config export/import roundtrip @workflow", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const posesTab = page.getByTestId("control-authoring-tab-poses");
  const initialCount = await readTabCount(posesTab);

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

  await page
    .getByTestId("import-pose-config-input")
    .setInputFiles(downloadPath);
  await page.getByRole("button", { name: "Close" }).click();

  await expect.poll(() => readTabCount(posesTab)).toBeGreaterThan(initialCount);
});
