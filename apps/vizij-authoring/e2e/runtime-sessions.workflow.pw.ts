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

function targetItem(
  page: Page,
  options: {
    kind: "animation" | "program";
    label: RegExp;
    panelTestId: string;
  },
): Locator {
  return page
    .getByTestId(options.panelTestId)
    .getByTestId(`authoring-${options.kind}-item`)
    .filter({ hasText: options.label })
    .first();
}

async function clickTargetAction(
  item: Locator,
  kind: "animation" | "program",
  action: "copy" | "pause" | "play" | "select" | "stop",
): Promise<void> {
  await clickLocatorViaDom(
    item.getByTestId(`authoring-${kind}-item-${action}`),
  );
}

async function readTargetLabel(
  item: Locator,
  kind: "animation" | "program",
): Promise<string> {
  const label = await item
    .getByTestId(`authoring-${kind}-item-label`)
    .textContent();
  const trimmed = label?.trim();
  if (!trimmed) {
    throw new Error(`Could not read ${kind} target label`);
  }
  return trimmed;
}

async function clickSelectedAnimationPanelPlay(page: Page): Promise<void> {
  await clickLocatorViaDom(
    page
      .getByTestId("animation-panel")
      .locator('button[title="Stop"] + button'),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTrackCount(value: string): number | null {
  const match = value.match(/(\d+)\s+tracks?/i);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

async function sampleInputValues(
  locator: Locator,
  durationMs = 600,
  intervalMs = 25,
): Promise<string[]> {
  return locator.evaluate(
    async (node, options) => {
      const input = node as HTMLInputElement;
      const values = new Set<string>();
      const start = performance.now();
      while (performance.now() - start < options.durationMs) {
        values.add(input.value);
        await new Promise((resolve) =>
          window.setTimeout(resolve, options.intervalMs),
        );
      }
      values.add(input.value);
      return Array.from(values.values());
    },
    { durationMs, intervalMs },
  );
}

test("animation and program runtime sessions stay independent across UI changes @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const runtimeChip = page.getByTestId("main-runtime-status-chip");

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  const primaryAnimation = targetItem(page, {
    kind: "animation",
    label: /Nonesense/i,
    panelTestId: "control-authoring-panel-animations",
  });
  const secondaryAnimation = targetItem(page, {
    kind: "animation",
    label: /Stages/i,
    panelTestId: "control-authoring-panel-animations",
  });
  await expect(primaryAnimation).toBeVisible();
  await expect(secondaryAnimation).toBeVisible();
  await clickTargetAction(primaryAnimation, "animation", "play");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).not.toContainText("Program: Playing");

  await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
  const primaryProgram = targetItem(page, {
    kind: "program",
    label: /Speaks/i,
    panelTestId: "control-authoring-panel-programs",
  });
  await expect(primaryProgram).toBeVisible();
  const primaryProgramLabel = await readTargetLabel(primaryProgram, "program");
  await clickTargetAction(primaryProgram, "program", "play");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByTestId("main-runtime-stop-program")).toBeEnabled();
  await expect(page.getByTestId("motiongraph-panel")).toBeVisible();

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await clickTargetAction(secondaryAnimation, "animation", "select");
  await expect(runtimeChip).not.toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByText("Currently running: Nonesense")).toBeHidden();
  await expect(
    page.getByTestId("bottom-panel").getByTitle("Stop"),
  ).toBeDisabled();
  await expect(
    page
      .getByTestId("control-authoring-panel-animations")
      .getByTestId("authoring-animation-item-play"),
  ).toHaveCount(2);
  await expect(
    page
      .getByTestId("control-authoring-panel-animations")
      .getByTestId("authoring-animation-item-pause"),
  ).toHaveCount(0);

  await clickTargetAction(secondaryAnimation, "animation", "play");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByText("Currently running: Nonesense")).toBeHidden();

  await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
  await clickTargetAction(primaryProgram, "program", "copy");
  const copiedProgramLabel = `${primaryProgramLabel} Copy`;
  const copiedProgram = targetItem(page, {
    kind: "program",
    label: new RegExp(escapeRegex(copiedProgramLabel), "i"),
    panelTestId: "control-authoring-panel-programs",
  });
  await expect(copiedProgram).toBeVisible();
  await clickTargetAction(copiedProgram, "program", "select");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText(`Currently running: ${primaryProgramLabel}`),
  ).toBeVisible();
  await expect(
    copiedProgram.getByTestId("authoring-program-item-play"),
  ).toBeVisible();
  await expect(
    copiedProgram.getByTestId("authoring-program-item-pause"),
  ).toHaveCount(0);
  await expect(
    copiedProgram.getByTestId("authoring-program-item-stop"),
  ).toHaveCount(0);
  await expect(
    page
      .getByTestId("control-authoring-panel-programs")
      .getByTestId("authoring-program-item-play"),
  ).toHaveCount(2);

  await clickTargetAction(copiedProgram, "program", "play");
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText(`Currently running: ${primaryProgramLabel}`),
  ).toBeHidden();

  await clickTargetAction(copiedProgram, "program", "pause");
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
  const primaryAnimation = targetItem(page, {
    kind: "animation",
    label: /Nonesense/i,
    panelTestId: "control-authoring-panel-animations",
  });
  const secondaryAnimation = targetItem(page, {
    kind: "animation",
    label: /Stages/i,
    panelTestId: "control-authoring-panel-animations",
  });

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await expect(primaryAnimation).toBeVisible();
  await expect(secondaryAnimation).toBeVisible();
  const primaryTrackCount = parseTrackCount(await primaryAnimation.innerText());
  expect(primaryTrackCount).not.toBeNull();
  await clickTargetAction(secondaryAnimation, "animation", "select");
  const secondaryName = await selectedNameField.inputValue();
  const secondaryDuration = await durationField.inputValue();

  await clickTargetAction(primaryAnimation, "animation", "select");
  await clickTargetAction(primaryAnimation, "animation", "play");
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

  await clickTargetAction(secondaryAnimation, "animation", "select");
  await expect(runtimeChip).toHaveText("Runtime: Idle");
  await expect(page.getByText(`Currently running: ${activeName}`)).toBeHidden();
  await expect(selectedNameField).toHaveValue(secondaryName);
  await expect(durationField).toHaveValue(secondaryDuration);
  await page.waitForTimeout(300);
  await expect(durationField).toHaveValue(secondaryDuration);
  await clickSelectedAnimationPanelPlay(page);
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(await sampleInputValues(durationField)).toEqual([
    secondaryDuration,
  ]);

  await clickTargetAction(primaryAnimation, "animation", "select");
  await expect(selectedNameField).toHaveValue(activeName);
  await expect(durationField).toHaveValue("12.5");
  await expect(parseTrackCount(await primaryAnimation.innerText())).toBe(
    primaryTrackCount,
  );
});
