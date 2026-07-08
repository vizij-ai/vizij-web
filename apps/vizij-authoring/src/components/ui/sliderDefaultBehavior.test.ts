import { describe, expect, it } from "vitest";
import {
  hasSliderDefaultMarker,
  resolveSliderDefaultPercent,
  resolveSnappedSliderValue,
} from "./sliderDefaultBehavior";

describe("slider default behavior", () => {
  it("shows a marker only when the default is inside range", () => {
    expect(hasSliderDefaultMarker({ defaultValue: 0.5, min: 0, max: 1 })).toBe(
      true,
    );
    expect(hasSliderDefaultMarker({ defaultValue: 2, min: 0, max: 1 })).toBe(
      false,
    );
  });

  it("computes the marker position as a track percentage", () => {
    expect(
      resolveSliderDefaultPercent({ defaultValue: 0.25, min: 0, max: 1 }),
    ).toBe(25);
  });

  it("snaps close slider values onto the default marker", () => {
    expect(
      resolveSnappedSliderValue(0.495, {
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
      }),
    ).toBe(0.5);

    expect(
      resolveSnappedSliderValue(0.45, {
        defaultValue: 0.5,
        min: 0,
        max: 1,
        step: 0.01,
      }),
    ).toBe(0.45);
  });
});
