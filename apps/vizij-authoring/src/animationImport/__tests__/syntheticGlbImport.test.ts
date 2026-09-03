import { describe, expect, it } from "vitest";
import { Euler, Quaternion } from "three";
import { createPropsRigTargetCatalog, importGltfAnimations } from "..";
import { makeSingleChannelGlb } from "./makeGlb";

type Quat = InstanceType<typeof Quaternion>;

const D = Math.PI / 180;

function quatZYX(x: number, y: number, z: number): Quat {
  return new Quaternion().setFromEuler(new Euler(x, y, z, "ZYX"));
}

/**
 * Cases the Blender corpus cannot cover: it is entirely `LINEAR`, has no
 * `STEP` samplers, and never exercises the CUBICSPLINE tangent layout.
 */
describe("importGltfAnimations (synthetic)", () => {
  it("imports a CUBICSPLINE rotation as linear euler through the value column", () => {
    // CUBICSPLINE output is (inTangent, value, outTangent) per key. Tangents
    // are deliberately absurd: if the value column were misread, the imported
    // angles would be wildly wrong instead of a clean sweep.
    const angles = [0, 20 * D, 40 * D];
    const values: number[] = [];
    for (const angle of angles) {
      const q = quatZYX(0, 0, angle);
      values.push(99, 99, 99, 99); // inTangent
      values.push(q.x, q.y, q.z, q.w); // value
      values.push(-99, -99, -99, -99); // outTangent
    }

    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "rotation",
      times: [0, 0.5, 1],
      values,
      interpolation: "CUBICSPLINE",
    });

    const catalog = createPropsRigTargetCatalog([
      "/propsrig/lid/rotation/x",
      "/propsrig/lid/rotation/y",
      "/propsrig/lid/rotation/z",
    ]);
    const result = importGltfAnimations({ glb, catalog });

    const z = result.clips[0]!.tracks.find(
      (track) => track.channel === "propsrig/lid/rotation/z",
    );
    expect(z).toBeDefined();
    expect(z!.interpolation).toBe("linear");
    expect(z!.keyframes.map((k) => k.value)).toEqual([
      expect.closeTo(0, 6),
      expect.closeTo(20 * D, 6),
      expect.closeTo(40 * D, 6),
    ]);
    // Tangents are dropped, not carried over from quaternion space.
    expect(z!.keyframes.every((k) => k.inTangent === undefined)).toBe(true);

    expect(
      result.diagnostics.find(
        (entry) => entry.code === "rotation-cubic-to-linear",
      ),
    ).toBeDefined();
  });

  it("keeps CUBICSPLINE tangents for non-rotation channels", () => {
    const values: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      values.push(1, 1, 1); // inTangent
      values.push(i, 0, 0); // value
      values.push(2, 2, 2); // outTangent
    }
    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "translation",
      times: [0, 1, 2],
      values,
      interpolation: "CUBICSPLINE",
    });
    const catalog = createPropsRigTargetCatalog([
      "/propsrig/lid/translation/x",
    ]);
    const { clips } = importGltfAnimations({ glb, catalog });
    const track = clips[0]!.tracks[0]!;
    expect(track.interpolation).toBe("cubic");
    expect(track.keyframes.map((k) => k.value)).toEqual([0, 1, 2]);
    expect(track.keyframes[0]!.inTangent).toBeCloseTo(1, 6);
    expect(track.keyframes[0]!.outTangent).toBeCloseTo(2, 6);
  });

  it("carries STEP interpolation through", () => {
    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "scale",
      times: [0, 1],
      values: [1, 1, 1, 2, 2, 2],
      interpolation: "STEP",
    });
    const catalog = createPropsRigTargetCatalog(["/propsrig/lid/scale/y"]);
    const { clips } = importGltfAnimations({ glb, catalog });
    expect(clips[0]!.tracks[0]!.interpolation).toBe("step");
    expect(clips[0]!.tracks[0]!.keyframes.map((k) => k.value)).toEqual([1, 2]);
  });

  it("corrects a sign-flipped quaternion sequence end to end", () => {
    const a = quatZYX(0, 0, 10 * D);
    const b = quatZYX(0, 0, 12 * D);
    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "rotation",
      times: [0, 1],
      // Second key negated: the same rotation, opposite quaternion sign.
      values: [a.x, a.y, a.z, a.w, -b.x, -b.y, -b.z, -b.w],
    });
    const catalog = createPropsRigTargetCatalog(["/propsrig/lid/rotation/z"]);
    const { clips } = importGltfAnimations({ glb, catalog });
    const values = clips[0]!.tracks[0]!.keyframes.map((k) => k.value);
    expect(values[0]).toBeCloseTo(10 * D, 6);
    expect(values[1]).toBeCloseTo(12 * D, 6);
  });

  it("reports keys sitting on the euler singularity", () => {
    const q = quatZYX(0, 90 * D, 30 * D);
    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "rotation",
      times: [0],
      values: [q.x, q.y, q.z, q.w],
    });
    const catalog = createPropsRigTargetCatalog(["/propsrig/lid/rotation/y"]);
    const { diagnostics } = importGltfAnimations({ glb, catalog });
    const gimbal = diagnostics.find(
      (entry) => entry.code === "rotation-gimbal-keys",
    );
    expect(gimbal?.severity).toBe("warning");
    expect(gimbal?.remediation).toBeDefined();
  });

  it("maps a morph weights channel by target name", () => {
    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "weights",
      times: [0, 1],
      // Two morph targets per key.
      values: [0, 0.25, 1, 0.75],
      outputType: "SCALAR",
      morphTargetNames: ["Lid_UpDn", "CurveUp"],
    });
    const catalog = createPropsRigTargetCatalog([
      "/propsrig/lid/lid_updn/value",
      "/propsrig/lid/curveup/value",
    ]);
    const { clips } = importGltfAnimations({ glb, catalog });
    const byChannel = new Map(
      clips[0]!.tracks.map((track) => [track.channel, track]),
    );
    expect(
      byChannel
        .get("propsrig/lid/lid_updn/value")!
        .keyframes.map((k) => k.value),
    ).toEqual([0, 1]);
    expect(
      byChannel
        .get("propsrig/lid/curveup/value")!
        .keyframes.map((k) => k.value),
    ).toEqual([0.25, 0.75]);
  });

  it("treats a lone animation as a single-scene grouping", () => {
    const glb = makeSingleChannelGlb({
      nodeName: "Lid",
      path: "scale",
      times: [0, 1],
      values: [1, 1, 1, 2, 2, 2],
    });
    const catalog = createPropsRigTargetCatalog(["/propsrig/lid/scale/x"]);
    const { grouping, diagnostics } = importGltfAnimations({ glb, catalog });
    expect(grouping).toBe("single-scene");
    expect(
      diagnostics.find((entry) => entry.code === "per-action-grouping"),
    ).toBeUndefined();
  });

  it("reports an unmatched node instead of importing nothing silently", () => {
    const glb = makeSingleChannelGlb({
      nodeName: "Renamed_In_Blender",
      path: "scale",
      times: [0, 1],
      values: [1, 1, 1, 2, 2, 2],
    });
    const catalog = createPropsRigTargetCatalog(["/propsrig/lid/scale/x"]);
    const { clips, diagnostics, stats } = importGltfAnimations({
      glb,
      catalog,
    });
    expect(clips).toHaveLength(0);
    expect(stats.unresolvedChannels).toBe(3);
    const note = diagnostics.find(
      (entry) => entry.code === "unresolved-no-matching-input",
    );
    expect(note?.remediation).toContain("names");
  });
});
