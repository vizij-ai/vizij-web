import { test, expect, type Page } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { countFrames, drawWindow } from "../frames";
import { changedFromNearest, distinctColours, sampleRect } from "../pixels";

// The face page: the Bevy view mounts on the page's canvas, the shipped face
// loads from its bytes, its device runs, and the page reports it ready. The
// canvas then shows something — a non-uniform pixel sample — and an
// expression written as its face-standard weight changes what it shows.
//
// The face moves on its own: its programs move the eyes and blink. So the
// check is made around the mouth, which `surprised` opens, and against that
// motion: a frame with the expression must lie farther from every one of a
// set of idle frames than a fresh idle frame does. The expression is sampled
// after a window of drawn frames (see frames.ts).
const standalone = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "vizij-standalone",
)!;

/** How far the expression's change must exceed the idle change. */
const EXPRESSION_OVER_IDLE = 2.5;
const IDLE_FRAMES = 3;
const FRAME_MS = 400;
/** The face settles, and the expression shows, within this window: a
 * length of time and a number of drawn frames. */
const WINDOW = { ms: 2_000, frames: 8, timeout: 90_000 };
/** The face's mouth on the page, at Playwright's 1280×720 viewport. */
const MOUTH = { x: 520, y: 400, width: 240, height: 140 };

test("the face page loads its face and shows it", async ({ page }) => {
  // Compiling the Bevy shaders on SwiftShader takes a while the first time,
  // then each of the five samples can take forty seconds on a slow runner.
  test.setTimeout(420_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await countFrames(page);
  await page.goto(demoUrl(standalone));

  await expect(page.getByText("ready", { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await drawWindow(page, WINDOW);

  const idleFrames: Buffer[] = [];
  for (let i = 0; i < IDLE_FRAMES; i += 1) {
    idleFrames.push(await sampleRect(page, MOUTH));
    await page.waitForTimeout(FRAME_MS);
  }
  expect(
    distinctColours(idleFrames[0]),
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);
  const idle = changedFromNearest(idleFrames, await sampleRect(page, MOUTH));

  await page.getByRole("button", { name: "surprised", exact: true }).click();
  await drawWindow(page, WINDOW);
  const expressed = changedFromNearest(
    idleFrames,
    await sampleRect(page, MOUTH),
  );

  expect(
    expressed,
    `the expression changed the face (${expressed} pixels changed, ${idle} while idle)`,
  ).toBeGreaterThan(EXPRESSION_OVER_IDLE * Math.max(idle, 200));

  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});

// The face page speaking: a typed line is said by a `say` run, its synthesis
// served by the test (a sine tone as its audio, a mark a second as its
// visemes). While the run plays, the page's runtime reads the face standard's
// conversation state the page writes: `speaking` 1, `user_speaking` and
// `thinking` 0. The page's stop — the path a barge-in takes — returns
// `speaking` to 0 and halts the run, whose audio stops once the run goes
// unpolled for the runtime's halt bound: 250 ms on a page polling at least
// every 62.5 ms, four of the page's poll intervals on a slower page, as
// SwiftShader's is.

/** Seconds of audio the test's synthesis returns: longer than the test. */
const SPEECH_S = 120;
const SAMPLE_RATE = 8_000;

/** A mono 16-bit PCM WAV of a quiet tone, `seconds` long. */
function toneWav(seconds: number): Buffer {
  const samples = seconds * SAMPLE_RATE;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const sample = Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE) * 2_000;
    wav.writeInt16LE(Math.round(sample), 44 + i * 2);
  }
  return wav;
}

interface AudioLog {
  /** `performance.now()` of each buffer source's `start` and `stop`. */
  starts: number[];
  stops: number[];
  /** `performance.now()` of each animation frame. */
  frames: number[];
}

/** The page's conversation state, read through its runtime. */
async function conversationState(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const runtime = (
      window as unknown as {
        vizijFace: {
          path(relative: string): string;
          readValues(paths: string[]): Record<string, unknown>;
        };
      }
    ).vizijFace;
    const state: Record<string, number> = {};
    for (const name of ["speaking", "user_speaking", "thinking"]) {
      const key = runtime.path(`standard/vizij/conversation/${name}`);
      const value = runtime.readValues([key])[key] as
        | { f32?: number; float?: number }
        | number
        | null;
      state[name] =
        typeof value === "number" ? value : (value?.f32 ?? value?.float ?? 0);
    }
    return state;
  });
}

