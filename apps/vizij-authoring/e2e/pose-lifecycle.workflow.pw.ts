import { expect, test } from "@playwright/test";
import { bootAuthoring, loadMainPreset, readTabCount } from "./helpers";

test("pose authoring lifecycle @workflow", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const posesTab = page.getByTestId("control-authoring-tab-poses");
  await posesTab.click();
  const initialCount = await readTabCount(posesTab);

  await page.getByTestId("variables-poses-capture-current").click();
  await expect.poll(() => readTabCount(posesTab)).toBe(initialCount + 1);

  const duplicateButton = page.getByTestId(
    "variables-poses-duplicate-selected",
  );
  await expect(duplicateButton).toBeEnabled();
  await duplicateButton.click();
  await expect.poll(() => readTabCount(posesTab)).toBe(initialCount + 2);
});
