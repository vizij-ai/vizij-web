import { expect, type Page } from "@playwright/test";
import { drawnBox, samplePage, type Pixels, type Rect } from "./viewportPixels";

/**
 * The middle of the main viewport, in page coordinates: the face's slot
 * without its edges, where the status chips and the reset button sit over
 * the canvas and change with the frame rate.
 */
export async function viewportMiddle(page: Page): Promise<Rect> {
  const slot = await page.getByTestId("main-runtime-view").boundingBox();
  if (!slot) {
    throw new Error("the main viewport is not laid out");
  }
  return {
    x: slot.x + slot.width * 0.2,
    y: slot.y + slot.height * 0.15,
    width: slot.width * 0.6,
    height: slot.height * 0.7,
  };
}

/** A point of a sample, in page coordinates. */
export function pagePoint(
  region: Rect,
  pixels: Pixels,
  point: { x: number; y: number },
): { x: number; y: number } {
  const scale = pixels.width / region.width;
  return { x: region.x + point.x / scale, y: region.y + point.y / scale };
}

/**
 * Where the face draws in the middle of the viewport, in page coordinates:
 * the box around every pixel that differs from the viewport's background.
 * Waits until the face draws there and the box holds still across two
 * samples, so a frame drawn while the face loads is not taken for it.
 */
export async function drawnFace(page: Page): Promise<Rect> {
  const region = await viewportMiddle(page);
  let previous: string | null = null;
  let found: Rect | null = null;
  await expect
    .poll(
      async () => {
        const pixels = await samplePage(page, region);
        const box = drawnBox(pixels);
        const key = JSON.stringify(box);
        const settled = box !== null && key === previous;
        previous = key;
        if (settled) {
          const scale = pixels.width / region.width;
          found = {
            x: region.x + box.x / scale,
            y: region.y + box.y / scale,
            width: box.width / scale,
            height: box.height / scale,
          };
        }
        return settled;
      },
      {
        message: "the face draws in the middle of the viewport and holds still",
        intervals: [500],
        timeout: 30_000,
      },
    )
    .toBe(true);
  return found!;
}
