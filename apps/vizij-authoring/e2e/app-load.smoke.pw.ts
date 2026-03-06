import { expect, test } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";

test("app boot + main preset load @smoke", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:legacy");

  await expect(page.getByTestId("main-runtime-view")).toBeVisible();
  await expect(
    page.getByTestId("control-authoring-tab-drivers"),
  ).not.toHaveText(/Drivers \(0\)/);
  await expect(page.getByTestId("input-controls-tab-inputs")).not.toHaveText(
    /Inputs \(0\)/,
  );
});
