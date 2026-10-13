import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset, waitForMainFaceReady } from "./helpers";
import { PRIMITIVES, primitivesGlb } from "./primitivesFixture";
import { centroidWhere, samplePage } from "./viewportPixels";
import {
  VIEWPORT_PORT_PENDING,
  VIEWPORT_PORT_PENDING_REASON,
} from "./viewportPort";
import { drawnFace, pagePoint, viewportMiddle } from "./viewportRegion";

/**
 * A press on the viewport selects the element under the pointer, and a press
 * on no element clears the selection. The selection shows in the Face
 * Elements tree. The specs find where to press from the pixels the viewport
 * draws, so they hold for any renderer that draws the face where its
 * framing puts it.
 */

test.describe.configure({ timeout: 240_000 });

async function selectedElements(page: Page): Promise<string[]> {
  return page
    .locator('[role="treeitem"][aria-selected="true"]')
    .evaluateAll((items) =>
      items.map((item) => item.getAttribute("aria-label") ?? ""),
    );
}

async function press(page: Page, point: { x: number; y: number }) {
  await page.mouse.click(point.x, point.y);
}

/** A point in the middle of the viewport the face does not draw on. */
function besideFace(
  middle: { x: number; y: number; width: number; height: number },
  face: { x: number; y: number; width: number; height: number },
): { x: number; y: number } {
  const below = face.y + face.height;
  const bottom = middle.y + middle.height;
  if (bottom - below > 8) {
    return { x: face.x + face.width / 2, y: (below + bottom) / 2 };
  }
  const right = face.x + face.width;
  const end = middle.x + middle.width;
  if (end - right > 8) {
    return { x: (right + end) / 2, y: face.y + face.height / 2 };
  }
  throw new Error("the face fills the middle of the viewport");
}

test("a press on a face element selects it, and a press beside the face clears the selection @smoke", async ({
  page,
}) => {
  test.fail(VIEWPORT_PORT_PENDING, VIEWPORT_PORT_PENDING_REASON);
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  const face = await drawnFace(page);
  await press(page, {
    x: face.x + face.width / 2,
    y: face.y + face.height / 2,
  });
  await expect
    .poll(() => selectedElements(page), {
      message: "the press at the face's centre selects its inner face",
    })
    .toEqual(["InnerFace"]);

  await press(page, besideFace(await viewportMiddle(page), face));
  await expect
    .poll(() => selectedElements(page), {
      message: "a press on no element clears the selection",
    })
    .toEqual([]);
});

test("a press on an ellipse or a rectangle selects it @smoke", async ({
  page,
}, testInfo) => {
  test.fail(VIEWPORT_PORT_PENDING, VIEWPORT_PORT_PENDING_REASON);
  await bootAuthoring(page);
  const glb = testInfo.outputPath("primitives.glb");
  await writeFile(glb, primitivesGlb());
  await page.getByTestId("app-import-file-input").setInputFiles(glb);
  await waitForMainFaceReady(page);
  // A face with no scene rotation controls asks once whether it faces the
  // camera; this one is drawn in the XY plane as authored.
  const orientation = page.getByRole("button", {
    name: "Orientation Looks Correct",
  });
  if (await orientation.isVisible().catch(() => false)) {
    await orientation.click();
  }

  const middle = await viewportMiddle(page);
  const shapes = [
    {
      name: PRIMITIVES.ellipse.name,
      hue: (r: number, g: number, b: number) => r > 120 && b > 120 && g < 90,
    },
    {
      name: PRIMITIVES.rectangle.name,
      hue: (r: number, g: number, b: number) => g > 120 && r < 90 && b < 90,
    },
  ];
  for (const shape of shapes) {
    let centre: { x: number; y: number } | null = null;
    await expect
      .poll(
        async () => {
          const pixels = await samplePage(page, middle);
          const found = centroidWhere(pixels, shape.hue);
          centre = found ? pagePoint(middle, pixels, found) : null;
          return found !== null;
        },
        { message: `${shape.name} is drawn in its fill colour` },
      )
      .toBe(true);
    await press(page, centre!);
    await expect
      .poll(() => selectedElements(page), {
        message: `the press on ${shape.name} selects it`,
      })
      .toEqual([shape.name]);
  }
});
