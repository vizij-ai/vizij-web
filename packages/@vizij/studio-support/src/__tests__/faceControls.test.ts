import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  mapNormalizedControlValue,
  resolveFaceControls,
  type VizijAssetBundle,
} from "../index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../../../../..");

function parseGlbJson(buffer: Buffer) {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const view = new DataView(arrayBuffer);
  const chunkLength = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(arrayBuffer, 20, chunkLength);
  return JSON.parse(new TextDecoder().decode(jsonBytes));
}

function loadAssetBundleFixture(relativePath: string): VizijAssetBundle {
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const gltf = parseGlbJson(readFileSync(absolutePath));
  const bundle =
    (gltf.nodes ?? []).find(
      (node: { extensions?: { VIZIJ_bundle?: unknown } }) =>
        node?.extensions?.VIZIJ_bundle,
    )?.extensions?.VIZIJ_bundle ?? null;
  const rigGraph = (bundle?.graphs ?? []).find(
    (entry: { kind?: string }) => entry.kind === "rig",
  );
  const inputMetadata = rigGraph?.spec?.metadata?.vizij?.inputs ?? [];

  return {
    glb: {
      kind: "world",
      world: {},
      animatables: {},
      bundle,
    },
    pose: {
      config: bundle?.poses?.config,
    },
    rig: {
      id: rigGraph?.id ?? "rig",
      spec: rigGraph?.spec,
      inputMetadata,
    },
    bundle,
  };
}

function getInputMetadata(bundle: VizijAssetBundle, path: string) {
  return (bundle.rig?.inputMetadata ?? []).find((entry) => entry.path === path);
}

describe("studio support face controls", () => {
  it("resolves Quori gaze controls from the actual extended export", () => {
    const assetBundle = loadAssetBundleFixture(
      "apps/vizij-authoring/public/assets/Quori_Current_Extended.glb",
    );

    const controls = resolveFaceControls(assetBundle);

    expect(controls.faceId).toBe("quori_latest");
    expect(controls.gazeSource).toBe("standard-vizij");
    expect(controls.eyes.leftX?.path).toBe(
      "rig/quori_latest/standard/vizij/left_eye/pos/x",
    );
    expect(controls.eyes.rightY?.path).toBe(
      "rig/quori_latest/standard/vizij/right_eye/pos/y",
    );
    expect(controls.blink?.path).toBe("rig/quori_latest/lids/blink");
  });

  it("resolves Hugo gaze controls from the actual extended export", () => {
    const assetBundle = loadAssetBundleFixture(
      "apps/vizij-authoring/public/assets/Hugo_Current_Extended.glb",
    );
    const leftXMetadata = getInputMetadata(
      assetBundle,
      "/propsrig/l_eye/translation/x",
    );
    const blinkMetadata = getInputMetadata(assetBundle, "/lids/blink");

    const controls = resolveFaceControls(assetBundle);

    expect(controls.faceId).toBe("hugo_latest_blender_export");
    expect(controls.gazeSource).toBe("propsrig");
    expect(controls.eyes.leftX?.path).toBe(
      "rig/hugo_latest_blender_export/propsrig/l_eye/translation/x",
    );
    expect(leftXMetadata).toBeTruthy();
    expect(controls.eyes.leftX?.defaultValue).toBeCloseTo(
      leftXMetadata?.defaultValue ?? 0,
      6,
    );
    expect(controls.eyes.leftX?.min).toBeCloseTo(
      leftXMetadata?.range?.min ?? 0,
      6,
    );
    expect(controls.eyes.leftX?.max).toBeCloseTo(
      leftXMetadata?.range?.max ?? 0,
      6,
    );
    expect(blinkMetadata).toBeTruthy();
    expect(controls.blinkSource).toBe("lids");
    expect(controls.blink?.path).toBe(
      "rig/hugo_latest_blender_export/lids/blink",
    );
  });

  it("maps normalized values around the authored default and range", () => {
    const assetBundle = loadAssetBundleFixture(
      "apps/vizij-authoring/public/assets/Hugo_Current_Extended.glb",
    );
    const controls = resolveFaceControls(assetBundle);
    const leftX = controls.eyes.leftX;

    expect(leftX).toBeTruthy();
    if (!leftX) {
      throw new Error("Expected Hugo leftX control");
    }

    expect(mapNormalizedControlValue(leftX, 0)).toBeCloseTo(
      leftX.defaultValue,
      6,
    );
    expect(mapNormalizedControlValue(leftX, -1)).toBeCloseTo(leftX.min, 6);
    expect(mapNormalizedControlValue(leftX, 1)).toBeCloseTo(leftX.max, 6);
  });
});
