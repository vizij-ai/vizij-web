import { describe, expect, it } from "vitest";
import {
  eulerZYXQuaternion,
  quaternionDot,
  rotateVector,
} from "../test/rotationOracle";
import {
  IDENTITY_MATRIX,
  composeMatrix,
  decomposeMatrix,
  eulerZYXFromQuaternion,
  invertMatrix,
  multiplyMatrices,
  quaternionFromEulerZYX,
  type Mat4,
  type Vec3,
} from "./transformMath";

const D = Math.PI / 180;

const EULERS: Array<[string, number, number, number]> = [
  ["identity", 0, 0, 0],
  ["x only", 30 * D, 0, 0],
  ["y only", 0, 40 * D, 0],
  ["z only", 0, 0, 50 * D],
  ["combined", 20 * D, -35 * D, 65 * D],
  ["large angles", 170 * D, 20 * D, -160 * D],
  ["negative", -80 * D, -10 * D, 95 * D],
  ["near gimbal +", 25 * D, 89.5 * D, 40 * D],
  ["near gimbal -", -25 * D, -89.5 * D, -40 * D],
];

function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return {
    x: m[0]! * p.x + m[4]! * p.y + m[8]! * p.z + m[12]!,
    y: m[1]! * p.x + m[5]! * p.y + m[9]! * p.z + m[13]!,
    z: m[2]! * p.x + m[6]! * p.y + m[10]! * p.z + m[14]!,
  };
}

function expectVecClose(actual: Vec3, expected: Vec3, digits = 10) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function expectMatrixClose(actual: Mat4, expected: Mat4, digits = 10) {
  expect(actual).toHaveLength(16);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, digits);
  });
}

describe("quaternionFromEulerZYX", () => {
  it.each(EULERS)("is Rz·Ry·Rx for %s", (_label, x, y, z) => {
    const q = quaternionFromEulerZYX(x, y, z);
    const expected = eulerZYXQuaternion(x, y, z);
    expect(q.x).toBeCloseTo(expected.x, 12);
    expect(q.y).toBeCloseTo(expected.y, 12);
    expect(q.z).toBeCloseTo(expected.z, 12);
    expect(q.w).toBeCloseTo(expected.w, 12);
  });

  it("gives the quaternions three.js's GLB exporter writes", () => {
    // `Quaternion.setFromEuler(new Euler(x, y, z, "ZYX"))`: a baked rotation
    // and the rest pose exported beside it must agree to the last digit.
    const cases: Array<[[number, number, number], number[]]> = [
      [
        [0.3, -0.7, 1.9],
        [
          0.3574420094160363, -0.08303243304197462, 0.785326915867652,
          0.4986005015857463,
        ],
      ],
      [
        [2.8, 0.35, -2.6],
        [
          0.28809471492622546, -0.9271194169907344, -0.2071679103265251,
          -0.12055073123493922,
        ],
      ],
    ];
    for (const [[x, y, z], expected] of cases) {
      const q = quaternionFromEulerZYX(x, y, z);
      [q.x, q.y, q.z, q.w].forEach((value, index) => {
        expect(value).toBeCloseTo(expected[index]!, 15);
      });
    }
  });
});

describe("eulerZYXFromQuaternion", () => {
  it.each(EULERS)("recovers the angles of %s", (_label, x, y, z) => {
    const euler = eulerZYXFromQuaternion(eulerZYXQuaternion(x, y, z));
    expect(euler.gimbal).toBe(false);
    expectVecClose(euler, { x, y, z });
  });

  it("flags the ZYX singularity and keeps the rotation", () => {
    const source = eulerZYXQuaternion(-1.2, 90 * D, 0.4);
    const euler = eulerZYXFromQuaternion(source);
    expect(euler.gimbal).toBe(true);
    // At y = π/2 only z - x is determined: x is set to 0, z carries it.
    expectVecClose(euler, { x: 0, y: 90 * D, z: 1.6 });
    const rebuilt = eulerZYXQuaternion(euler.x, euler.y, euler.z);
    expect(Math.abs(quaternionDot(rebuilt, source))).toBeCloseTo(1, 9);
  });
});

