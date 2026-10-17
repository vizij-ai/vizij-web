import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  bootAuthoring,
  expectDownload,
  FACE_IMPORT_TIMEOUT_MS,
  loadMainPreset,
} from "./helpers";

/**
 * Save waits until the face is in the editor, and while it waits it says why.
 * A face whose rig graph cannot be built never finishes loading, so Save stays
 * disabled and names the cause.
 */

test.describe.configure({ timeout: 360_000 });

type GlbJson = {
  nodes?: Array<{
    extensions?: {
      VIZIJ_bundle?: {
        graphs?: Array<{
          kind?: string;
          spec?: {
            metadata?: {
              vizij?: { bindings?: Array<{ expression?: string }> };
            };
          };
        }>;
      };
    };
  }>;
};

async function saveGlb(page: Page): Promise<Buffer> {
  const save = page.getByTestId("app-save-button");
  await expect(save).toBeEnabled({ timeout: FACE_IMPORT_TIMEOUT_MS });
  const download = await expectDownload(page, async () => {
    await save.click();
  });
  const path = await download.path();
  if (!path) {
    throw new Error("the saved GLB did not resolve to a local path");
  }
  return readFile(path);
}

/** `glb` with one of its rig graph's binding expressions made unparseable. */
function breakRigGraph(glb: Buffer): Buffer {
  const HEADER = 12;
  const jsonLength = glb.readUInt32LE(HEADER);
  const jsonStart = HEADER + 8;
  const json = JSON.parse(
    glb.subarray(jsonStart, jsonStart + jsonLength).toString("utf8"),
  ) as GlbJson;
  const rig = json.nodes
    ?.flatMap((node) => node.extensions?.VIZIJ_bundle?.graphs ?? [])
    .find((graph) => graph.kind === "rig");
  const binding = rig?.spec?.metadata?.vizij?.bindings?.[0];
  if (!binding) {
    throw new Error("the saved GLB carried no rig graph binding to break");
  }
  binding.expression = "(((";

  const edited = Buffer.from(JSON.stringify(json), "utf8");
  const padded = Buffer.concat([
    edited,
    Buffer.alloc((4 - (edited.byteLength % 4)) % 4, 0x20),
  ]);
  const rest = glb.subarray(jsonStart + jsonLength);
  const out = Buffer.concat([
    glb.subarray(0, HEADER),
    Buffer.alloc(8),
    padded,
    rest,
  ]);
  out.writeUInt32LE(padded.byteLength, HEADER);
  out.write("JSON", HEADER + 4, "ascii");
  out.writeUInt32LE(out.byteLength, 8);
  return out;
}

test("Save says why it is disabled when the face's rig graph cannot be built @workflow", async ({
  page,
}) => {
  await bootAuthoring(page);
  await loadMainPreset(page, "quori:latest");
  const broken = breakRigGraph(await saveGlb(page));

  // Skip the import review: it would hold the load on a question instead.
  await page.getByTestId("app-menu-file").dispatchEvent("pointerdown", {
    button: 0,
  });
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("app-menu-file-import-skip-checks").click();
  await (
    await chooser
  ).setFiles({
    name: "broken-rig.glb",
    mimeType: "model/gltf-binary",
    buffer: broken,
  });

  const save = page.getByTestId("app-save-button");
  const reason = /^The face's rig graph has a fatal issue: /;
  await expect(page.getByTestId("app-save")).toHaveAttribute("title", reason, {
    timeout: FACE_IMPORT_TIMEOUT_MS,
  });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAccessibleDescription(reason);
});
