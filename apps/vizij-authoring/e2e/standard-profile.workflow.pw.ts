import { expect, test } from "@playwright/test";
import { bootAuthoring, loadMainPreset, waitForMainFaceReady } from "./helpers";
import {
  closeMenus,
  downloadedGlbGraphs,
  exportGlb,
  openStandardProfilesSubmenu,
  toggleRos4hriProfile,
} from "./profile-helpers";

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
  await closeMenus(page);
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
