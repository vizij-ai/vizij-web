import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset, waitForMainFaceReady } from "./helpers";

/**
 * The morph target cleanup runs on import only when File → Clean Up Morph
 * Targets on Import is ticked, for presets and picked files alike, and its
 * notice belongs to the session of the import that produced it: New, which
 * starts a new session, clears it.
 */

test.describe.configure({ timeout: 360_000 });

const PICKED_FACE = fileURLToPath(
  new URL("../public/assets/Quori_Latest_Blender_Export.glb", import.meta.url),
);

async function openFileMenu(page: Page): Promise<void> {
  // The menubar's trigger opens on pointerdown, not on a bare click.
  await page
    .getByTestId("app-menu-file")
    .dispatchEvent("pointerdown", { button: 0 });
}

async function turnCleanupOn(page: Page): Promise<void> {
  await openFileMenu(page);
  const option = page.getByTestId("app-menu-file-optimize-morph-triangles");
  await expect(option).toHaveAttribute("aria-checked", "false");
  await option.click();
  await openFileMenu(page);
  await expect(option).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
}

test("an import with the cleanup off shows no cleanup notice @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page);
  await expect(page.getByTestId("morph-triangles-notice")).toHaveCount(0);
});

test("the cleanup reports on a preset import, and New clears it @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await turnCleanupOn(page);
  await loadMainPreset(page);
  await expect(page.getByTestId("morph-triangles-notice")).toBeVisible();

  await openFileMenu(page);
  await page.getByTestId("app-menu-file-new").click();
  await expect(page.getByTestId("morph-triangles-notice")).toHaveCount(0);
});

test("the cleanup reports on a picked file @workflow", async ({ page }) => {
  await bootAuthoring(page);
  await turnCleanupOn(page);
  await page.getByTestId("app-import-file-input").setInputFiles(PICKED_FACE);
  await waitForMainFaceReady(page);
  await expect(page.getByTestId("morph-triangles-notice")).toBeVisible();
});
