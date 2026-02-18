import { describe, expect, it } from "vitest";
import { resolveRigMetadataReactivity } from "./rigMetadataReactivity";

describe("resolveRigMetadataReactivity", () => {
  it("keeps in-range values unchanged while preserving metadata", () => {
    expect(
      resolveRigMetadataReactivity({
        currentValue: 0.25,
        nextDefaultValue: 0,
        nextRange: { min: -1, max: 1 },
      }),
    ).toEqual({
      range: { min: -1, max: 1 },
      defaultValue: 0,
      value: 0.25,
    });
  });

  it("clamps current value when edited metadata narrows bounds", () => {
    expect(
      resolveRigMetadataReactivity({
        currentValue: 0.8,
        nextDefaultValue: 0,
        nextRange: { min: -0.4, max: 0.4 },
      }),
    ).toEqual({
      range: { min: -0.4, max: 0.4 },
      defaultValue: 0,
      value: 0.4,
    });
  });

  it("normalizes reversed ranges and clamps default/value deterministically", () => {
    expect(
      resolveRigMetadataReactivity({
        currentValue: -2,
        nextDefaultValue: 3,
        nextRange: { min: 1, max: -1 },
      }),
    ).toEqual({
      range: { min: -1, max: 1 },
      defaultValue: 1,
      value: -1,
    });
  });

  it("falls back to clamped default when current value is missing", () => {
    expect(
      resolveRigMetadataReactivity({
        currentValue: undefined,
        nextDefaultValue: 2,
        nextRange: { min: -0.5, max: 0.5 },
      }),
    ).toEqual({
      range: { min: -0.5, max: 0.5 },
      defaultValue: 0.5,
      value: 0.5,
    });
  });
});
