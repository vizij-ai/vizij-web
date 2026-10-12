import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { changedPixels, distinctColours, sampleRect } from "../pixels";

// The face page: the Bevy view mounts on the page's canvas, the shipped face
// loads from its bytes, its device runs, and the page reports it ready. The
// canvas then shows something — a non-uniform pixel sample — and an
// expression written as its face-standard weight changes what it shows.
//
// The face moves on its own (its programs move the eyes and blink), so any
// two samples differ. The expression's change is measured against that idle
// change over the same interval, taken just before the click: a write that
// shows no expression changes the face about as much as idling does.
const standalone = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "vizij-standalone",
)!;

/** How far the expression's change must exceed the idle change. */
const EXPRESSION_OVER_IDLE = 2.5;
const INTERVAL_MS = 1_500;

test("the face page loads its face and shows it", async ({ page }) => {
  // Compiling the Bevy shaders on SwiftShader takes a while the first time.
  test.setTimeout(240_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(demoUrl(standalone));

  await expect(page.getByText("ready", { exact: true })).toBeVisible({
    timeout: 180_000,
  });
  await page.waitForTimeout(INTERVAL_MS);

  const first = await sample(page);
  expect(
    distinctColours(first),
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);

  await page.waitForTimeout(INTERVAL_MS);
  const before = await sample(page);
  const idle = changedPixels(first, before);

  await page.getByRole("button", { name: "surprised", exact: true }).click();
  await page.waitForTimeout(INTERVAL_MS);
  const after = await sample(page);
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

/** The RGBA pixels of the page's middle. */
function sample(page: import("@playwright/test").Page): Promise<Buffer> {
  return sampleRect(page, { x: 200, y: 100, width: 500, height: 350 });
}
