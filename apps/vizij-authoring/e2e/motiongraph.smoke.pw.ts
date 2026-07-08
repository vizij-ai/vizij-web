import { expect, test } from "@playwright/test";
import {
  bootAuthoring,
  ensureInspectorPanelVisible,
  ensureProceduralAnimationPanelVisible,
  loadMainPreset,
} from "./helpers";

test("motiongraph panel smoke flow @smoke", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await ensureProceduralAnimationPanelVisible(page);
  await ensureInspectorPanelVisible(page);

  await expect(page.getByTestId("motiongraph-panel")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search inputs..." }).fill("blink");
  const addInputButton = page
    .locator('[data-testid="pap-add-input"]:not([disabled])')
    .first();
  await expect(addInputButton).toBeVisible();
  await addInputButton.click();

  await expect(page.getByTestId("pap-remove-input").first()).toBeVisible();

  await expect(page.locator(".react-flow__node").first()).toBeVisible();
});