test("the face page writes its conversation state while it speaks", async ({
  page,
}) => {
  test.setTimeout(420_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.addInitScript(() => {
    const log: AudioLog = { starts: [], stops: [], frames: [] };
    (window as unknown as { audioLog: AudioLog }).audioLog = log;
    const proto = AudioBufferSourceNode.prototype;
    const start = proto.start;
    const stop = proto.stop;
    proto.start = function (...args: Parameters<typeof start>) {
      log.starts.push(performance.now());
      return start.apply(this, args);
    };
    proto.stop = function (...args: Parameters<typeof stop>) {
      log.stops.push(performance.now());
      return stop.apply(this, args);
    };
    const frame = (at: number) => {
      log.frames.push(at);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await countFrames(page);
  await page.route("**/tts/get-audio", (route) =>
    route.fulfill({ contentType: "audio/wav", body: toneWav(SPEECH_S) }),
  );
  await page.route("**/tts/get-visemes", (route) =>
    route.fulfill({
      json: {
        visemes: Array.from({ length: SPEECH_S }, (_, i) => ({
          time: i * 1_000,
          value: i % 2 ? "a" : "p",
        })),
      },
    }),
  );
  await page.goto(demoUrl(standalone));
  await expect(page.getByText("ready", { exact: true })).toBeVisible({
    timeout: 180_000,
  });

  expect(await conversationState(page), "at rest").toEqual({
    speaking: 0,
    user_speaking: 0,
    thinking: 0,
  });

  await page.getByPlaceholder("text to say").fill("Hello there.");
  await page.getByRole("button", { name: "say", exact: true }).click();
  const stop = page.getByRole("button", { name: "stop", exact: true });
  await expect(stop, "the page is speaking").toBeVisible({ timeout: 60_000 });
  await page.waitForFunction(
    () =>
      (window as unknown as { audioLog: AudioLog }).audioLog.starts.length > 0,
    undefined,
    { polling: 100, timeout: 120_000 },
  );
  expect(await conversationState(page), "while the face speaks").toEqual({
    speaking: 1,
    user_speaking: 0,
    thinking: 0,
  });

  // Two polls of the playback measure the page's pace before the stop.
  await drawWindow(page, { ms: 1_000, frames: 3, timeout: 90_000 });
  const stoppedAt = await page.evaluate(() => performance.now());
  await stop.click();
  await expect
    .poll(async () => (await conversationState(page)).speaking, {
      message: "speaking returns to 0 at the stop",
      timeout: 60_000,
    })
    .toBe(0);
  await page.waitForFunction(
    () =>
      (window as unknown as { audioLog: AudioLog }).audioLog.stops.length > 0,
    undefined,
    { polling: 50, timeout: 120_000 },
  );
  const log = await page.evaluate(
    () => (window as unknown as { audioLog: AudioLog }).audioLog,
  );
  // The page's widest gap between two frames while the audio played, a
  // bound on its poll interval; the halt lands on the frame after the stop.
  const frames = log.frames.filter((at) => at >= log.starts[0]);
  const widest = Math.max(...frames.slice(1).map((at, i) => at - frames[i]), 0);
  // The bound, the frame the halt lands on, and the player's check period.
  const bound = Math.max(250, 4 * widest) + widest + 125;
  const tookMs = log.stops[0] - stoppedAt;
  expect(
    tookMs,
    `the audio stopped ${Math.round(tookMs)} ms after the stop (widest frame gap ${Math.round(widest)} ms)`,
  ).toBeLessThanOrEqual(bound);
  expect(await conversationState(page), "after the stop").toEqual({
    speaking: 0,
    user_speaking: 0,
    thinking: 0,
  });
  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});
