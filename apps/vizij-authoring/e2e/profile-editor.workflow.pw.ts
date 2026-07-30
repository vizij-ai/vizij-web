import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { bootAuthoring, loadMainPreset } from "./helpers";
import {
  closeMenus,
  downloadedGlbGraphs,
  exportGlb,
  openStandardProfilesSubmenu,
  toggleRos4hriProfile,
} from "./profile-helpers";

// VIZ-93's in-editor edition: the embedded profile opens in the graph
// editor, a UI edit applies back to the embedded copy (never to a program),
// and the exported GLB carries the edited graph.
test("embedded profile edits in the graph editor apply to the bundle @workflow", async ({
  page,
}) => {
  page.on("console", (message) => {
    if (message.type() === "error") {
      console.log(`[browser:error]`, message.text());
    }
  });
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  await toggleRos4hriProfile(page);

  // Shrink the embedded copy to a two-node mapping first (the JSON loop from
  // the previous slice), so the editor session is deterministic to drive.
  // Two mappings off one input, so severing one leaves a live graph (the
  // export builder prunes fully unwired endpoints).
  const tiny = {
    nodes: [
      {
        id: "v",
        type: "input",
        params: { path: "standard/ros4hri/expression/valence", value: 0.0 },
      },
      {
        id: "o",
        type: "output",
        params: { path: "standard/vizij/expression/happy" },
      },
      {
        id: "o2",
        type: "output",
        params: { path: "standard/vizij/expression/sad" },
      },
    ],
    edges: [
      { from: { node_id: "v" }, to: { node_id: "o", input: "in" } },
      { from: { node_id: "v" }, to: { node_id: "o2", input: "in" } },
    ],
  };
  const dir = await mkdtemp(path.join(tmpdir(), "vizij-profile-editor-"));
  const tinyPath = path.join(dir, "ros4hri.json");
  await writeFile(tinyPath, JSON.stringify(tiny));
  await openStandardProfilesSubmenu(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByTestId("app-menu-file-standard-profile-replace-ros4hri")
    .click();
  await (await chooserPromise).setFiles(tinyPath);
  await closeMenus(page);

  // Open the embedded copy in the graph editor: the session banner shows and
  // the canvas holds exactly the profile's two nodes.
  await openStandardProfilesSubmenu(page);
  await page.getByTestId("app-menu-file-standard-profile-edit-ros4hri").click();
  await closeMenus(page);
  await expect(page.getByTestId("profile-editor-banner")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);

  // A UI edit: the profile's input/output endpoints are fixed (deletable:
  // false), so the deterministic edit is severing a mapping edge — the one
  // into the "sad" output.
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.getByTestId("rf__edge-e-v-o2-out-input").click({ force: true });
  await page.keyboard.press("Backspace");
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);

  // Apply: the session ends and the bundle carries the edited copy.
  await page.getByTestId("profile-editor-apply").click();
  await expect(page.getByTestId("profile-editor-banner")).toBeHidden();
  const graphs = await downloadedGlbGraphs(await exportGlb(page));
  const embedded = graphs.find((graph) => graph.id === "standard::ros4hri");
  expect(embedded, "the embedded profile survives the edit").toBeTruthy();
  const editedSpec = embedded?.spec as {
    nodes?: { type?: string; params?: { path?: string } }[];
    edges?: unknown[];
  };
  // One mapping survives, and it is the happy one.
  expect(editedSpec?.edges?.length).toBe(1);
  const outputPaths = (editedSpec?.nodes ?? [])
    .filter((node) => node.type === "output")
    .map((node) => node.params?.path);
  expect(outputPaths).toContain(
    `rig/${"quori_latest"}/standard/vizij/expression/happy`,
  );
});
