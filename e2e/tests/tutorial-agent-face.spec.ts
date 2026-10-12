import { test, expect } from "@playwright/test";
import { STANDALONE_DEMOS, demoUrl } from "../standalone-demos";
import {
  changedPixels,
  distinctColours,
  sampleElement,
  sampleElementRegion,
} from "../pixels";

// The agent face without an agent (no Gemini key in CI): its slot reports the
// face ready, the canvas shows it — a non-uniform pixel sample — and an
// emotion button of the debug controls changes what it shows. The face's
// program moves the face all along, so the check is against that motion:
// around the mouth, which the expression reshapes, a frame with the
// expression must lie farther from every one of a set of idle frames than a
// fresh idle frame does.
const agentFace = STANDALONE_DEMOS.find(
  (demo) => demo.filter === "tutorial-agent-face",
)!;

const EXPRESSION_OVER_IDLE = 2.5;
const IDLE_FRAMES = 5;
const FRAME_MS = 400;
const PEAK_FRAMES = 6;
/** The mouth's part of the slot. */
const MOUTH = { x: 0.3, y: 0.55, width: 0.4, height: 0.25 };

test("the agent face shows its face and an emotion button changes it", async ({
  page,
}) => {
  // Compiling the Bevy shaders on SwiftShader takes a while the first time.
  test.setTimeout(240_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(demoUrl(agentFace));

  const slot = page.locator("[data-vizij-id]");
  await expect(slot).toHaveAttribute("data-vizij-ready", "true", {
    timeout: 180_000,
  });
  await page.getByRole("button", { name: "Show debug controls" }).click();
  const surprised = page.getByRole("button", {
    name: "surprised",
    exact: true,
  });
  await expect(surprised).toBeVisible();
  await page.waitForTimeout(1_000);

  const first = await sampleElement(slot);
  expect(
    distinctColours(first),
    "the canvas shows more than one colour",
  ).toBeGreaterThan(8);

  const idleFrames: Buffer[] = [];
  for (let i = 0; i < IDLE_FRAMES; i += 1) {
    idleFrames.push(await sampleElementRegion(page, slot, MOUTH));
    await page.waitForTimeout(FRAME_MS);
  }
  const distance = (frame: Buffer) =>
    Math.min(...idleFrames.map((idleFrame) => changedPixels(idleFrame, frame)));
  const idle = distance(await sampleElementRegion(page, slot, MOUTH));

  // The expression peaks a quarter second after the click and eases back;
  // frames are taken through that span, as fast as the renderer draws.
  await surprised.click();
  let expressed = 0;
  for (let i = 0; i < PEAK_FRAMES; i += 1) {
    await page.waitForTimeout(FRAME_MS / 2);
    expressed = Math.max(
      expressed,
      distance(await sampleElementRegion(page, slot, MOUTH)),
    );
  }

  expect(
    expressed,
    `the emotion changed the face (${expressed} pixels changed, ${idle} while idle)`,
  ).toBeGreaterThan(EXPRESSION_OVER_IDLE * Math.max(idle, 200));

  expect(
    pageErrors,
    `page errors: ${pageErrors.map((e) => e.message).join("; ")}`,
  ).toHaveLength(0);
});
