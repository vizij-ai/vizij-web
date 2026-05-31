import { describe, expect, expectTypeOf, it } from "vitest";
import * as studioSupport from "@vizij/studio-support";
import {
  mapNormalizedControlValue,
  mapUnitControlValue,
  resolveFaceControls,
  resolveRuntimeUpdatePlan,
  type FaceScalarControl,
  type ResolvedFaceControls,
  type RuntimeUpdatePlan,
  type RuntimeUpdateTier,
  type VizijAssetBundle,
} from "../index";

describe("runtime-react public API", () => {
  it("re-exports studio support helpers documented by the runtime package", () => {
    expect(resolveFaceControls).toBe(studioSupport.resolveFaceControls);
    expect(mapNormalizedControlValue).toBe(
      studioSupport.mapNormalizedControlValue,
    );
    expect(mapUnitControlValue).toBe(studioSupport.mapUnitControlValue);
    expect(resolveRuntimeUpdatePlan).toBe(
      studioSupport.resolveRuntimeUpdatePlan,
    );
  });

  it("keeps the bundle and helper types available from the package root", () => {
    const assetBundle: VizijAssetBundle = {
      glb: { kind: "url", src: "/face.glb" },
    };
    const tier: RuntimeUpdateTier = "graphs";
    const updatePlan = resolveRuntimeUpdatePlan(null, assetBundle, tier);
    const controls = resolveFaceControls(assetBundle);
    const scalarControl: FaceScalarControl = {
      path: "/face/standard/vizij/left_eye/pos/x",
      min: -1,
      max: 1,
      defaultValue: 0,
    };

    expectTypeOf(updatePlan).toEqualTypeOf<RuntimeUpdatePlan>();
    expectTypeOf(controls).toEqualTypeOf<ResolvedFaceControls>();
    expect(mapNormalizedControlValue(scalarControl, 0.5)).toBe(0.5);
    expect(updatePlan).toEqual({
      reloadAssets: true,
      reregisterGraphs: false,
    });
  });
});
