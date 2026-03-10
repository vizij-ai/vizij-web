import { expect, test, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";

async function clickViaDom(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
}

test("animation and program runtime sessions stay independent across UI changes @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const runtimeChip = page.getByTestId("main-runtime-status-chip");

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await clickViaDom(page, 'button[title="Play animation"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).not.toContainText("Program: Playing");

  await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
  await clickViaDom(page, 'button[title="Play program"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByTestId("main-runtime-stop-animation")).toBeEnabled();
  await expect(page.getByTestId("main-runtime-stop-program")).toBeEnabled();
  await expect(page.getByTestId("motiongraph-panel")).toBeVisible();

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await page
    .getByRole("button", {
      name: /New Animation Clip IMPORTED STOPPED/i,
    })
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByText("Currently running: Nonesense")).toBeVisible();
  await expect(
    page.getByTestId("bottom-panel").getByTitle("Stop"),
  ).toBeDisabled();
  await expect(page.getByTitle("Play animation")).toHaveCount(1);
  await expect(page.getByTitle("Pause animation")).toHaveCount(1);

  await clickViaDom(page, 'button[title="Play animation"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByText("Currently running: Nonesense")).toBeHidden();

  await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
  await clickViaDom(page, 'button[title="Copy program"]');
  await expect(
    page.getByRole("button", {
      name: /New Procedural Program Copy/i,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: /New Procedural Program Copy/i,
    })
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText("Currently running: New Procedural Program"),
  ).toBeVisible();
  await expect(page.getByTitle("Pause program").last()).toBeDisabled();
  await expect(page.getByTitle("Stop program").last()).toBeDisabled();
  await expect(page.getByTitle("Play program")).toHaveCount(2);

  await clickViaDom(page, 'button[title="Play program"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText("Currently running: New Procedural Program"),
  ).toBeHidden();

  await clickViaDom(page, 'button[title="Pause program"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Paused");

  await page.getByTestId("main-runtime-stop-animation").click();
  await expect(runtimeChip).not.toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Paused");

  await page.getByTestId("main-runtime-stop-program").click();
  await expect(runtimeChip).toHaveText("Runtime: Idle");
});
