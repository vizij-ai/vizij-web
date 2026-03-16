import { readFile } from "node:fs/promises";
import {
  expect,
  type Download,
  type Locator,
  type Page,
} from "@playwright/test";

const MAIN_RUNTIME_READY_TIMEOUT_MS = 120_000;
const REFERENCE_RUNTIME_READY_TIMEOUT_MS = 120_000;

export function sanitizePresetId(presetId: string): string {
  return presetId.replace(/[:/]/g, "-");
}

export async function bootAuthoring(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  await expect(page).toHaveTitle(/Vizij Authoring Tool/i);
  await expect(page.getByTestId("main-viewer")).toBeVisible();
  await expect(page.getByTestId("main-viewer-empty-state")).toBeVisible();
}

export async function loadMainPreset(
  page: Page,
  presetId = "quori:latest",
): Promise<void> {
  await page.getByTestId(`main-preset-${sanitizePresetId(presetId)}`).click();
  await waitForMainFaceReady(page);
}

export async function waitForMainFaceReady(page: Page): Promise<void> {
  await expect(page.getByTestId("main-runtime-view")).toBeVisible({
    timeout: MAIN_RUNTIME_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("main-runtime-ready-flag")).toBeVisible({
    timeout: MAIN_RUNTIME_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("main-runtime-reset-inputs")).toBeVisible({
    timeout: MAIN_RUNTIME_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("main-runtime-status")).toContainText(
    "runtime: ready",
    { timeout: MAIN_RUNTIME_READY_TIMEOUT_MS },
  );
  await expect(page.getByTestId("main-viewer-empty-state")).toBeHidden();
}

export async function selectEditMode(
  page: Page,
  target: "default" | "animation" | "procedural-animation" | "reference-face",
): Promise<void> {
  await page.getByTestId("app-menu-mode").click();
  const targetId =
    target === "procedural-animation"
      ? "app-menu-mode-procedural-animation"
      : target === "reference-face"
        ? "app-menu-mode-reference-face"
        : target === "animation"
          ? "app-menu-mode-animation"
          : "app-menu-mode-default";
  await page.getByTestId(targetId).click();
  await page.keyboard.press("Escape");
}

export async function ensureProceduralAnimationPanelVisible(
  page: Page,
): Promise<void> {
  await selectEditMode(page, "procedural-animation");
  await ensureProgramPanelVisible(page);
}

export async function ensureAnimationPanelVisible(page: Page): Promise<void> {
  const panel = page.getByTestId("animation-panel");
  if (await panel.isVisible().catch(() => false)) {
    return;
  }
  await page.getByTestId("app-menu-view").click();
  const toggle = page.getByTestId("app-menu-view-center-animation");
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
  }
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
}

export async function ensureProgramPanelVisible(page: Page): Promise<void> {
  const panel = page.getByTestId("motiongraph-panel");
  if (await panel.isVisible().catch(() => false)) {
    return;
  }
  await page.getByTestId("app-menu-view").click();
  const toggle = page.getByTestId("app-menu-view-center-program");
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
  }
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
}

export async function ensureInspectorPanelVisible(page: Page): Promise<void> {
  const panel = page.getByTestId("inspector-panel");
  if (await panel.isVisible().catch(() => false)) {
    return;
  }
  await page.getByTestId("app-menu-view").click();
  const toggle = page.getByTestId("app-menu-view-right-inspector");
  if ((await toggle.getAttribute("aria-checked")) !== "true") {
    await toggle.click();
  }
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
}

export async function loadReferencePreset(
  page: Page,
  presetId = "quori:basic",
): Promise<void> {
  await selectEditMode(page, "reference-face");
  await expect(page.getByTestId("reference-face-panel")).toBeVisible();
  await page
    .getByTestId(`reference-face-preset-${sanitizePresetId(presetId)}`)
    .click();
  await waitForReferenceFaceReady(page);
}

export async function waitForReferenceFaceReady(page: Page): Promise<void> {
  await expect(page.getByTestId("reference-face-runtime")).toBeVisible({
    timeout: REFERENCE_RUNTIME_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("reference-face-swap")).toBeVisible({
    timeout: REFERENCE_RUNTIME_READY_TIMEOUT_MS,
  });
  await expect(page.getByTestId("reference-face-unload")).toBeVisible({
    timeout: REFERENCE_RUNTIME_READY_TIMEOUT_MS,
  });
}

export async function openExportDialog(page: Page): Promise<void> {
  await page.getByTestId("app-menu-file").click();
  await page.getByTestId("app-menu-file-export").click();
  await expect(page.getByTestId("export-dialog")).toBeVisible();
}

export async function openAdvancedExportOptions(page: Page): Promise<void> {
  const advancedPanel = page.getByTestId("export-advanced-panel");
  if (await advancedPanel.isVisible().catch(() => false)) {
    return;
  }
  await page.getByTestId("export-advanced-toggle").click();
  await expect(advancedPanel).toBeVisible();
}

export async function expectDownload(
  page: Page,
  trigger: () => Promise<void>,
): Promise<Download> {
  const downloadPromise = page.waitForEvent("download");
  await trigger();
  return downloadPromise;
}

export async function readDownloadedText(download: Download): Promise<string> {
  const path = await download.path();
  if (!path) {
    throw new Error(
      "Expected Playwright download to resolve to a local file path",
    );
  }
  return readFile(path, "utf8");
}

export async function readTabCount(locator: Locator): Promise<number> {
  const text = (await locator.textContent())?.trim() ?? "";
  const match = text.match(/\((\d+)\)$/);
  if (!match) {
    throw new Error(`Could not read tab count from "${text}"`);
  }
  return Number(match[1]);
}
