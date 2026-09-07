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

async function clickSelectedAnimationPanelPlay(page: Page): Promise<void> {
  // By title, not by position. This used to be `button[title="Stop"] + button`,
  // which stopped being Play once the transport row became
  // Stop / Step back / Play / Step forward: the click landed on "Step back one
  // frame", nothing played, and the runtime chip stayed "Runtime: Idle".
  await clickLocatorViaDom(
    page.getByTestId("animation-panel").locator('button[title="Play"]'),
  );
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The labels of an authoring target list's rows, in order.
 *
 * These tests used to hard-code the clip and program names embedded in
 * `Quori_Current_Extended.glb` ("New Animation Clip", "New Procedural
 * Program"). The asset has since been re-exported with different ones
 * ("Nonesense"/"Stages", "Speaks"/"Live"), so the names are read off the panel
 * instead of being spelled out — the test is about session independence, not
 * about what the fixture happens to be called.
 */
async function targetRowLabels(panel: Locator): Promise<string[]> {
  // A row renders as `<label>\n<source badge>\n<state badge>\n…`, so the
  // rendered first line is the label.
  return panel
    .locator('[role="button"]')
    .evaluateAll((nodes) =>
      nodes.map((node) =>
        ((node as HTMLElement).innerText ?? "").split("\n")[0]!.trim(),
      ),
    );
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
  const animationsPanel = page.getByTestId(
    "control-authoring-panel-animations",
  );
  const programsPanel = page.getByTestId("control-authoring-panel-programs");

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  const clipNames = await targetRowLabels(animationsPanel);
  expect(clipNames.length).toBeGreaterThanOrEqual(2);
  const [playingClip, otherClip] = clipNames as [string, string];

  await clickViaDom(page, 'button[title="Play animation"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).not.toContainText("Program: Playing");

  await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
  const programNames = await targetRowLabels(programsPanel);
  expect(programNames.length).toBeGreaterThanOrEqual(1);
  const playingProgram = programNames[0]!;

  await clickViaDom(page, 'button[title="Play program"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(page.getByTestId("main-runtime-stop-animation")).toBeEnabled();
  await expect(page.getByTestId("main-runtime-stop-program")).toBeEnabled();
  await expect(page.getByTestId("motiongraph-panel")).toBeVisible();

  await page.getByRole("tab", { name: /^Animations \(\d+\)$/ }).click();
  await clickLocatorViaDom(
    page.getByRole("button", {
      name: new RegExp(`${escapeRegex(otherClip)} IMPORTED STOPPED`, "i"),
    }),
  );
  await expect(runtimeChip).not.toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText(`Currently running: ${playingClip}`),
  ).toBeHidden();
  await expect(
    page.getByTestId("bottom-panel").getByTitle("Stop"),
  ).toBeDisabled();
  // Every clip row offers Play again, and none offers Pause.
  await expect(animationsPanel.getByTitle("Play animation")).toHaveCount(
    clipNames.length,
  );
  await expect(animationsPanel.getByTitle("Pause animation")).toHaveCount(0);

  await clickViaDom(page, 'button[title="Play animation"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText(`Currently running: ${playingClip}`),
  ).toBeHidden();

  await page.getByRole("tab", { name: /^Programs \(\d+\)$/ }).click();
  await clickViaDom(page, 'button[title="Copy program"]');
  const programCopy = `${playingProgram} Copy`;
  const programCopyRow = page.getByRole("button", {
    name: new RegExp(`${escapeRegex(programCopy)} AUTHORED STOPPED`, "i"),
  });
  await expect(programCopyRow).toBeVisible();
  await clickLocatorViaDom(programCopyRow);
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText(`Currently running: ${playingProgram}`),
  ).toBeVisible();
  await expect(page.getByTitle("Pause program").last()).toBeDisabled();
  await expect(page.getByTitle("Stop program").last()).toBeDisabled();
  // One of the (now `programNames.length + 1`) rows is playing, so every other
  // one — the fresh copy included — offers Play.
  await expect(programsPanel.getByTitle("Play program")).toHaveCount(
    programNames.length + 1 - 1,
  );

  await clickViaDom(page, 'button[title="Play program"]');
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(runtimeChip).toContainText("Program: Playing");
  await expect(
    page.getByText(`Currently running: ${playingProgram}`),
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
  const clipNames = await targetRowLabels(
    page.getByTestId("control-authoring-panel-animations"),
  );
  expect(clipNames.length).toBeGreaterThanOrEqual(2);
  const [primaryClip, secondaryClip] = clipNames as [string, string];
  const primaryTargetButton = page.getByRole("button", {
    name: new RegExp(`${escapeRegex(primaryClip)} IMPORTED STOPPED`, "i"),
  });

  const primaryTrackCount = parseTrackCount(
    await primaryTargetButton.innerText(),
  );
  expect(primaryTrackCount).not.toBeNull();
  await clickLocatorViaDom(
    page.getByRole("button", {
      name: new RegExp(`${escapeRegex(secondaryClip)} IMPORTED STOPPED`, "i"),
    }),
  );
  const secondaryName = await selectedNameField.inputValue();
  const secondaryDuration = await durationField.inputValue();

  await clickLocatorViaDom(primaryTargetButton);
  await clickViaDom(page, 'button[title="Play animation"]');
  await expect(runtimeChip).toContainText("Animation: Playing");

  const activeName = await selectedNameField.inputValue();

  await durationField.click();
  // `ControlOrMeta`, not `Control`: on macOS Chromium Ctrl+A is
  // move-to-line-start, not select-all, so typing over a duration of "5" left
  // "12.55" behind rather than replacing it.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("12.5");
  await durationField.blur();
  await expect(durationField).toHaveValue("12.5");
  await clickViaDom(page, 'button[title="Pause animation"]');
  await expect(runtimeChip).toContainText("Animation: Paused");

  await expect(
    page.getByRole("button", {
      name: new RegExp(`${escapeRegex(primaryClip)} IMPORTED PAUSED`, "i"),
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
  await clickSelectedAnimationPanelPlay(page);
  await expect(runtimeChip).toContainText("Animation: Playing");
  await expect(await sampleInputValues(durationField)).toEqual([
    secondaryDuration,
  ]);

  await clickLocatorViaDom(primaryTargetButton);
  await expect(selectedNameField).toHaveValue(activeName);
  await expect(durationField).toHaveValue("12.5");
  await expect(parseTrackCount(await primaryTargetButton.innerText())).toBe(
    primaryTrackCount,
  );
});
