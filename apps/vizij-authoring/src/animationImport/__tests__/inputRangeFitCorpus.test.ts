import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createStandardRigInput, type StandardRigInput } from "@vizij/utils";
import {
  computeInputRangeFit,
  createPropsRigTargetCatalog,
  describeRangeAdjustment,
  importGltfAnimations,
} from "..";
import { buildPropsRigInputPath } from "../../rig/autoInputs";
import type { GltfJsonLike } from "../gltfAnimationChannels";
import { modelGeometryDerivedInputPaths } from "./makeGlb";
import { readGlbJson } from "./readGlbJson";

const ASSET_DIR = path.resolve(__dirname, "../../../public/assets");
const assetPath = (name: string) => path.join(ASSET_DIR, name);

function readArrayBuffer(name: string): ArrayBuffer {
  const buffer = readFileSync(assetPath(name));
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

// Mirrors @vizij/utils bounds.ts, which derives a range from the rest value.
const translationBounds = (v: number): [number, number] =>
  Math.abs(v) < 1e-4 ? [-1, 1] : v >= 0 ? [0, v * 2] : [v * 2, 0];
const scaleBounds = (v: number): [number, number] => [
  Math.min(0, v),
  Math.max(2, v),
];

/**
 * Builds the inputs a geometry-derived face would expose, with the ranges
 * `@vizij/utils` infers from each element's rest transform.
 */
function inputsFromRestTransforms(
  json: GltfJsonLike,
): Map<string, StandardRigInput> {
  const inputs = new Map<string, StandardRigInput>();
  const add = (
    elementName: string,
    featureKey: string,
    component: "x" | "y" | "z" | null,
    defaultValue: number,
    range: { min: number; max: number },
  ) => {
    const entry = createStandardRigInput({
      path: buildPropsRigInputPath({ elementName, featureKey, component }),
      label: `${elementName} ${featureKey}`,
      group: "propsrig",
      defaultValue,
      range,
    });
    inputs.set(entry.id, entry);
  };

  const components: Array<"x" | "y" | "z"> = ["x", "y", "z"];
  (json.nodes ?? []).forEach((node) => {
    const name = typeof node?.name === "string" ? node.name : "";
    if (!name) {
      return;
    }
    const raw = node as unknown as {
      translation?: number[];
      scale?: number[];
      mesh?: number;
    };
    components.forEach((component, index) => {
      const t = raw.translation?.[index] ?? 0;
      const [tMin, tMax] = translationBounds(t);
      add(name, "translation", component, t, { min: tMin, max: tMax });

      const s = raw.scale?.[index] ?? 1;
      const [sMin, sMax] = scaleBounds(s);
      add(name, "scale", component, s, { min: sMin, max: sMax });

      // Euler inputs are bounded at ±π regardless of rest value.
      add(name, "rotation", component, 0, { min: -Math.PI, max: Math.PI });
    });

    const targetNames =
      typeof raw.mesh === "number"
        ? json.meshes?.[raw.mesh]?.extras?.targetNames
        : null;
    if (Array.isArray(targetNames)) {
      // Morph animatables are declared with constraints of ±1.
      for (const morph of targetNames) {
        if (typeof morph !== "string") {
          continue;
        }
        add(name, morph.toLowerCase().replace(/[^a-z0-9]+/g, "_"), null, 0, {
          min: -1,
          max: 1,
        });
      }
    }
  });
  return inputs;
}

const FILE = "Quori_Latest_Blender_Export.glb";
const available = existsSync(assetPath(FILE));

/**
 * The clamping problem measured on a real asset: input ranges inferred from a
 * single rest value do not admit the curves Blender exported.
 */
describe.runIf(available)("input range fit (corpus)", () => {
  it("finds the Quori channels that would be clamped", () => {
    const json = readGlbJson(assetPath(FILE));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const { clips } = importGltfAnimations({
      glb: readArrayBuffer(FILE),
      catalog,
    });

    const { adjustments, unresolvedChannels } = computeInputRangeFit({
      clips,
      inputsById: inputsFromRestTransforms(json),
    });
    expect(unresolvedChannels).toEqual([]);

    const channels = adjustments.map((entry) => entry.channel).sort();
    // The mirrored eye highlights (negative rest scale) and R_Eye's slight
    // overshoot, plus the two unwrapped rotation channels.
    expect(channels).toContain("propsrig/l_eyehighlight/scale/x");
    expect(channels).toContain("propsrig/l_eyehighlight/scale/y");
    expect(channels).toContain("propsrig/r_eyehighlight/scale/x");
    expect(channels).toContain("propsrig/r_eyehighlight/scale/y");
    expect(channels).toContain("propsrig/r_eye/scale/x");

    for (const adjustment of adjustments) {
      // Every widening must actually admit the curve it was computed for.
      expect(adjustment.next.min).toBeLessThanOrEqual(adjustment.curve.min);
      expect(adjustment.next.max).toBeGreaterThanOrEqual(adjustment.curve.max);
      // And must never narrow the existing range.
      expect(adjustment.next.min).toBeLessThanOrEqual(adjustment.current.min);
      expect(adjustment.next.max).toBeGreaterThanOrEqual(
        adjustment.current.max,
      );
    }
  });

  it("makes every channel fit after the widening is applied", () => {
    const json = readGlbJson(assetPath(FILE));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const { clips } = importGltfAnimations({
      glb: readArrayBuffer(FILE),
      catalog,
    });
    const inputs = inputsFromRestTransforms(json);

    const first = computeInputRangeFit({ clips, inputsById: inputs });
    expect(first.adjustments.length).toBeGreaterThan(0);

    // Apply, then re-run: a second pass must find nothing left to widen.
    for (const adjustment of first.adjustments) {
      const existing = inputs.get(adjustment.inputId)!;
      inputs.set(adjustment.inputId, {
        ...existing,
        range: { ...adjustment.next },
      });
    }
    const second = computeInputRangeFit({ clips, inputsById: inputs });
    expect(second.adjustments).toEqual([]);
  });

  it("describes each widening with both ranges and the curve extent", () => {
    const json = readGlbJson(assetPath(FILE));
    const catalog = createPropsRigTargetCatalog(
      modelGeometryDerivedInputPaths(json),
    );
    const { clips } = importGltfAnimations({
      glb: readArrayBuffer(FILE),
      catalog,
    });
    const { adjustments } = computeInputRangeFit({
      clips,
      inputsById: inputsFromRestTransforms(json),
    });
    const described = adjustments.map(describeRangeAdjustment);
    expect(
      described.some((line) =>
        line.startsWith("propsrig/l_eyehighlight/scale/x: "),
      ),
    ).toBe(true);
    for (const line of described) {
      expect(line).toContain("curve spans");
    }
  });
});
