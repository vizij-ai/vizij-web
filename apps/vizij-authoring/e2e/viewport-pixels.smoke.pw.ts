import { expect, test, type Locator, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";
import {
  changedPixels,
  distinctColours,
  samplePage,
  type Rect,
} from "./viewportPixels";
import { drawnFace } from "./viewportRegion";

/**
 * The viewport draws the face, and an input moved in Input Controls shows on
 * it. Measured on the part of the viewport the face draws on, with
 * tolerances rather than a golden frame, so the spec holds for any renderer
 * that draws the face: the face is not a flat fill, and the input changes a
 * share of its pixels well beyond what the face changes on its own over the
 * same interval.
 */

test.describe.configure({ timeout: 480_000 });

/** The first slider of an Input Controls group, opened. */
async function firstSliderOf(page: Page, group: string): Promise<Locator> {
  const panel = page.getByTestId("input-controls-panel-inputs");
  await panel.getByText(group, { exact: true }).first().click();
  const slider = panel.getByRole("slider").first();
  await expect(slider).toBeVisible();
  return slider;
}

async function settle(page: Page) {
  await page.waitForTimeout(1500);
}

test("the viewport draws the face, and an input change shows on it @smoke", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const face: Rect = await drawnFace(page);
  const before = await samplePage(page, face);
  expect(
    distinctColours(before),
    "the face is drawn, not a flat fill",
  ).toBeGreaterThan(8);

  await settle(page);
  const rested = await samplePage(page, face);
  const idle = changedPixels(before, rested);

  const gaze = await firstSliderOf(page, "gaze");
  await gaze.focus();
  await page.keyboard.press("End");
  await settle(page);
  const after = await samplePage(page, face);
  const moved = changedPixels(rested, after);

  const area = before.width * before.height;
  expect(
    moved,
    `moving the gaze to its end changed ${moved} of ${area} face pixels; ` +
      `the face alone changed ${idle} over the same interval`,
  ).toBeGreaterThan(Math.max(3 * idle, 0.005 * area));
});
