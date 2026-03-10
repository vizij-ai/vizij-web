import { expect, test, type Locator, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";

async function clickViaDom(page: Page, selector: string): Promise<void> {
  await page
    .locator(selector)
    .first()
    .evaluate((node) => {
      (node as HTMLButtonElement).click();
    });
}

async function clickLocatorViaDom(locator: Locator): Promise<void> {
  await locator.first().evaluate((node) => {
    (node as HTMLButtonElement).click();
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  await expect(runtimeChip).not.toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByText("Currently running: Nonesense")).toBeHidden();
  await expect(
    page.getByTestId("bottom-panel").getByTitle("Stop"),
  ).toBeDisabled();
  await expect(page.getByTitle("Play animation")).toHaveCount(2);
  await expect(page.getByTitle("Pause animation")).toHaveCount(0);

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

test("switching animation targets stops the active runtime before loading the next clip @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const runtimeChip = page.getByTestId("main-runtime-status-chip");
  const inspectorPanel = page.getByTestId("inspector-panel");
  const selectedNameField = inspectorPanel.locator("input").first();
  const durationField = inspectorPanel.getByRole("textbox", {
    name: "Duration",
  });

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await clickLocatorViaDom(
    page.getByRole("button", {
      name: /New Animation Clip IMPORTED STOPPED/i,
    }),
  );
  const secondaryName = await selectedNameField.inputValue();
  const secondaryDuration = await durationField.inputValue();

  await clickLocatorViaDom(
    page.getByRole("button", {
      name: /Nonesense IMPORTED STOPPED/i,
    }),
  );
  await clickViaDom(page, 'button[title="Play animation"]');
  await expect(runtimeChip).toContainText("Animation: Playing");

  const activeName = await selectedNameField.inputValue();

  await durationField.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("12.5");
  await durationField.blur();
  await clickViaDom(page, 'button[title="Pause animation"]');
  await expect(runtimeChip).toContainText("Animation: Paused");

  await expect(
    page.getByRole("button", {
      name: /Nonesense IMPORTED PAUSED/i,
    }),
  ).toBeVisible();

  await clickLocatorViaDom(
    page.getByRole("button", {
      name: new RegExp(`${escapeRegex(secondaryName)} IMPORTED STOPPED`, "i"),
    }),
  );
  await expect(runtimeChip).toHaveText("Runtime: Idle");
  await expect(page.getByText(`Currently running: ${activeName}`)).toBeHidden();
  await expect(selectedNameField).toHaveValue(secondaryName);
  await expect(durationField).toHaveValue(secondaryDuration);
  await page.waitForTimeout(300);
  await expect(durationField).toHaveValue(secondaryDuration);

  await clickLocatorViaDom(
    page.getByRole("button", {
      name: /Nonesense IMPORTED STOPPED/i,
    }),
  );
  await expect(selectedNameField).toHaveValue(activeName);
  await expect(durationField).toHaveValue("12.5");
});
