import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootAuthoring,
  ensureInspectorPanelVisible,
  loadMainPreset,
  waitForMainFaceReady,
} from "./helpers";
import { PRIMITIVES, primitivesGlb } from "./primitivesFixture";
import { centroidWhere, samplePage } from "./viewportPixels";
import { VIEWPORT_POLL_TIMEOUT_MS, viewportMiddle } from "./viewportRegion";

/**
 * An edit of a value the face shows in place leaves the face loaded; an edit
 * of the face's structure reloads it from new bytes.
 *
 * A load shows on the page as the main face's slot losing
 * `data-vizij-ready`, or its runtime status leaving `ready`; the specs
 * record both on every animation frame from before the edit.
 */

test.describe.configure({ timeout: 480_000 });

const MAGENTA = (r: number, g: number, b: number) =>
  r > 120 && b > 120 && g < 90;
const GREEN = (r: number, g: number, b: number) => g > 120 && r < 90 && b < 90;

/** Start recording the main face's load state, and mark the edit's start. */
async function recordLoads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const record = {
      start: performance.now(),
      states: [] as { at: number; ready: boolean }[],
    };
    (window as unknown as { faceLoads: typeof record }).faceLoads = record;
    let last: boolean | null = null;
    const watch = () => {
      const slot = document.querySelector('[data-vizij-id="authoring-main"]');
      const status = document.querySelector(
        '[data-testid="main-runtime-status"]',
      );
      const ready =
        slot?.getAttribute("data-vizij-ready") === "true" &&
        (status?.textContent ?? "").startsWith("runtime: ready");
      if (ready !== last) {
        record.states.push({ at: performance.now() - record.start, ready });
        last = ready;
      }
      requestAnimationFrame(watch);
    };
    watch();
  });
}

/** The recorded load state: whether the face left ready since the mark, and
 * when it was ready again after the last time it did, in ms from the mark. */
async function loads(
  page: Page,
): Promise<{ reloaded: boolean; readyAgainMs: number | null }> {
  const states = await page.evaluate(
    () =>
      (
        window as unknown as {
          faceLoads: { states: { at: number; ready: boolean }[] };
        }
      ).faceLoads.states,
  );
  const reloaded = states.some((state) => !state.ready);
  const last = states[states.length - 1];
  return {
    reloaded,
    readyAgainMs: reloaded && last?.ready ? last.at : null,
  };
}

async function selectElement(page: Page, name: string): Promise<void> {
  await page.getByRole("treeitem", { name }).click();
  await expect(page.getByRole("treeitem", { name })).toHaveAttribute(
    "aria-selected",
    "true",
  );
}

/** The centre of the shape drawn in `hue`, in the viewport sample. */
async function centreOf(
  page: Page,
  hue: (r: number, g: number, b: number) => boolean,
) {
  return centroidWhere(await samplePage(page, await viewportMiddle(page)), hue);
}

test("a static value edit shows in place, and a deletion reloads the face @workflow", async ({
  page,
}, testInfo) => {
  await bootAuthoring(page);
  const glb = testInfo.outputPath("primitives.glb");
  await writeFile(glb, primitivesGlb());
  await page.getByTestId("app-import-file-input").setInputFiles(glb);
  await waitForMainFaceReady(page);
  const orientation = page.getByRole("button", {
    name: "Orientation Looks Correct",
  });
  if (await orientation.isVisible().catch(() => false)) {
    await orientation.click();
  }
  await expect
    .poll(async () => (await centreOf(page, MAGENTA)) !== null, {
      message: "the ellipse is drawn",
      timeout: VIEWPORT_POLL_TIMEOUT_MS,
    })
    .toBe(true);
  const before = (await centreOf(page, MAGENTA))!;

  await selectElement(page, PRIMITIVES.ellipse.name);
  await ensureInspectorPanelVisible(page);
  const x = page
    .locator('[title="Toggle Position edit controls"]')
    .locator("input[type=number]")
    .first();
  await recordLoads(page);
  // From -100 to -40: towards the face's centre, within its bounds.
  await x.fill("-40");
  await x.press("Enter");
  await expect
    .poll(async () => ((await centreOf(page, MAGENTA))?.x ?? 0) - before.x, {
      message: "the ellipse moves right",
      timeout: VIEWPORT_POLL_TIMEOUT_MS,
    })
    .toBeGreaterThan(10);
  expect(
    (await loads(page)).reloaded,
    "the face stays loaded through a value edit",
  ).toBe(false);

  await selectElement(page, PRIMITIVES.rectangle.name);
  await recordLoads(page);
  await page.getByTitle("Delete Selection").click();
  await expect
    .poll(async () => (await centreOf(page, GREEN)) === null, {
      message: "the deleted rectangle is no longer drawn",
      timeout: VIEWPORT_POLL_TIMEOUT_MS,
    })
    .toBe(true);
  await expect
    .poll(async () => (await loads(page)).readyAgainMs !== null, {
      message: "the face reloads, and is ready again",
      timeout: VIEWPORT_POLL_TIMEOUT_MS,
    })
    .toBe(true);
  expect(
    ((await centreOf(page, MAGENTA))?.x ?? 0) - before.x,
    "the reloaded face carries the value edited in place",
  ).toBeGreaterThan(10);
});

test("a structural edit of Quori reloads it; the load time is reported @workflow", async ({
  page,
}, testInfo) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await selectElement(page, "Background");
  await recordLoads(page);
  await page.getByTitle("Delete Selection").click();
  await expect
    .poll(async () => (await loads(page)).readyAgainMs, {
      message: "the face reloads, and is ready again",
      timeout: VIEWPORT_POLL_TIMEOUT_MS,
    })
    .not.toBeNull();
  const { readyAgainMs } = await loads(page);
  // The app measures each export of the world (`MAIN_FACE_EXPORT_MEASURE`).
  const exportMs = await page.evaluate(() => {
    const exports = performance.getEntriesByName(
      "vizij-authoring:main-face-export",
    );
    return exports[exports.length - 1]?.duration ?? null;
  });
  // From the click to the reloaded face ready: the export of the world, then
  // the `loadVizij` of its bytes up to the face's first frame.
  const measured = {
    totalMs: Math.round(readyAgainMs!),
    exportMs: exportMs === null ? null : Math.round(exportMs),
  };
  testInfo.annotations.push({
    type: "structural-edit-load",
    description: JSON.stringify(measured),
  });
  console.log(`structural edit to ready: ${JSON.stringify(measured)}`);
});
