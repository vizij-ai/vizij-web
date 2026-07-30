import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import type { Download, Page } from "@playwright/test";
import { expectDownload, openExportDialog } from "./helpers";

/** The parsed JSON chunk of a GLB (12-byte header, chunk 0 is JSON). */
export function glbJson(buffer: Buffer): Record<string, unknown> {
  expect(buffer.readUInt32LE(0)).toBe(0x46546c67); // "glTF"
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.readUInt32LE(16)).toBe(0x4e4f534a); // "JSON"
  return JSON.parse(
    buffer.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as Record<string, unknown>;
}

export interface BundleGraphEntry {
  id?: string;
  kind?: string;
  spec?: { nodes?: { type?: string; params?: { path?: string } }[] };
}

/** The `VIZIJ_bundle.graphs` of a GLB document (root or node extension). */
export function bundleGraphs(
  gltf: Record<string, unknown>,
): BundleGraphEntry[] {
  type WithExtensions = { extensions?: { VIZIJ_bundle?: { graphs?: [] } } };
  const root = gltf as WithExtensions;
  const nodes = (gltf.nodes ?? []) as WithExtensions[];
  const bundle =
    root.extensions?.VIZIJ_bundle ??
    nodes.map((node) => node.extensions?.VIZIJ_bundle).find(Boolean);
  expect(bundle, "the exported GLB carries a VIZIJ_bundle").toBeTruthy();
  return bundle?.graphs ?? [];
}

/** Open File > Standard Profiles so its per-profile items are visible. */
export async function openStandardProfilesSubmenu(page: Page): Promise<void> {
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

/** Close whatever menu levels are open so the next menu click opens. */
export async function closeMenus(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(
    page.getByTestId("app-menu-file-standard-profiles"),
  ).toBeHidden();
}

/** Toggle the ROS4HRI profile checkbox (import when unchecked, remove when
 * checked) and close the menu. */
export async function toggleRos4hriProfile(page: Page): Promise<void> {
  await openStandardProfilesSubmenu(page);
  await page.getByTestId("app-menu-file-standard-profile-ros4hri").click();
  await closeMenus(page);
}

/** Export the open face as GLB through the export dialog. */
export async function exportGlb(page: Page): Promise<Download> {
  await openExportDialog(page);
  const download = await expectDownload(page, async () => {
    await page.getByTestId("export-glb-button").click();
  });
  return download;
}

/** The exported GLB's bundle graphs. */
export async function downloadedGlbGraphs(
  download: Download,
): Promise<BundleGraphEntry[]> {
  const path = await download.path();
  if (!path) {
    throw new Error("Expected the exported GLB to resolve to a local file");
  }
  return bundleGraphs(glbJson(await readFile(path)));
}
