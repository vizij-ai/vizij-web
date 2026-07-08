import { describe, expect, it } from "vitest";
import { getVisibleVariablesSurfaces } from "./variablesSurfaceOrder";

describe("getVisibleVariablesSurfaces", () => {
  it("returns surfaces in deterministic visibility order", () => {
    const surfaces = getVisibleVariablesSurfaces({
      variables: { isVisible: true },
      poses: { isVisible: true },
      materials: { isVisible: true },
      inputs: { isVisible: true },
    });

    expect(surfaces).toEqual(["variables", "poses", "pose-groups", "inputs"]);
  });

  it("maps materials visibility to pose-groups in the ordered list", () => {
    const surfaces = getVisibleVariablesSurfaces({
      variables: { isVisible: false },
      poses: { isVisible: false },
      materials: { isVisible: true },
      inputs: { isVisible: true },
    });

    expect(surfaces).toEqual(["pose-groups", "inputs"]);
  });
});
