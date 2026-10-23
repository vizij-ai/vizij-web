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
 * Both show on Quori's mouth, and are measured on the mouth's pixels with
 * tolerances, against how much the mouth changes on its own between samples
 * taken the same way. The face's program keeps the whole face moving: it
 * sweeps the eyes and brows widely and moves the mouth only slightly, so
 * the whole face changes on its own about as much as an edit changes it.
 */

test.describe.configure({ timeout: 480_000 });

/** Time for a write to reach the screen, with a software GPU's slow frames. */
const SETTLE_MS = 4_000;

/** The least share of the mouth's pixels an edit or speech changes: the
 * bound that applies when the mouth holds still on its own. */
const LEAST_SHOWN = 0.02;

async function settle(page: Page) {
  await page.waitForTimeout(SETTLE_MS);
}

/** Quori's mouth: the bottom quarter of the box the face draws in, below
 * its eyes and brows. */
function mouthOf(face: Rect): Rect {
  return {
    x: face.x,
    y: face.y + face.height * 0.75,
    width: face.width,
    height: face.height * 0.25,
  };
}

/** The weight slider of pose `name`, in Input Controls' poses group. */
async function poseWeightSlider(page: Page, name: string): Promise<Locator> {
  const panel = page.getByTestId("input-controls-panel-inputs");
  await panel.getByText("poses", { exact: true }).first().click();
  const slider = panel
    .getByRole("button", { name: new RegExp(`^${name} - Pose Weight\\b`) })
    .getByRole("slider");
  await expect(slider).toBeVisible();
  return slider;
}

/**
 * How much the mouth changes on its own: over three samples taken
 * `SETTLE_MS` apart, the most a sample differs from the one before it; and
 * the last sample. Each sample takes tens of seconds under a software GPU,
 * so these samples are as far apart as those an edit is measured with.
 */
async function idleChange(
  page: Page,
  mouth: Rect,
): Promise<{ last: Pixels; idle: number }> {
  let last = await samplePage(page, mouth);
  let idle = 0;
  for (let interval = 0; interval < 2; interval += 1) {
    await settle(page);
    const next = await samplePage(page, mouth);
    idle = Math.max(idle, changedPixels(last, next));
    last = next;
  }
  return { last, idle };
}

/** The least change the mouth shows for an edit or speech: three times what
 * it changes on its own, and at least `LEAST_SHOWN` of its pixels. */
function leastShown(idle: number, area: number): number {
  return Math.max(3 * idle, LEAST_SHOWN * area);
}

test("a pose weight the adaptation writes shows the author's value while edited, then the adaptation's @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  const mouth = mouthOf(await drawnFace(page));
  const { last: before, idle } = await idleChange(page, mouth);
  const area = before.width * before.height;

  // Pose A, the open "a" viseme's mouth shape: the adaptation weighs it 0
  // while the face does not speak.
  const weight = await poseWeightSlider(page, "A");
  await weight.focus();
  // Held: the key stays down, and the edit with it.
  await page.keyboard.down("End");
  await settle(page);
  const held = await samplePage(page, mouth);
  await page.keyboard.up("End");
  await settle(page);
  const released = await samplePage(page, mouth);

  const shown = changedPixels(before, held);
  expect(
    shown,
    `the held weight changed ${shown} of ${area} mouth pixels; the mouth alone changed up to ${idle}`,
  ).toBeGreaterThan(leastShown(idle, area));
  const left = changedPixels(before, released);
  expect(
    left,
    `once released, ${left} mouth pixels still differ from before the edit (${shown} while held)`,
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

/** How long the stand-in's utterance lasts, in seconds: long enough that
 * samples of the mouth, each of which takes tens of seconds under a software
 * GPU, land while the face still speaks. */
const UTTERANCE_SECONDS = 60;

/** The stand-in's viseme marks: open mouth shapes in turn, every half
 * second, then silence for the utterance's last half second. */
function utteranceVisemes(): { time: number; value: string }[] {
  const shapes = ["a", "O", "E"];
  const marks = Array.from({ length: UTTERANCE_SECONDS * 2 - 1 }, (_, i) => ({
    time: i * 500,
    value: shapes[i % shapes.length]!,
  }));
  return [...marks, { time: UTTERANCE_SECONDS * 1000 - 500, value: "sil" }];
}

/** The text-to-speech deployment, stood in for: `UTTERANCE_SECONDS` of
 * audio and its viseme marks, for any text. */
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
          body: silentWav(UTTERANCE_SECONDS),
        }),
  );
  await page.route("**/tts/get-visemes", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fulfill({ status: 204, headers })
      : route.fulfill({
          status: 200,
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ visemes: utteranceVisemes() }),
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
  const mouth = mouthOf(await drawnFace(page));
  const panel = await openSpeechPanel(page);
  const { last: before, idle } = await idleChange(page, mouth);
  const area = before.width * before.height;

  await panel.getByTestId("speech-script").fill("Hello there");
  await panel.getByTestId("speech-speak").click();

  const visemes = panel.getByTestId("speech-viseme");
  await expect
    .poll(() => visemes.count(), {
      message: "the timeline fills with the visemes the face reports",
      timeout: 120_000,
    })
    .toBeGreaterThan(1);
  // The mouth is sampled until a sample shows it moved, for at most the
  // utterance's length: each sample catches whichever of the utterance's
  // shapes the mouth shows at that moment.
  await expect
    .poll(async () => changedPixels(before, await samplePage(page, mouth)), {
      message: `speaking changes the mouth's ${area} pixels by more than it changes on its own (up to ${idle})`,
      timeout: UTTERANCE_SECONDS * 1000,
    })
    .toBeGreaterThan(leastShown(idle, area));
});
