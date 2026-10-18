import { expect, test, type Locator, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";
import {
  changedPixels,
  samplePage,
  type Pixels,
  type Rect,
} from "./viewportPixels";
import { drawnFace } from "./viewportRegion";

/**
 * The main face runs as any app runs it — its standard adaptation, with its
 * active program running — and the author's edits and speech reach it
 * through that composition:
 *
 * - a pose weight the adaptation writes shows the author's value while the
 *   author edits it, and the adaptation's value once the edit ends;
 * - the speech panel speaks through the face's `say`, its timeline fills
 *   with the visemes the face reports, and the mouth moves.
 *
 * Measured on the face's pixels with tolerances, against the face's own
 * motion over the same interval, so the face's program may keep moving it.
 */

test.describe.configure({ timeout: 480_000 });

/** Time for a write to reach the screen, with a software GPU's slow frames. */
const SETTLE_MS = 4_000;

async function settle(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
}

/** The first slider of an Input Controls group, opened. */
async function firstSliderOf(page: Page, group: string): Promise<Locator> {
  const panel = page.getByTestId("input-controls-panel-inputs");
  await panel.getByText(group, { exact: true }).first().click();
  const slider = panel.getByRole("slider").first();
  await expect(slider).toBeVisible();
  return slider;
}

/** The face's pixels, the interval apart, and what changed between them:
 * how much the face moves on its own. */
async function idleChange(
  page: Page,
  face: Rect,
): Promise<{ last: Pixels; idle: number }> {
  const first = await samplePage(page, face);
  await settle(page);
  const last = await samplePage(page, face);
  return { last, idle: changedPixels(first, last) };
}

test("a pose weight the adaptation writes shows the author's value while edited, then the adaptation's @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  const face = await drawnFace(page);
  const { last: before, idle } = await idleChange(page, face);
  const area = before.width * before.height;

  const weight = await firstSliderOf(page, "poses");
  await weight.focus();
  // Held: the key stays down, and the edit with it.
  await page.keyboard.down("End");
  await settle(page);
  const held = await samplePage(page, face);
  await page.keyboard.up("End");
  await settle(page);
  const released = await samplePage(page, face);

  const shown = changedPixels(before, held);
  expect(
    shown,
    `the held weight changed ${shown} of ${area} face pixels; the face alone changed ${idle}`,
  ).toBeGreaterThan(Math.max(3 * idle, 0.005 * area));
  const left = changedPixels(before, released);
  expect(
    left,
    `once released, ${left} face pixels still differ from before the edit (${shown} while held)`,
  ).toBeLessThan(shown / 2);
});

/** A mono 16-bit WAV of `seconds` of silence: audio the page can decode. */
function silentWav(seconds: number, sampleRate = 16_000): Buffer {
  const samples = Math.round(seconds * sampleRate);
  const data = samples * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + data, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(data, 40);
  return wav;
}

/** The text-to-speech deployment, stood in for: three seconds of audio and
 * its viseme marks, for any text. */
async function standInForSpeechService(page: Page) {
  const headers = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
  };
  await page.route("**/tts/get-audio", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers })
      : route.fulfill({
          status: 200,
          headers: { ...headers, "content-type": "audio/wav" },
          body: silentWav(3),
        }),
  );
  await page.route("**/tts/get-visemes", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers })
      : route.fulfill({
          status: 200,
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            visemes: [
              { time: 0, value: "p" },
              { time: 600, value: "a" },
              { time: 1200, value: "O" },
              { time: 1800, value: "E" },
              { time: 2600, value: "sil" },
            ],
          }),
        }),
  );
}

async function openSpeechPanel(page: Page): Promise<Locator> {
  const panel = page.getByTestId("speech-panel");
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByTestId("app-menu-view").click();
    await page.getByTestId("app-menu-view-right-speech").click();
    await page.keyboard.press("Escape");
  }
  await expect(panel).toBeVisible();
  return panel;
}

test("the speech panel speaks through the face: its timeline fills with the face's visemes and the mouth moves @workflow", async ({
  page,
}) => {
  await standInForSpeechService(page);
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  const face = await drawnFace(page);
  const panel = await openSpeechPanel(page);
  const { last: before, idle } = await idleChange(page, face);
  const area = before.width * before.height;

  await panel.getByTestId("speech-script").fill("Hello there");
  // The page's audio player stops a playback the device has not polled for
  // a while, judged against how often the device polls; on a page drawing a
  // few frames a second, its first playback can stop before its first poll.
  // A first utterance teaches it the page's pace.
  const speak = panel.getByTestId("speech-speak");
  await speak.click();
  await expect(speak).toHaveText("Speak", { timeout: 120_000 });
  await speak.click();

  const visemes = panel.getByTestId("speech-viseme");
  await expect
    .poll(() => visemes.count(), {
      message: "the timeline fills with the visemes the face reports",
      timeout: 120_000,
    })
    .toBeGreaterThan(1);
  const speaking = await samplePage(page, face);
  const moved = changedPixels(before, speaking);
  expect(
    moved,
    `speaking changed ${moved} of ${area} face pixels; the face alone changed ${idle}`,
  ).toBeGreaterThan(Math.max(3 * idle, 0.002 * area));
});
