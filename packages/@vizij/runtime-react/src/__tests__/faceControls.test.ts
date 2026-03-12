import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { VizijAssetBundle } from "../types";
import {
  mapNormalizedControlValue,
  resolveFaceControls,
} from "../utils/faceControls";

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
    (gltf.nodes ?? []).find((node: any) => node?.extensions?.VIZIJ_bundle)
      ?.extensions?.VIZIJ_bundle ?? null;
  const rigGraph = (bundle?.graphs ?? []).find(
    (entry: any) => entry.kind === "rig",
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

describe("faceControls", () => {
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

    const controls = resolveFaceControls(assetBundle);

    expect(controls.faceId).toBe("hugo_latest_blender_export");
    expect(controls.gazeSource).toBe("propsrig");
    expect(controls.eyes.leftX?.path).toBe(
      "rig/hugo_latest_blender_export/propsrig/l_eye/translation/x",
    );
    expect(controls.eyes.leftX?.defaultValue).toBeCloseTo(-3.3484723568, 6);
    expect(controls.eyes.leftX?.min).toBeCloseTo(-6.6969447136, 6);
    expect(controls.eyes.leftX?.max).toBeCloseTo(0, 6);
    expect(controls.blink?.path).toBe("rig/hugo_latest_blender_export/blink");
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
