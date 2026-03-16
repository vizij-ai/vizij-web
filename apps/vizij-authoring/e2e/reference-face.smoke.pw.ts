import { expect, test } from "@playwright/test";
import { bootAuthoring, loadMainPreset, loadReferencePreset } from "./helpers";

test("reference face compare, copy, and reset @smoke", async ({ page }) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await loadReferencePreset(page, "quori:basic");

  const posesTab = page.getByTestId("control-authoring-tab-poses");
  await posesTab.click();

  const copyButton = page.getByTestId("variables-poses-copy-reference");
  await expect(copyButton).toBeVisible();
  await expect(copyButton).not.toHaveText(/Copy Ref Pose \(0\)/);
  await copyButton.click();
  await expect(
    page.getByRole("heading", { name: "Pose Copy Mapping" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm Copy" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Blocking unresolved mapping",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByTestId("main-runtime-reset-inputs").click();
  await expect(page.getByTestId("main-runtime-ready-flag")).toBeVisible();
});
