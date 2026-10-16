import { test, expect, type Page } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { changedPixels, distinctColours, sampleElement } from "../pixels";

// The fullscreen face: its slot shows the loading view through the runtime's
// and the face's stages, in order, and drops it once the face is drawn; its
// slot reports the face ready, the canvas shows it — a non-uniform pixel
// sample — and holding an expression's hotkey changes what it shows. The
// change is measured against the face's own motion over a window of the same
// length, taken just before the key goes down.
//
// The page does its work on animation frames: the provider steps the device
// once per frame, and the hotkey's tween writes once per frame. A held key
// reaches the screen a few frames after it goes down — the tween's start
// waits on a device step, its writes land at the next step, the view draws
// the step after. So each window lasts a number of drawn frames as well as a
// length of time. Under SwiftShader the browser draws no frame for many
// seconds after the face reports ready, while it compiles the face's
// pipelines, then about one a second: a window of wall time alone can pass
// without a frame, and every sample in it shows the same picture.
const fullscreenFace = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "fullscreen-face",
)!;

/** The loading view's stages, by the first words of their labels. */
const STAGES = [
  "Downloading the runtime",
  "Compiling the runtime",
  "Starting the runtime",
  "Starting the view",
  "Loading the face",
  "Drawing the face",
];

/** How far the expression's change must exceed the idle change. */
const EXPRESSION_OVER_IDLE = 2.5;
/** Each window's least length and least number of drawn frames: the time
 * the expression's fade takes to show, and the frames a held key takes to
 * reach the screen, with a wide margin. */
const WINDOW_MS = 2_500;
const WINDOW_FRAMES = 20;
/** The longest a window waits for its frames. */
const FRAMES_TIMEOUT_MS = 90_000;

interface FrameCounter {
  framesDrawn: number;
}

test("the fullscreen face shows its loading view until drawn, then its face, and an expression changes it", async ({
  page,
}) => {
  // Loading the face, then three windows of drawn frames, at about a frame a
  // second under SwiftShader.
  test.setTimeout(360_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  // Every label the loading view's progress bar takes, in order.
  await page.addInitScript(() => {
    const labels: string[] = [];
    (window as unknown as { loadingLabels: string[] }).loadingLabels = labels;
    new MutationObserver(() => {
      const bar = document.querySelector('[role="progressbar"]');
      const label = bar?.getAttribute("aria-valuetext");
      if (label && labels.at(-1) !== label) labels.push(label);
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-valuetext"],
    });
  });
  // The animation frames the page has run since its first script.
  await page.addInitScript(() => {
    const counter = window as unknown as FrameCounter;
    counter.framesDrawn = 0;
    const count = () => {
      counter.framesDrawn += 1;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
  });
  await page.goto(demoUrl(fullscreenFace));

  const slot = page.locator("[data-vizij-id]");
  await expect(
    slot.getByRole("progressbar", { name: "Loading the face" }),
  ).toBeVisible();
  await expect(slot).toHaveAttribute("data-vizij-ready", "true", {
    timeout: 180_000,
  });
  await expect(slot.locator("[data-vizij-loading]")).toHaveCount(0);

  const labels = await page.evaluate(
    () => (window as unknown as { loadingLabels: string[] }).loadingLabels,
  );
  const stages = labels.map((label) =>
    STAGES.findIndex((stage) => label.startsWith(stage)),
  );
  expect(stages, `labels: ${labels.join(" → ")}`).not.toContain(-1);
  expect(stages, `the stages go forward: ${labels.join(" → ")}`).toEqual(
    [...stages].sort((a, b) => a - b),
  );
  expect(labels.length, `labels: ${labels.join(" → ")}`).toBeGreaterThan(1);
  // The face settles: the browser draws it again once its pipelines are
  // compiled.
  await drawWindow(page);

  const first = await sampleElement(page, slot);
  expect(
    distinctColours(first),
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);

  await drawWindow(page);
  const before = await sampleElement(page, slot);
  const idle = changedPixels(first, before);

  // `4` holds the face standard's fourth expression, `happy`.
  await page.keyboard.down("4");
  await drawWindow(page);
  const after = await sampleElement(page, slot);
  await page.keyboard.up("4");
  const expressed = changedPixels(before, after);

  expect(
    expressed,
    `the expression changed the face (${expressed} pixels changed, ${idle} while idle)`,
  ).toBeGreaterThan(EXPRESSION_OVER_IDLE * Math.max(idle, 1_000));

  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});

/** Let the page run for {@link WINDOW_MS} and draw {@link WINDOW_FRAMES}
 * animation frames, whichever takes longer. */
async function drawWindow(page: Page): Promise<void> {
  const target =
    (await page.evaluate(
      () => (window as unknown as FrameCounter).framesDrawn,
    )) + WINDOW_FRAMES;
  await page.waitForTimeout(WINDOW_MS);
  await page.waitForFunction(
    (target) => (window as unknown as FrameCounter).framesDrawn >= target,
    target,
    { polling: 250, timeout: FRAMES_TIMEOUT_MS },
  );
}
