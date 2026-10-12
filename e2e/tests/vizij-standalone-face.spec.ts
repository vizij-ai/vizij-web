import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { countFrames, drawWindow } from "../frames";
import { changedFromNearest, distinctColours, sampleRect } from "../pixels";

// The face page: the Bevy view mounts on the page's canvas, the shipped face
// loads from its bytes, its device runs, and the page reports it ready. The
// canvas then shows something — a non-uniform pixel sample — and an
// expression, a `set_expression` run, changes what it shows.
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
