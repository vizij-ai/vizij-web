// Pixel evidence that a face is drawn and that a change shows on it.
import type { Locator, Page } from "@playwright/test";
import { PNG } from "pngjs";

/** The RGBA pixels of a rectangle of the page. */
export async function sampleRect(
  page: Page,
  clip: { x: number; y: number; width: number; height: number },
): Promise<Buffer> {
  return PNG.sync.read(await page.screenshot({ clip })).data;
}

/** The RGBA pixels of an element as it shows on the page — a face's slot,
 * with whatever the page's canvas draws over it — scrolled into view. */
export async function sampleElement(element: Locator): Promise<Buffer> {
  return PNG.sync.read(await element.screenshot()).data;
}

/** How many distinct colours the pixels hold: more than a few means the
 * canvas is not uniform. */
export function distinctColours(pixels: Buffer): number {
  const colours = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) {
    colours.add((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
  }
  return colours.size;
}

/** The pixels whose colour moved by more than rendering noise. */
export function changedPixels(a: Buffer, b: Buffer): number {
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
