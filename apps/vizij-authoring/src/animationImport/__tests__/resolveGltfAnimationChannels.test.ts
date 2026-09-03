import { describe, expect, it } from "vitest";
import { buildPropsRigInputPath } from "../../rig/autoInputs";
import type { GltfAnimationChannel } from "../gltfAnimationChannels";
import { createPropsRigTargetCatalog } from "../propsRigTargetCatalog";
import { resolveGltfAnimationChannels } from "../resolveGltfAnimationChannels";

function channel(
  overrides: Partial<GltfAnimationChannel> = {},
): GltfAnimationChannel {
  return {
    animationIndex: 0,
    animationName: "a",
    channelIndex: 0,
    nodeIndex: 0,
    nodeName: "L_TLid",
    path: "translation",
    samplerIndex: 0,
    interpolation: "LINEAR",
    ...overrides,
  };
}

describe("resolveGltfAnimationChannels", () => {
  it("resolves a vector channel to the canonical propsrig path", () => {
    const catalog = createPropsRigTargetCatalog([
      "/propsrig/l_tlid/translation/x",
      "/propsrig/l_tlid/translation/y",
      "/propsrig/l_tlid/translation/z",
    ]);
    const result = resolveGltfAnimationChannels({
      channels: [channel()],
      catalog,
    });
    expect(result.unresolved).toEqual([]);
    expect(result.resolved.map((entry) => entry.propsRigPath)).toEqual([
      "/propsrig/l_tlid/translation/x",
      "/propsrig/l_tlid/translation/y",
      "/propsrig/l_tlid/translation/z",
    ]);
  });

  it("maps a morph channel through the shared feature-key rule", () => {
    const catalog = createPropsRigTargetCatalog([
      "/propsrig/l_tlid/lid_updn/value",
    ]);
    const result = resolveGltfAnimationChannels({
      channels: [
        channel({ path: "weights", morphNames: ["Lid_UpDn", "CurveUp"] }),
      ],
      catalog,
    });
    expect(result.resolved.map((e) => e.propsRigPath)).toEqual([
      "/propsrig/l_tlid/lid_updn/value",
    ]);
    // The unmapped morph is reported, never dropped.
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]).toMatchObject({
      reason: "no-matching-input",
      attemptedPath: "/propsrig/l_tlid/curveup/value",
    });
  });

  it("accounts for every scalar exactly once", () => {
    const catalog = createPropsRigTargetCatalog(["/propsrig/l_tlid/scale/x"]);
    const result = resolveGltfAnimationChannels({
      channels: [channel({ path: "scale" })],
      catalog,
    });
    expect(result.resolved.length + result.unresolved.length).toBe(3);
  });

  it("reports an unnamed node once rather than per component", () => {
    const result = resolveGltfAnimationChannels({
      channels: [channel({ nodeName: "" })],
      catalog: createPropsRigTargetCatalog([]),
    });
    expect(result.resolved).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]?.reason).toBe("unnamed-node");
  });

  it("reports a weights channel with no morph targets", () => {
    const result = resolveGltfAnimationChannels({
      channels: [channel({ path: "weights", morphNames: [] })],
      catalog: createPropsRigTargetCatalog([]),
    });
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0]?.reason).toBe("no-morph-targets");
  });

  it("resolves node names through the same normalization as generation", () => {
    // "Face Tran Rot C" and "Face_Tran_Rot_C" normalize identically, which is
    // what lets a Blender rename that only changes separators still bind.
    const generated = buildPropsRigInputPath({
      elementName: "Face_Tran_Rot_C",
      featureKey: "rotation",
      component: "z",
    });
    const result = resolveGltfAnimationChannels({
      channels: [channel({ nodeName: "Face Tran Rot C", path: "rotation" })],
      catalog: createPropsRigTargetCatalog([generated]),
    });
    expect(result.resolved.map((e) => e.propsRigPath)).toContain(generated);
  });
});

describe("buildPropsRigInputPath", () => {
  it("normalizes element, feature and component segments", () => {
    expect(
      buildPropsRigInputPath({
        elementName: "L_EyeHighlight",
        featureKey: "translation",
        component: "x",
      }),
    ).toBe("/propsrig/l_eyehighlight/translation/x");
  });

  it("uses `value` for scalar features", () => {
    expect(
      buildPropsRigInputPath({
        elementName: "LBLid",
        featureKey: "lidcurve",
      }),
    ).toBe("/propsrig/lblid/lidcurve/value");
  });

  it("falls back to placeholder segments for empty names", () => {
    expect(
      buildPropsRigInputPath({ elementName: "!!!", featureKey: "???" }),
    ).toBe("/propsrig/shape/feature/value");
  });
});
