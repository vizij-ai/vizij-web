import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { changedPixels, distinctColours, sampleElement } from "../pixels";

// The showcase draws all its faces on one canvas: the page holds a single
// <canvas>, and each section's slot, once scrolled to, reports its face ready
// and shows it (a non-uniform pixel sample). In the Expressions section a
// preset changes what the face shows; the face runs no program there, so it
// rests between samples.
const showcase = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "vizij-showcase",
)!;

const SECTIONS = ["hero", "expressions", "gaze", "voice", "controls"];

test("the showcase draws each section's face on one canvas", async ({
  page,
}) => {
  // Compiling the Bevy shaders on SwiftShader takes a while the first time.
  test.setTimeout(300_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(demoUrl(showcase));

  for (const section of SECTIONS) {
    const slot = page.locator(`[data-vizij-id^="showcase-${section}"]`);
    await page.locator(`#${section}`).scrollIntoViewIfNeeded();
    await expect(slot, `the ${section} face loads`).toHaveAttribute(
      "data-vizij-ready",
      "true",
      { timeout: 180_000 },
    );
    await slot.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    expect(
      distinctColours(await sampleElement(slot)),
      `the ${section} face shows more than one colour`,
    ).toBeGreaterThan(8);
  }
  await expect(page.locator("canvas")).toHaveCount(1);

  const expressions = page.locator('[data-vizij-id="showcase-expressions"]');
  await expressions.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const before = await sampleElement(expressions);
  await page.getByRole("button", { name: /surprised/ }).click();
  await page.waitForTimeout(300);
  const after = await sampleElement(expressions);
  expect(
    changedPixels(before, after),
    "the surprised preset changed the face",
  ).toBeGreaterThan(1_000);

  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});
