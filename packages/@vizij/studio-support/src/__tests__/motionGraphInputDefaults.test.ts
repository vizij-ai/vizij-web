import { describe, expect, it } from "vitest";
import { buildInitialInputDefaultsForPorts } from "../utils/motionGraphInputDefaults";

describe("motion graph input defaults", () => {
  it("stores visible numeric and boolean port defaults for new nodes", () => {
    expect(
      buildInitialInputDefaultsForPorts(
        [
          {
            id: "amount",
            type: "f32",
          },
          {
            id: "enabled",
            type: "bool",
          },
          {
            id: "label",
            type: "string",
          },
        ],
        {
          id: "values",
          type: "f32",
          min: 2,
        },
      ),
    ).toEqual({
      amount: 0,
      enabled: false,
      values_0: 0,
      values_1: 0,
    });
  });
});
