import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { bootAuthoring, loadMainPreset, waitForMainFaceReady } from "./helpers";
import { closeMenus, downloadedGlbGraphs, exportGlb } from "./profile-helpers";

/** Open File > Skills so its per-skill items are visible. */
async function openSkillsSubmenu(page: Page): Promise<void> {
  // Park the pointer first: the submenu opens on hover, and a pointer already
  // resting on the trigger's coordinates produces no enter event.
  await page.mouse.move(5, 5);
  await page.getByTestId("app-menu-file").click();
  await page.getByTestId("app-menu-file-skills").hover();
  const item = page.getByTestId("app-menu-file-skill-look_at");
  try {
    await item.waitFor({ state: "visible", timeout: 2000 });
  } catch {
    // Hover-open is timing-sensitive; ArrowRight opens the active submenu
    // through the menu's keyboard protocol.
    await page.keyboard.press("ArrowRight");
    await item.waitFor({ state: "visible", timeout: 5000 });
  }
}

/** Toggle the look_at skill checkbox (embed when unchecked, remove when
 * checked) and close the menu. */
async function toggleLookAtSkill(page: Page): Promise<void> {
  await openSkillsSubmenu(page);
  await page.getByTestId("app-menu-file-skill-look_at").click();
  await closeMenus(page);
}

test("skill embed and edition round-trip through GLB export @workflow", async ({
  page,
}) => {
  // Surface in-app failures (e.g. the skills fetch erroring) in the test log.
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      console.log(`[browser:${message.type()}]`, message.text());
    }
  });
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");

  // Pin the look_at skill from File > Skills: the exported GLB embeds its
  // fragment under the stable id, as the face's override of the shipped
  // behavior.
  await toggleLookAtSkill(page);
  const graphs = await downloadedGlbGraphs(await exportGlb(page));
  const embedded = graphs.find((graph) => graph.id === "skill::look_at");
  expect(embedded, "skill::look_at embedded in the GLB").toBeTruthy();
  expect(embedded?.kind).toBe("skill");
  // The real fragment, not a stub: the policy/gaze/lifecycle nodes.
  expect(embedded?.spec?.nodes?.length ?? 0).toBeGreaterThan(10);
  // Fragments are face-independent: the placeholder task inputs embed as-is.
  const paths = (embedded?.spec?.nodes ?? [])
    .map((node) => node.params?.path)
    .filter(Boolean);
  expect(paths).toContain("task/policy");

  // The skill-editor session borrows the graph editor and applies back into
  // the embedded copy.
  await openSkillsSubmenu(page);
  await page.getByTestId("app-menu-file-skill-edit-look_at").click();
  await closeMenus(page);
  await expect(page.getByTestId("skill-editor-banner")).toBeVisible();
  await page.getByTestId("skill-editor-apply").click();
  await expect(page.getByTestId("skill-editor-banner")).toBeHidden();

  // Re-importing the exported GLB keeps the skill (the carried entry
  // survives the load → export round trip), shown checked in the menu.
  const download = await exportGlb(page);
  const glbPath = await download.path();
  await page.getByTestId("app-import-file-input").setInputFiles(glbPath!);
  await waitForMainFaceReady(page);
  const reGraphs = await downloadedGlbGraphs(await exportGlb(page));
  expect(
    reGraphs.find((graph) => graph.id === "skill::look_at"),
    "the embedded skill survives re-import and re-export",
  ).toBeTruthy();

  // Unchecking removes it from the next export.
  await toggleLookAtSkill(page);
  const withoutSkill = await downloadedGlbGraphs(await exportGlb(page));
  expect(
    withoutSkill.find((graph) => graph.id === "skill::look_at"),
  ).toBeFalsy();
});
