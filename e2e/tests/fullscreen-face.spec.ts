import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { changedPixels, distinctColours, sampleElement } from "../pixels";

// The fullscreen face: its slot reports the face ready, the canvas shows it —
// a non-uniform pixel sample — and holding an expression's hotkey changes
// what it shows. The change is measured against the face's own motion over
// the same interval, taken just before the key goes down.
const fullscreenFace = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "fullscreen-face",
)!;

/** How far the expression's change must exceed the idle change. */
const EXPRESSION_OVER_IDLE = 2.5;
const INTERVAL_MS = 2_500;

test("the fullscreen face shows its face and an expression changes it", async ({
  page,
}) => {
  // Compiling the Bevy shaders on SwiftShader takes a while the first time.
  test.setTimeout(240_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(demoUrl(fullscreenFace));

  const slot = page.locator("[data-vizij-id]");
  await expect(slot).toHaveAttribute("data-vizij-ready", "true", {
    timeout: 180_000,
  });
  await page.waitForTimeout(1_000);

  const first = await sampleElement(slot);
  expect(
    distinctColours(first),
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);

  await page.waitForTimeout(INTERVAL_MS);
  const before = await sampleElement(slot);
  const idle = changedPixels(first, before);

  // `4` holds the face standard's fourth expression, `happy`.
  await page.keyboard.down("4");
  await page.waitForTimeout(INTERVAL_MS);
  const after = await sampleElement(slot);
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
