import { describe, expect, it } from "vitest";
import { Euler, Quaternion } from "three";
import {
  quaternionCurveToEulerZYX,
  quaternionToEulerZYX,
  unwrapAngles,
} from "../quaternionToEuler";

type Quat = InstanceType<typeof Quaternion>;

/**
 * The conversion is implemented without Three so the import path stays
 * dependency-free, so these tests pin it against Three's own implementation —
 * the thing the renderer actually uses.
 */

function threeEulerZYX(q: Quat): [number, number, number] {
  const euler = new Euler().setFromQuaternion(q, "ZYX");
  return [euler.x, euler.y, euler.z];
}

function quatFromEulerZYX(x: number, y: number, z: number): Quat {
  return new Quaternion().setFromEuler(new Euler(x, y, z, "ZYX"));
}

const D = Math.PI / 180;

describe("quaternionToEulerZYX", () => {
  const cases: Array<[string, number, number, number]> = [
    ["identity", 0, 0, 0],
    ["single axis x", 30 * D, 0, 0],
    ["single axis y", 0, 40 * D, 0],
    ["single axis z", 0, 0, 50 * D],
    ["combined", 20 * D, -35 * D, 65 * D],
    ["large angles", 170 * D, 20 * D, -160 * D],
    ["negative", -80 * D, -10 * D, 95 * D],
    ["near gimbal +", 25 * D, 89.5 * D, 40 * D],
    ["near gimbal -", -25 * D, -89.5 * D, -40 * D],
  ];

  it.each(cases)("matches THREE for %s", (_label, x, y, z) => {
    const q = quatFromEulerZYX(x, y, z);
    const mine = quaternionToEulerZYX(q.x, q.y, q.z, q.w);
    const [tx, ty, tz] = threeEulerZYX(q);
    expect(mine.x).toBeCloseTo(tx, 10);
    expect(mine.y).toBeCloseTo(ty, 10);
    expect(mine.z).toBeCloseTo(tz, 10);
  });

  it("round-trips back to the same rotation", () => {
    for (const [, x, y, z] of cases) {
      const source = quatFromEulerZYX(x, y, z);
      const mine = quaternionToEulerZYX(source.x, source.y, source.z, source.w);
      const rebuilt = quatFromEulerZYX(mine.x, mine.y, mine.z);
      // q and -q are the same rotation, so compare |dot|.
      expect(Math.abs(rebuilt.dot(source))).toBeCloseTo(1, 9);
    }
  });

  it("flags the ZYX singularity instead of hiding it", () => {
    const q = quatFromEulerZYX(0, 90 * D, 30 * D);
    expect(quaternionToEulerZYX(q.x, q.y, q.z, q.w).gimbal).toBe(true);
    const ok = quatFromEulerZYX(0, 45 * D, 30 * D);
    expect(quaternionToEulerZYX(ok.x, ok.y, ok.z, ok.w).gimbal).toBe(false);
  });

  it("normalizes a slightly non-unit quaternion", () => {
    const q = quatFromEulerZYX(20 * D, 30 * D, 40 * D);
    const scaled = quaternionToEulerZYX(
      q.x * 1.02,
      q.y * 1.02,
      q.z * 1.02,
      q.w * 1.02,
    );
    const [tx, ty, tz] = threeEulerZYX(q);
    expect(scaled.x).toBeCloseTo(tx, 8);
    expect(scaled.y).toBeCloseTo(ty, 8);
    expect(scaled.z).toBeCloseTo(tz, 8);
  });

  it("returns identity for a degenerate zero quaternion", () => {
    expect(quaternionToEulerZYX(0, 0, 0, 0)).toMatchObject({
      x: 0,
      y: 0,
      z: 0,
    });
  });
});

