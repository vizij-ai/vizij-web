import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import { changedPixels, distinctColours, sampleElement } from "../pixels";

// demo-vizij-player loads the curated sample onto the page's canvas: its slot
// reports the face ready and the canvas shows it (a non-uniform pixel
// sample). Moving the blink slider writes the rig's blink input and closes
// the eyes, measured against the face's own motion over the same interval;
// playing an embedded animation puts its player in `playing`.
// Runtime value errors — a write of the wrong shape, an engine that failed
// to start — fail the test wherever they surface.
const player = STANDALONE_DEMOS.find((d) => d.filter === "demo-vizij-player");
if (!player) throw new Error("demo-vizij-player missing from STANDALONE_DEMOS");

const RUNTIME_ERROR =
  /unknown variant|Failed to initialize the engine|expected magic word|failed to init wasm/i;
const INTERVAL_MS = 1_500;
const CHANGE_OVER_IDLE = 2.5;

test("demo-vizij-player shows the sample, drives its rig and plays an animation", async ({
  page,
}) => {
  // Compiling the Bevy shaders on SwiftShader takes a while the first time.
  test.setTimeout(240_000);
  const runtimeErrors: string[] = [];
  const pageErrors: string[] = [];
  const record = (msg: string) => {
    if (RUNTIME_ERROR.test(msg)) runtimeErrors.push(msg);
  };
  page.on("pageerror", (e) => {
    pageErrors.push(e.message);
    record(e.message);
  });
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") record(m.text());
  });

  await page.goto(demoUrl(player));
  await page
    .getByRole("button", { name: /load sample/i })
    .first()
    .click();

  const slot = page.locator('[data-vizij-id="player"]');
  await expect(slot).toHaveAttribute("data-vizij-ready", "true", {
    timeout: 180_000,
  });
  await slot.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1_000);

  const first = await sampleElement(slot);
  expect(
    distinctColours(first),
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);

  await page.waitForTimeout(INTERVAL_MS);
  const before = await sampleElement(slot);
  const idle = changedPixels(first, before);

  const blink = page
    .locator("label.range-field", { hasText: "Intensity" })
    .locator("input[type=range]");
  await blink.fill("1");
  await page.waitForTimeout(INTERVAL_MS);
  const after = await sampleElement(slot);
  const moved = changedPixels(before, after);
  expect(
    moved,
    `the blink slider changed the face (${moved} pixels changed, ${idle} while idle)`,
  ).toBeGreaterThan(CHANGE_OVER_IDLE * Math.max(idle, 200));

  const firstAnimation = page
    .locator('[data-testid^="animation-state-"]')
    .first();
  await page
    .getByRole("button", { name: /^Play / })
    .first()
    .click();
  await expect(firstAnimation).toHaveText("playing", { timeout: 10_000 });

  expect(
    runtimeErrors,
    `arora runtime value errors:\n${runtimeErrors.join("\n")}`,
  ).toHaveLength(0);
  expect(pageErrors, `page errors: ${pageErrors.join("; ")}`).toHaveLength(0);
});
