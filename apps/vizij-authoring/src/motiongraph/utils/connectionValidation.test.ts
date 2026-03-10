import { describe, expect, it } from "vitest";
import { checkConnectionCompatibility } from "./connectionValidation";

const registry = {
  getPortsForType(typeId: string) {
    switch (typeId) {
      case "float_source":
        return {
          inputs: [],
          outputs: [
            {
              id: "out",
              name: "Out",
              type: "float",
              direction: "output" as const,
            },
          ],
        };
      case "damp":
      case "slew":
      case "spring":
        return {
          inputs: [
            {
              id: "in",
              name: "In",
              type: "vector",
              direction: "input" as const,
            },
          ],
          outputs: [
            {
              id: "out",
              name: "Out",
              type: "vector",
              direction: "output" as const,
            },
          ],
        };
      case "vector_source":
        return {
          inputs: [],
          outputs: [
            {
              id: "out",
              name: "Out",
              type: "vector",
              direction: "output" as const,
            },
          ],
        };
      case "abs":
        return {
          inputs: [
            {
              id: "in",
              name: "In",
              type: "float",
              direction: "input" as const,
            },
          ],
          outputs: [
            {
              id: "out",
              name: "Out",
              type: "float",
              direction: "output" as const,
            },
          ],
        };
      case "add":
        return {
          inputs: [],
          outputs: [
            {
              id: "out",
              name: "Out",
              type: "float",
              direction: "output" as const,
            },
          ],
          variadicInputs: {
            id: "operand",
            type: "float",
          },
        };
      case "vector_math":
        return {
          inputs: [
            {
              id: "lhs",
              name: "Lhs",
              type: "vector",
              direction: "input" as const,
            },
          ],
          outputs: [
            {
              id: "out",
              name: "Out",
              type: "vector",
              direction: "output" as const,
            },
          ],
        };
      default:
        return { inputs: [], outputs: [] };
    }
  },
};

describe("checkConnectionCompatibility", () => {
  it("allows float outputs into damp", () => {
    expect(
      checkConnectionCompatibility(
        registry,
        "float_source",
        "damp",
        "out",
        "in",
      ).ok,
    ).toBe(true);
  });

  it("allows float outputs into slew", () => {
    expect(
      checkConnectionCompatibility(
        registry,
        "float_source",
        "slew",
        "out",
        "in",
      ).ok,
    ).toBe(true);
  });

  it("allows vector outputs into scalar math inputs that preserve numeric layout", () => {
    expect(
      checkConnectionCompatibility(
        registry,
        "vector_source",
        "abs",
        "out",
        "in",
      ).ok,
    ).toBe(true);
  });

  it("allows vector outputs into variadic scalar math inputs that preserve numeric layout", () => {
    expect(
      checkConnectionCompatibility(
        registry,
        "vector_source",
        "add",
        "out",
        "operand_0",
      ).ok,
    ).toBe(true);
  });

  it("continues to reject float outputs into ordinary vector-only inputs", () => {
    const result = checkConnectionCompatibility(
      registry,
      "float_source",
      "vector_math",
      "out",
      "lhs",
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Incompatible types/);
  });
});
