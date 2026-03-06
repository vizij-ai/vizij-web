import { expect, test } from "@playwright/test";
import {
  bootAuthoring,
  ensureProceduralAnimationPanelVisible,
  loadMainPreset,
} from "./helpers";

test("motiongraph panel smoke flow @smoke", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:legacy");
  await ensureProceduralAnimationPanelVisible(page);

  await expect(page.getByTestId("motiongraph-panel")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search inputs..." }).fill("blink");
  const addInputButton = page
    .locator('[data-testid="pap-add-input"]:not([disabled])')
    .first();
  await expect(addInputButton).toBeVisible();
  await addInputButton.click();

  await expect(page.getByTestId("pap-remove-input").first()).toBeVisible();

  const graphNode = page.locator(".react-flow__node").first();
  await expect(graphNode).toBeVisible();
  await graphNode.click({ force: true });

  const inspector = page.getByTestId("motiongraph-node-inspector");
  await expect(inspector).toContainText("Input Source");
  await expect(inspector).not.toContainText("No graph node selected");
});
