import { expect, test, type Locator, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";
import {
  distinctColours,
  samplePage,
  type Pixels,
  type Rect,
} from "./viewportPixels";
import { drawnFace, VIEWPORT_POLL_TIMEOUT_MS } from "./viewportRegion";

/**
 * The viewport draws the face, and an input moved in Input Controls shows on
 * it. Measured with tolerances rather than a golden frame, so the spec holds
 * for any renderer that draws the face.
 *
 * The input is Quori's `Cross`, which turns its eyes toward each other, and
 * what shows it is how far apart the pupils are. The face's program keeps
 * the eyes moving, but moves them together: the pupils' distance holds to
 * within a few thousandths of the face's width while each pupil sweeps, and
 * the face's pixels change on their own about as much as an input changes
 * them. A count of changed pixels cannot tell the input from the program;
 * the pupils' distance can.
 */

test.describe.configure({ timeout: 480_000 });

/** The interval the pupils' own motion is measured over. */
const SETTLE_MS = 1_500;

/** The least the pupils' distance changes for the input, as a share of the
 * face's width: the bound that applies when it holds still on its own.
 * `Cross` at its end moves the pupils about 0.06 closer. */
const LEAST_SHOWN = 0.02;

/** A pupil's pixels: near black, against the face's teal and the eyes'
 * whites. */
const PUPIL_MAX_RGB_SUM = 90;

/** The least share of an eye's half of the band its pupil covers, below
 * which the eye counts as closed (a blink). */
const LEAST_PUPIL_SHARE = 0.02;

/** The band of the face's box Quori's eyes sit in, below its brows and
 * above its mouth. */
function eyesOf(face: Rect): Rect {
  return {
    x: face.x,
    y: face.y + face.height * 0.42,
    width: face.width,
    height: face.height * 0.32,
  };
}

/**
 * How far apart the pupils are, as a share of the face's width: the distance
 * between the centres of the near-black pixels in its left and right halves,
 * its outer edges left out, where the face's outline meets the background.
 * `null` while either eye shows no pupil, as in a blink.
 */
function pupilDistance(pixels: Pixels): number | null {
  const halves = [
    [0.08, 0.5],
    [0.5, 0.92],
  ] as const;
  const centres = halves.map(([from, to]) => {
    const x0 = Math.floor(pixels.width * from);
    const x1 = Math.floor(pixels.width * to);
    let count = 0;
    let sumX = 0;
    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * pixels.width + x) * 4;
        const rgb = pixels.data[i]! + pixels.data[i + 1]! + pixels.data[i + 2]!;
        if (rgb < PUPIL_MAX_RGB_SUM) {
          count += 1;
          sumX += x;
        }
      }
    }
    const shown = count >= LEAST_PUPIL_SHARE * (x1 - x0) * pixels.height;
    return shown ? sumX / count : null;
  });
  const [left, right] = centres;
  return left == null || right == null ? null : (right - left) / pixels.width;
}

/** The pupils' distance as the viewport shows it, sampled until both eyes
 * show a pupil. */
async function pupilDistanceOn(page: Page, eyes: Rect): Promise<number> {
  let distance: number | null = null;
  await expect
    .poll(
      async () => {
        distance = pupilDistance(await samplePage(page, eyes));
        return distance;
      },
      {
        message: "both of the face's eyes show a pupil",
        timeout: VIEWPORT_POLL_TIMEOUT_MS,
      },
    )
    .not.toBeNull();
  return distance!;
}

/**
 * How much the pupils' distance changes on its own: over three samples taken
 * `SETTLE_MS` apart, the most a sample differs from the one before it; and
 * the last sample.
 */
async function idleDistance(
  page: Page,
  eyes: Rect,
): Promise<{ rest: number; idle: number }> {
  let rest = await pupilDistanceOn(page, eyes);
  let idle = 0;
  for (let interval = 0; interval < 2; interval += 1) {
    await page.waitForTimeout(SETTLE_MS);
    const next = await pupilDistanceOn(page, eyes);
    idle = Math.max(idle, Math.abs(next - rest));
    rest = next;
  }
  return { rest, idle };
}

/** The slider of gaze input `name`, in Input Controls' gaze group. */
async function gazeSlider(page: Page, name: string): Promise<Locator> {
  const panel = page.getByTestId("input-controls-panel-inputs");
  await panel.getByText("gaze", { exact: true }).first().click();
  const slider = panel
    .getByRole("button", { name: new RegExp(`^${name}\\b`) })
    .getByRole("slider");
  await expect(slider).toBeVisible();
  return slider;
}

test("the viewport draws the face, and an input change shows on it @smoke", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const face: Rect = await drawnFace(page);
  expect(
    distinctColours(await samplePage(page, face)),
    "the face is drawn, not a flat fill",
  ).toBeGreaterThan(8);

  const eyes = eyesOf(face);
  const { rest, idle } = await idleDistance(page, eyes);
  const least = Math.max(3 * idle, LEAST_SHOWN);

  const cross = await gazeSlider(page, "Cross");
  await cross.focus();
  // Held: the key stays down, and the edit with it.
  await page.keyboard.down("End");
  await expect
    .poll(async () => rest - (await pupilDistanceOn(page, eyes)), {
      message:
        `Cross at its end brings the pupils closer than ${rest.toFixed(4)} ` +
        `of the face's width by more than ${least.toFixed(4)}; on its own, ` +
        `their distance changed up to ${idle.toFixed(4)}`,
      timeout: VIEWPORT_POLL_TIMEOUT_MS,
    })
    .toBeGreaterThan(least);
  await page.keyboard.up("End");
});
