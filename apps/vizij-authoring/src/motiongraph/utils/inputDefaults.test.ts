import { describe, expect, it } from "vitest";
import { buildInitialInputDefaultsForPorts } from "./inputDefaults";

describe("motion graph input defaults", () => {
  it("stores visible numeric and boolean port defaults for new nodes", () => {
    expect(
      buildInitialInputDefaultsForPorts(
        [
          {
            id: "amount",
            name: "Amount",
            type: "f32",
            direction: "input",
          },
          {
            id: "enabled",
            name: "Enabled",
            type: "bool",
            direction: "input",
          },
          {
            id: "label",
            name: "Label",
            type: "string",
            direction: "input",
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
