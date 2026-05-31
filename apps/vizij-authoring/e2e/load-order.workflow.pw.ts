import { expect, test } from "@playwright/test";
import { bootAuthoring } from "./helpers";

test("latest preset selection wins when an older preset response arrives late @workflow", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.route("**/Quori_Current_Extended.glb", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.continue();
  });

  await bootAuthoring(page);

  await page.getByTestId("main-preset-quori-latest").click();
  await page.waitForTimeout(50);
  await page.getByTestId("main-preset-quori-basic").click();

  await expect(page.getByTestId("main-runtime-ready-flag")).toBeVisible({
    timeout: 120_000,
  });
  await page.waitForTimeout(12_000);

  await expect(
    page.getByTestId("control-authoring-tab-animations"),
  ).toHaveAccessibleName("Animations (0)");
  await expect(
    page.getByTestId("control-authoring-tab-programs"),
  ).toHaveAccessibleName("Programs (1)");
  await expect(page.locator("body")).not.toContainText("Nonesense");
  await expect(page.locator("body")).not.toContainText("Speaks");
  await expect(page.locator("body")).not.toContainText("Live");
  await page.getByTestId("control-authoring-tab-programs").click();
  const programItems = page
    .getByTestId("control-authoring-panel-programs")
    .getByTestId("authoring-program-item");
  await expect(programItems).toHaveCount(1);
  await expect(
    programItems.first().getByTestId("authoring-program-item-label"),
  ).toContainText("motiongraph");
});
