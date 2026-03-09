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