describe("composeMatrix", () => {
  it("is T·R·S", () => {
    const rotation = quaternionFromEulerZYX(20 * D, -35 * D, 65 * D);
    const m = composeMatrix({ x: 1, y: -2, z: 3 }, rotation, {
      x: 2,
      y: 0.5,
      z: -1.5,
    });
    const point = { x: 0.7, y: -0.2, z: 1.1 };
    const rotated = rotateVector(rotation, {
      x: point.x * 2,
      y: point.y * 0.5,
      z: point.z * -1.5,
    });
    expectVecClose(transformPoint(m, point), {
      x: rotated.x + 1,
      y: rotated.y - 2,
      z: rotated.z + 3,
    });
    expect([m[3], m[7], m[11], m[15]]).toEqual([0, 0, 0, 1]);
  });

  it("is the identity for no translation, rotation or scale", () => {
    expect(
      composeMatrix(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0, w: 1 },
        { x: 1, y: 1, z: 1 },
      ),
    ).toEqual([...IDENTITY_MATRIX]);
  });
});

describe("multiplyMatrices", () => {
  it("applies b, then a", () => {
    const a = composeMatrix(
      { x: 1, y: 2, z: 3 },
      quaternionFromEulerZYX(0.4, 0.1, -0.9),
      { x: 2, y: 2, z: 2 },
    );
    const b = composeMatrix(
      { x: -3, y: 0.5, z: 1 },
      quaternionFromEulerZYX(-1.1, 0.6, 0.2),
      { x: 1, y: 0.25, z: 3 },
    );
    const point = { x: 0.3, y: -1.4, z: 2.2 };
    expectVecClose(
      transformPoint(multiplyMatrices(a, b), point),
      transformPoint(a, transformPoint(b, point)),
    );
  });
});

describe("invertMatrix", () => {
  it("gives the matrix that undoes it", () => {
    const m = composeMatrix(
      { x: 4, y: -1, z: 0.5 },
      quaternionFromEulerZYX(170 * D, 20 * D, -160 * D),
      { x: -2, y: 0.5, z: 1.5 },
    );
    expectMatrixClose(multiplyMatrices(invertMatrix(m), m), IDENTITY_MATRIX);
    expectMatrixClose(multiplyMatrices(m, invertMatrix(m)), IDENTITY_MATRIX);
  });

  it("gives the zero matrix for a singular one", () => {
    const flat = composeMatrix(
      { x: 1, y: 2, z: 3 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 1, y: 0, z: 1 },
    );
    expect(invertMatrix(flat)).toEqual(new Array(16).fill(0));
  });
});

describe("decomposeMatrix", () => {
  it.each(EULERS)(
    "recovers translation, rotation and scale for %s",
    (_label, x, y, z) => {
      const translation = { x: 1, y: -2, z: 3 };
      const rotation = quaternionFromEulerZYX(x, y, z);
      const scale = { x: 2, y: 0.5, z: 1.5 };
      const parts = decomposeMatrix(
        composeMatrix(translation, rotation, scale),
      );
      expectVecClose(parts.translation, translation);
      expectVecClose(parts.scale, scale);
      expect(Math.abs(quaternionDot(parts.rotation, rotation))).toBeCloseTo(
        1,
        10,
      );
    },
  );

  it("carries a reflection in a negative x scale", () => {
    const m = composeMatrix(
      { x: 1, y: -2, z: 3 },
      quaternionFromEulerZYX(0.3, -0.7, 1.9),
      { x: 2, y: -0.5, z: 1.5 },
    );
    const parts = decomposeMatrix(m);
    expect(parts.scale.x).toBeLessThan(0);
    expect(parts.scale.y).toBeGreaterThan(0);
    expectMatrixClose(
      composeMatrix(parts.translation, parts.rotation, parts.scale),
      m,
    );
  });
});
