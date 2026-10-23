import { describe, expect, it } from "vitest";
import { withComponent } from "./componentValue";

/** A colour default as a GLB's RobotData holds it: Arora's struct form. */
function structColor(r: number, g: number, b: number) {
  return {
    struct: {
      id: "76697a69-6a00-0000-0000-000000000020",
      fields: [
        { id: "76697a69-6a00-0000-0000-000000200001", value: { f32: r } },
        { id: "76697a69-6a00-0000-0000-000000200002", value: { f32: g } },
        { id: "76697a69-6a00-0000-0000-000000200003", value: { f32: b } },
        { id: "76697a69-6a00-0000-0000-000000200004", value: { f32: 1 } },
      ],
    },
  };
}

describe("withComponent", () => {
  it("sets a struct-form colour's channel in its field, keeping the form", () => {
    expect(withComponent(structColor(0.1, 0.2, 0.3), "rgb", "r", 1)).toEqual(
      structColor(1, 0.2, 0.3),
    );
    expect(withComponent(structColor(0.1, 0.2, 0.3), "rgb", "b", 0)).toEqual(
      structColor(0.1, 0.2, 0),
    );
  });

  it("finds a component by its other name", () => {
    expect(withComponent(structColor(0.1, 0.2, 0.3), "rgb", "y", 1)).toEqual(
      structColor(0.1, 1, 0.3),
    );
  });

  it("sets a struct-form vector's axis", () => {
    const vector = {
      struct: {
        fields: [{ value: 1 }, { value: { f64: 2 } }, { value: { f32: 3 } }],
      },
    };
    expect(withComponent(vector, "vector3", "y", 5)).toEqual({
      struct: {
        fields: [{ value: 1 }, { value: { f64: 5 } }, { value: { f32: 3 } }],
      },
    });
    expect(withComponent(vector, "vector3", "x", 4)).toEqual({
      struct: {
        fields: [{ value: 4 }, { value: { f64: 2 } }, { value: { f32: 3 } }],
      },
    });
  });

  it("sets a plain value's key", () => {
    expect(withComponent({ r: 0.1, g: 0.2, b: 0.3 }, "rgb", "g", 1)).toEqual({
      r: 0.1,
      g: 1,
      b: 0.3,
    });
  });

  it("starts a plain value when there is none", () => {
    expect(withComponent(undefined, "rgb", "r", 1)).toEqual({ r: 1 });
  });
});
