import type { Locator, Page } from "@playwright/test";

/**
 * Pixel evidence read from screenshots of the viewport, whatever draws it.
 *
 * Screenshots are decoded in the page with `createImageBitmap`, so no PNG
 * decoder is needed on the Node side. The measures are coarse on purpose —
 * how many colours a rectangle holds, which pixels moved by more than
 * rendering noise — so they hold for any renderer that draws the same face.
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA, row-major. */
  data: number[];
}

/** A rectangle of the page, in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The RGBA pixels of a rectangle of the page as it shows. */
export async function samplePage(page: Page, clip: Rect): Promise<Pixels> {
  const png = await page.screenshot({ clip, animations: "disabled" });
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(
      new Blob([bytes], { type: "image/png" }),
    );
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: image.width,
      height: image.height,
      data: Array.from(image.data),
    };
  }, png.toString("base64"));
}

/** The RGBA pixels of an element's box as it shows on the page. */
export async function sampleElement(
  page: Page,
  element: Locator,
): Promise<{ pixels: Pixels; box: Rect }> {
  const box = await element.boundingBox();
  if (!box) {
    throw new Error("the element is not laid out");
  }
  return { pixels: await samplePage(page, box), box };
}

/** How many distinct colours the pixels hold. */
export function distinctColours(pixels: Pixels): number {
  const colours = new Set<number>();
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    colours.add((data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!);
  }
  return colours.size;
}

/** The most frequent colour: the background of a sparsely drawn rectangle. */
function dominantColour(pixels: Pixels): [number, number, number] {
  const counts = new Map<number, number>();
  const { data } = pixels;
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestCount = -1;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });
  return [(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff];
}

/** Whether two pixels differ by more than rendering noise. */
function differs(a: number[], i: number, b: number[], j: number): boolean {
  return (
    Math.abs(a[i]! - b[j]!) +
      Math.abs(a[i + 1]! - b[j + 1]!) +
      Math.abs(a[i + 2]! - b[j + 2]!) >
    24
  );
}

/**
 * The part of the rectangle the face draws on: the bounding box, in the
 * sample's pixel coordinates, of every pixel that differs from the
 * rectangle's dominant colour. `null` when nothing does.
 */
export function drawnBox(pixels: Pixels): Rect | null {
  const [r, g, b] = dominantColour(pixels);
  const background = [r, g, b];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      const i = (y * pixels.width + x) * 4;
      if (differs(pixels.data, i, background, 0)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX) {
    return null;
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The rows of column `x`, from `inset` rows above the sample's bottom edge
 * upward, in the colour the sample shows `inset` pixels in from its
 * bottom-left corner: a run of bare canvas beneath what the rectangle
 * draws. `null` when column `x` starts in another colour.
 */
export function bareRunAtBottom(
  pixels: Pixels,
  x: number,
  inset: number,
): { top: number; bottom: number } | null {
  const at = (px: number, py: number) => (py * pixels.width + px) * 4;
  const bottom = pixels.height - 1 - inset;
  const bare = at(inset, bottom);
  if (differs(pixels.data, at(x, bottom), pixels.data, bare)) {
    return null;
  }
  let top = bottom;
  while (top > 0 && !differs(pixels.data, at(x, top - 1), pixels.data, bare)) {
    top -= 1;
  }
  return { top, bottom };
}

/** How many pixels of two same-sized samples differ by more than noise. */
export function changedPixels(a: Pixels, b: Pixels): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("the samples differ in size");
  }
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    if (differs(a.data, i, b.data, i)) {
      changed += 1;
    }
  }
  return changed;
}

/**
 * The centre, in the sample's pixel coordinates, of the pixels whose colour
 * `matches` accepts, and how many there are; `null` when none does.
 */
export function centroidWhere(
  pixels: Pixels,
  matches: (r: number, g: number, b: number) => boolean,
): { x: number; y: number; count: number } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < pixels.height; y += 1) {
    for (let x = 0; x < pixels.width; x += 1) {
      const i = (y * pixels.width + x) * 4;
      if (matches(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!)) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }
  return count === 0 ? null : { x: sumX / count, y: sumY / count, count };
}
