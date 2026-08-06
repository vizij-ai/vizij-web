import { describe, expect, it } from "vitest";
import {
  degreesToRadians,
  fromRotationDisplayValue,
  isRotationPropertyKey,
  radiansToDegrees,
  shouldDisplayRotationInDegrees,
  toRotationDisplayValue,
} from "./rotationDisplay";

describe("rotationDisplay", () => {
  it("detects rotation property keys", () => {
    expect(isRotationPropertyKey("rotation")).toBe(true);
    expect(isRotationPropertyKey("scene_rotation")).toBe(true);
    expect(isRotationPropertyKey("Euler")).toBe(true);
    expect(isRotationPropertyKey("jaw_angle")).toBe(true);
    expect(isRotationPropertyKey("/propsrig/eye_left/rotation/x")).toBe(true);
    expect(isRotationPropertyKey("/drivers/head/neck_angle")).toBe(true);
    expect(isRotationPropertyKey("translation")).toBe(false);
    expect(isRotationPropertyKey(null)).toBe(false);
  });

  it("converts between radians and degrees", () => {
    expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90, 6);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 6);
  });

  it("maps rotation values through the selected display mode", () => {
    expect(toRotationDisplayValue(Math.PI / 4, "degrees")).toBeCloseTo(45, 6);
    expect(fromRotationDisplayValue(45, "degrees")).toBeCloseTo(Math.PI / 4, 6);
    expect(toRotationDisplayValue(1.25, "radians")).toBeCloseTo(1.25, 6);
    expect(fromRotationDisplayValue(1.25, "radians")).toBeCloseTo(1.25, 6);
  });

  // `toBeCloseTo` cannot catch this class of bug — 29.999999999999996 is "close to"
  // 30 at any tolerance — which is exactly why it reached a live rotation field.
  // These assert the EXACT displayed number.
  it("rounds the degree display so float error never reaches the field", () => {
    expect(toRotationDisplayValue(Math.PI / 6, "degrees")).toBe(30);
    expect(toRotationDisplayValue(Math.PI / 3, "degrees")).toBe(60);
    expect(toRotationDisplayValue(Math.PI / 2, "degrees")).toBe(90);
    expect(toRotationDisplayValue(Math.PI, "degrees")).toBe(180);
    expect(toRotationDisplayValue(-Math.PI / 6, "degrees")).toBe(-30);
  });

  it("keeps four decimals of real precision rather than snapping to integers", () => {
    // 0.1 rad is genuinely 5.729577951308233° — round, do not truncate to 6.
    expect(toRotationDisplayValue(0.1, "degrees")).toBe(5.7296);
    expect(toRotationDisplayValue(1, "degrees")).toBe(57.2958);
  });

  it("leaves radian display untouched, float error and all", () => {
    // Rounding is a degrees-only concern; radians are shown as stored.
    expect(toRotationDisplayValue(Math.PI / 6, "radians")).toBe(Math.PI / 6);
  });

  it("does not corrupt values too large to scale exactly", () => {
    const huge = 1e12; // radians; degrees exceed the exact-integer range
    expect(toRotationDisplayValue(huge, "degrees")).toBe(
      radiansToDegrees(huge),
    );
    expect(Number.isFinite(toRotationDisplayValue(huge, "degrees"))).toBe(true);
  });

  it("only enables degree display for rotational identifiers", () => {
    expect(
      shouldDisplayRotationInDegrees(
        "/propsrig/eye_left/rotation/x",
        "degrees",
      ),
    ).toBe(true);
    expect(
      shouldDisplayRotationInDegrees("/propsrig/jaw/open", "degrees"),
    ).toBe(false);
    expect(
      shouldDisplayRotationInDegrees(
        "/propsrig/eye_left/rotation/x",
        "radians",
      ),
    ).toBe(false);
  });
});
