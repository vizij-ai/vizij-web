import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  FACE_IMPORT_TIMEOUT_MS,
  loadMainPreset,
  waitForMainFaceReady,
} from "./helpers";
import { FAN, morphedMouthGlb, morphedTriangles } from "./morphFixture";

/**
 * The morph target cleanup runs on import only when Settings → Morph Target
 * Cleanup is set to safe or best overall, for presets and picked
 * files alike. Its notice belongs to the session of the import that
 * produced it: New, which starts a new session, clears it; and the notice
 * can import the picked file again with another cleanup.
 */

test.describe.configure({ timeout: 360_000 });

const PICKED_FACE = fileURLToPath(
  new URL("../public/assets/Quori_Latest_Blender_Export.glb", import.meta.url),
);

async function openMenu(page: Page, menu: string): Promise<void> {
  // The menubar's trigger opens on pointerdown, not on a bare click.
  await page.getByTestId(menu).dispatchEvent("pointerdown", { button: 0 });
}

/**
 * Opens Settings → Morph Target Cleanup. The menu can close itself
 * while the app is still settling after load, so a click that finds it gone
 * reopens it and tries again.
 */
async function openCleanupSubmenu(page: Page): Promise<void> {
  const submenu = page.getByTestId("app-menu-settings-morph-cleanup");
  const firstChoice = page.getByTestId("app-menu-settings-morph-cleanup-off");
  await expect(async () => {
    // Done once the choices show; clicking an open submenu's trigger again
    // never settles.
    if (await firstChoice.isVisible()) {
      return;
    }
    if (!(await submenu.isVisible())) {
      await openMenu(page, "app-menu-settings");
    }
    await submenu.click({ timeout: 5_000 });
    await expect(firstChoice).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function chooseCleanup(
  page: Page,
  cleanup: "off" | "safe" | "overall",
): Promise<void> {
  const choice = page.getByTestId(`app-menu-settings-morph-cleanup-${cleanup}`);
  await openCleanupSubmenu(page);
  await choice.click();
  // A checkbox item may leave the menu open; reopen it only if it closed,
  // since a pointerdown on an open menu's trigger closes it.
  if (!(await choice.isVisible())) {
    await openCleanupSubmenu(page);
  }
  await expect(choice).toHaveAttribute("aria-checked", "true");
  await closeMenus(page);
}

/** Closes any open menu and waits until the Settings menu's items are gone. */
async function closeMenus(page: Page): Promise<void> {
  const submenu = page.getByTestId("app-menu-settings-morph-cleanup");
  for (let i = 0; i < 3 && (await submenu.isVisible()); i += 1) {
    await page.keyboard.press("Escape");
  }
  await expect(submenu).toBeHidden();
}

/**
 * A Blender export opens the scene orientation dialog, which covers the
 * viewer; confirm it as an author would before using the notice.
 */
async function confirmOrientation(page: Page): Promise<void> {
  const orientation = page.getByRole("button", {
    name: "Orientation Looks Correct",
  });
  if (await orientation.isVisible().catch(() => false)) {
    await orientation.click();
  }
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
  await chooseCleanup(page, "safe");
  await loadMainPreset(page);
  await expect(page.getByTestId("morph-triangles-notice")).toBeVisible();

  await openMenu(page, "app-menu-file");
  await page.getByTestId("app-menu-file-new").click();
  await expect(page.getByTestId("morph-triangles-notice")).toHaveCount(0);
});

test("the cleanup reports on a picked file @workflow", async ({ page }) => {
  await bootAuthoring(page);
  await chooseCleanup(page, "safe");
  await page.getByTestId("app-import-file-input").setInputFiles(PICKED_FACE);
  await waitForMainFaceReady(page);
  await expect(page.getByTestId("morph-triangles-notice")).toBeVisible();
});

test("the notice re-imports the picked file with another cleanup @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await chooseCleanup(page, "safe");
  await page.getByTestId("app-import-file-input").setInputFiles(PICKED_FACE);
  await waitForMainFaceReady(page);
  const notice = page.getByTestId("morph-triangles-notice");
  await expect(notice).toBeVisible();
  await confirmOrientation(page);

  await page.getByTestId("morph-triangles-reimport-off").click();
  await expect(
    page.getByTestId("morph-triangles-reimport-confirm"),
  ).toBeVisible();
  await page.getByTestId("morph-triangles-reimport-go").click();
  await expect(notice).toContainText("cleanup was off for this import", {
    timeout: 120_000,
  });
  await waitForMainFaceReady(page);
  await confirmOrientation(page);
  await expect(page.getByTestId("morph-triangles-reimport-safe")).toBeVisible();

  // The re-import's choice becomes the choice for later imports.
  await closeMenus(page);
  await openCleanupSubmenu(page);
  await expect(
    page.getByTestId("app-menu-settings-morph-cleanup-off"),
  ).toHaveAttribute("aria-checked", "true");
});

test("the face loads and saves with the triangles the cleanup chose @workflow", async ({
  page,
}, testInfo) => {
  const picked = testInfo.outputPath("mouth.glb");
  await writeFile(picked, morphedMouthGlb());
  const fan = FAN.map((t) => [...t].sort((a, b) => a - b).join(",")).sort();
  expect(morphedTriangles(await readFile(picked))).toEqual(fan);

  await bootAuthoring(page);
  await chooseCleanup(page, "safe");
  await page.getByTestId("app-import-file-input").setInputFiles(picked);
  await expect(page.getByTestId("morph-triangles-headline")).toContainText(
    "Improved",
  );
  await page
    .getByRole("button", { name: "Orientation Looks Correct" })
    .click({ timeout: 120_000 });
  await waitForMainFaceReady(page);
  await expect(page.getByTestId("morph-triangles-headline")).toContainText(
    "Improved",
  );

  const save = page.getByTestId("app-save-button");
  await expect(save).toBeEnabled({ timeout: FACE_IMPORT_TIMEOUT_MS });
  const download = await expectDownload(page, async () => {
    await save.click();
  });
  const saved = await download.path();
  if (!saved) {
    throw new Error("the saved GLB did not resolve to a local path");
  }
  const triangles = morphedTriangles(await readFile(saved));
  expect(triangles).toHaveLength(fan.length);
  expect(triangles).not.toEqual(fan);
});
