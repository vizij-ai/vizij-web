import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { composeFace, startRuntime } from "@vizij/runtime";
import { bootAuthoring, expectDownload, loadMainPreset } from "./helpers";
import {
  closeMenus,
  exportGlb,
  glbJson,
  openStandardProfilesSubmenu,
  toggleRos4hriProfile,
} from "./profile-helpers";

// The full VIZ-93 loop, autonomously: import the profile, export it as
// canonical JSON, edit that JSON (as a human contributor would), replace the
// embedded copy from it, export the GLB — and deploy that GLB on the wasm
// runtime to verify the edited mapping actually drives the face.
test("profile JSON round-trip: export, edit, replace, deploy @workflow", async ({
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

  // Export as JSON: the canonical, face-independent form — the full built-in
  // graph with the rig prefix stripped back out of the written paths.
  await openStandardProfilesSubmenu(page);
  const jsonDownload = await expectDownload(page, async () => {
    await page
      .getByTestId("app-menu-file-standard-profile-export-ros4hri")
      .click();
  });
  await closeMenus(page);
  const canonical = JSON.parse(
    await readFile((await jsonDownload.path())!, "utf8"),
  ) as { nodes: { type?: string; params?: { path?: string } }[]; edges: [] };
  expect(canonical.nodes.length).toBeGreaterThan(100);
  expect(canonical.edges.length).toBeGreaterThan(100);
  const outputs = canonical.nodes.filter((node) => node.type === "output");
  expect(outputs.length).toBeGreaterThan(0);
  for (const node of outputs) {
    expect(
      node.params?.path?.startsWith("rig/"),
      `unprefixed output path, got ${node.params?.path}`,
    ).toBeFalsy();
  }

  // "Edit" the JSON as a contributor would — here down to a minimal mapping
  // the built-in never produces: valence rides verbatim onto happy.
  const edited = {
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
    ],
    edges: [{ from: { node_id: "v" }, to: { node_id: "o", input: "in" } }],
  };
  const editedDir = await mkdtemp(path.join(tmpdir(), "vizij-profile-"));
  const editedPath = path.join(editedDir, "ros4hri.json");
  await writeFile(editedPath, JSON.stringify(edited));

  // Replace the embedded copy from the edited JSON via the real picker flow.
  await openStandardProfilesSubmenu(page);
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByTestId("app-menu-file-standard-profile-replace-ros4hri")
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles(editedPath);
  await closeMenus(page);

  // The exported GLB carries the edited copy, rig-prefixed on the way in.
  const glbDownload = await exportGlb(page);
  const gltf = glbJson(await readFile((await glbDownload.path())!));
  type WithExtensions = {
    extensions?: {
      VIZIJ_bundle?: {
        graphs?: { id?: string; spec?: typeof edited }[];
        metadata?: { faceId?: string };
      };
    };
  };
  const bundle = ((gltf.nodes ?? []) as WithExtensions[])
    .map((node) => node.extensions?.VIZIJ_bundle)
    .find(Boolean);
  const faceId = bundle?.metadata?.faceId;
  expect(faceId, "the exported bundle names its face").toBeTruthy();
  const embedded = bundle?.graphs?.find(
    (graph) => graph.id === "standard::ros4hri",
  );
  expect(embedded?.spec?.nodes.length).toBe(2);
  expect(embedded?.spec?.nodes[1]?.params?.path).toBe(
    `rig/${faceId}/standard/vizij/expression/happy`,
  );

  // Deploy the authored GLB on the wasm runtime: composeFace applies the
  // embedded-overrides-built-in precedence, and the edited mapping drives
  // the face — the built-in would have one-hotted "sad" (happy ≈ 0).
  const spec = (await composeFace(gltf, { program: "none" })) as object;
  const runtime = await startRuntime();
  await runtime.loadGraph(spec);
  runtime.setValue("standard/ros4hri/expression/name", { text: "sad" });
  runtime.setValue("standard/ros4hri/expression/valence", { f32: 0.8 });
  for (let i = 0; i < 5; i += 1) {
    runtime.step(16);
  }
  const happyPath = `rig/${faceId}/standard/vizij/expression/happy`;
  const happy = runtime.readValues([happyPath])[happyPath] as {
    f32?: number;
  } | null;
  expect(
    happy && Math.abs((happy.f32 ?? 0) - 0.8) < 1e-6,
    `edited mapping deployed, got ${JSON.stringify(happy)}`,
  ).toBeTruthy();
});
