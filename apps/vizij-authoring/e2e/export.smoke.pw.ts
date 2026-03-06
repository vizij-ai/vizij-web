import { expect, test } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  loadMainPreset,
  openAdvancedExportOptions,
  openExportDialog,
  readDownloadedText,
} from "./helpers";

test("export dialog smoke flow @smoke", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:legacy");
  await openExportDialog(page);
  await openAdvancedExportOptions(page);

  await expect(page.getByTestId("export-rig-graph-button")).toBeEnabled();

  const download = await expectDownload(page, async () => {
    await page.getByTestId("export-rig-graph-button").click();
  });

  expect(download.suggestedFilename()).toMatch(/\.json$/i);
  const body = await readDownloadedText(download);
  expect(body.trim().length).toBeGreaterThan(0);
});
