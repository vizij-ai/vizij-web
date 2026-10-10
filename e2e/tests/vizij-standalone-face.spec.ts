import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";

// The face page: the Bevy view mounts on the page's canvas, the shipped face
// loads from its bytes, its device runs, and the page reports it ready. The
// canvas then shows something — a non-uniform pixel sample — and an
// expression written by its ROS4HRI name changes what it shows.
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
async function sample(page: import("@playwright/test").Page): Promise<Buffer> {
  return PNG.sync.read(
    await page.screenshot({
      clip: { x: 200, y: 100, width: 500, height: 350 },
    }),
  ).data;
}

function distinctColours(pixels: Buffer): number {
  const colours = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) {
    colours.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  }
  return colours.size;
}

/** The pixels whose colour moved by more than rendering noise. */
function changedPixels(a: Buffer, b: Buffer): number {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const distance =
      Math.abs(a[i] - b[i]) +
      Math.abs(a[i + 1] - b[i + 1]) +
      Math.abs(a[i + 2] - b[i + 2]);
    if (distance > 24) changed++;
  }
  return changed;
}
