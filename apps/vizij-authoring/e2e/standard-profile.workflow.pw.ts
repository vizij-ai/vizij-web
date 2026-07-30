import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  loadMainPreset,
  openExportDialog,
  waitForMainFaceReady,
} from "./helpers";

/** The parsed JSON chunk of a GLB (12-byte header, chunk 0 is JSON). */
function glbJson(buffer: Buffer): Record<string, unknown> {
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.readUInt32LE(16)).toBe(0x4e4f534a); // "JSON"
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as Record<string, unknown>;
}

/** The `VIZIJ_bundle.graphs` of a GLB document (root or node extension). */
function bundleGraphs(
  gltf: Record<string, unknown>,
): { id?: string; kind?: string; spec?: { nodes?: unknown[] } }[] {
  type WithExtensions = { extensions?: { VIZIJ_bundle?: { graphs?: [] } } };
  const root = gltf as WithExtensions;
  const nodes = (gltf.nodes ?? []) as WithExtensions[];
  const bundle =
    root.extensions?.VIZIJ_bundle ??
    nodes.map((node) => node.extensions?.VIZIJ_bundle).find(Boolean);
  expect(bundle, "the exported GLB carries a VIZIJ_bundle").toBeTruthy();
  return bundle?.graphs ?? [];
}

async function openStandardProfilesSubmenu(page: Page): Promise<void> {
  // Park the pointer first: the submenu opens on hover, and a pointer already
  // resting on the trigger's coordinates produces no enter event.
  await page.mouse.move(5, 5);
  await page.getByTestId("app-menu-file").click();
  await page.getByTestId("app-menu-file-standard-profiles").hover();
  const item = page.getByTestId("app-menu-file-standard-profile-ros4hri");
  try {
    await item.waitFor({ state: "visible", timeout: 2000 });
  } catch {
    // Hover-open is timing-sensitive; ArrowRight opens the active submenu
    // through the menu's keyboard protocol.
    await page.keyboard.press("ArrowRight");
    await item.waitFor({ state: "visible", timeout: 5000 });
  }
}

async function toggleRos4hriProfile(page: Page): Promise<void> {
  await openStandardProfilesSubmenu(page);
  await page.getByTestId("app-menu-file-standard-profile-ros4hri").click();
  // Checkbox items keep the menu open; Escape closes the submenu, then the
  // menu, so the next menu click opens instead of toggling it shut.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(
    page.getByTestId("app-menu-file-standard-profiles"),
  ).toBeHidden();
}

async function exportGlb(page: Page): Promise<Download> {
  await openExportDialog(page);
  const download = await expectDownload(page, async () => {
    await page.getByTestId("export-glb-button").click();
  });
  return download;
}

async function downloadedGlbGraphs(download: Download) {
  const path = await download.path();
  if (!path) {
    throw new Error("Expected the exported GLB to resolve to a local file");
  }
  return bundleGraphs(glbJson(await readFile(path)));
}

test("standard profile import round-trips through GLB export @workflow", async ({
  page,
}) => {
  // Surface in-app failures (e.g. the profile fetch erroring) in the test log.
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser:${message.type()}]`, message.text());
    }
  });
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  // Opt the face into ROS4HRI from File > Standard Profiles.
  await toggleRos4hriProfile(page);

  // The exported GLB embeds the profile under its stable id.
  const graphs = await downloadedGlbGraphs(await exportGlb(page));
  const embedded = graphs.find((graph) => graph.id === "standard::ros4hri");
  expect(embedded, "standard::ros4hri embedded in the GLB").toBeTruthy();
  expect(embedded?.kind).toBe("standard-profile");
  // The real profile graph, not a stub: hundreds of mapping nodes.
  expect(embedded?.spec?.nodes?.length ?? 0).toBeGreaterThan(100);

  // Re-importing the exported GLB keeps the profile (the carried entry
  // survives the load → export round trip), shown checked in the menu.
  const download = await exportGlb(page);
  const glbPath = await download.path();
  await page.getByTestId("app-import-file-input").setInputFiles(glbPath!);
  await waitForMainFaceReady(page);
  await openStandardProfilesSubmenu(page);
  await expect(
    page.getByTestId("app-menu-file-standard-profile-ros4hri"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const reGraphs = await downloadedGlbGraphs(await exportGlb(page));
  expect(
    reGraphs.find((graph) => graph.id === "standard::ros4hri"),
    "the embedded profile survives re-import and re-export",
  ).toBeTruthy();

  // Unchecking removes it from the next export.
  await toggleRos4hriProfile(page);
  const withoutProfile = await downloadedGlbGraphs(await exportGlb(page));
  expect(
    withoutProfile.find((graph) => graph.id === "standard::ros4hri"),
  ).toBeFalsy();
});