describe("unwrapAngles", () => {
  it("removes the atan2 branch cut at ±π", () => {
    const wrapped = [3.0, 3.1, -3.1, -3.0];
    const unwrapped = unwrapAngles(wrapped);
    for (let i = 1; i < unwrapped.length; i += 1) {
      expect(Math.abs(unwrapped[i]! - unwrapped[i - 1]!)).toBeLessThan(Math.PI);
    }
    // Continues upward past π rather than snapping back.
    expect(unwrapped[2]).toBeGreaterThan(unwrapped[1]!);
  });

  it("accumulates across multiple turns", () => {
    const perTurn = [0, 2, 4, -2.28, -0.28, 1.72];
    const unwrapped = unwrapAngles(perTurn);
    expect(unwrapped[unwrapped.length - 1]).toBeGreaterThan(7);
  });

  it("leaves an already-continuous sequence untouched", () => {
    const values = [0, 0.1, 0.2, 0.15];
    expect(unwrapAngles(values)).toEqual(values);
  });

  it("handles an empty sequence", () => {
    expect(unwrapAngles([])).toEqual([]);
  });
});

describe("quaternionCurveToEulerZYX", () => {
  it("corrects a sign-flipped quaternion sequence", () => {
    // Same two rotations, second expressed as -q: without sign correction the
    // euler values land on opposite branches and the curve jumps.
    const a = quatFromEulerZYX(10 * D, 20 * D, 30 * D);
    const b = quatFromEulerZYX(12 * D, 22 * D, 32 * D);
    const values = [a.x, a.y, a.z, a.w, -b.x, -b.y, -b.z, -b.w];

    const curves = quaternionCurveToEulerZYX(values, 2);
    expect(curves.signFlipCount).toBe(1);
    expect(curves.x[1]!).toBeCloseTo(12 * D, 9);
    expect(curves.y[1]!).toBeCloseTo(22 * D, 9);
    expect(curves.z[1]!).toBeCloseTo(32 * D, 9);
  });

  it("produces continuous curves through a 360° sweep about z", () => {
    const keyCount = 37;
    const values: number[] = [];
    for (let i = 0; i < keyCount; i += 1) {
      const q = quatFromEulerZYX(0, 0, i * 10 * D);
      values.push(q.x, q.y, q.z, q.w);
    }
    const curves = quaternionCurveToEulerZYX(values, keyCount);
    for (let i = 1; i < keyCount; i += 1) {
      expect(Math.abs(curves.z[i]! - curves.z[i - 1]!)).toBeLessThan(
        Math.PI / 2,
      );
    }
    // A full turn accumulates to ~2π rather than snapping back to 0.
    expect(curves.z[keyCount - 1]!).toBeCloseTo(2 * Math.PI, 6);
  });

  it("matches THREE key by key on a mixed-axis sweep", () => {
    const keyCount = 24;
    const values: number[] = [];
    const expected: Array<[number, number, number]> = [];
    for (let i = 0; i < keyCount; i += 1) {
      const q = quatFromEulerZYX(
        i * 7 * D,
        Math.sin(i / 4) * 30 * D,
        i * 11 * D,
      );
      values.push(q.x, q.y, q.z, q.w);
      expected.push(threeEulerZYX(q));
    }
    const curves = quaternionCurveToEulerZYX(values, keyCount);
    for (let i = 0; i < keyCount; i += 1) {
      // Compare as rotations: unwrapping intentionally shifts by multiples of 2π.
      const rebuilt = quatFromEulerZYX(
        curves.x[i]!,
        curves.y[i]!,
        curves.z[i]!,
      );
      const source = quatFromEulerZYX(...expected[i]!);
      expect(Math.abs(rebuilt.dot(source))).toBeCloseTo(1, 8);
    }
  });

  it("defaults a missing w to 1 rather than producing NaN", () => {
    const curves = quaternionCurveToEulerZYX([0, 0, 0], 1);
    expect(curves.x[0]).toBe(0);
    expect(Number.isFinite(curves.y[0]!)).toBe(true);
  });
});
