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
      case "float_sink":
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

  it("allows scalar passthrough outputs from damp into float inputs", () => {
    expect(
      checkConnectionCompatibility(registry, "damp", "abs", "out", "in", {
        sourceNodeId: "damp_1",
        nodes: [
          { id: "float_1", type: "float_source", data: {} },
          { id: "damp_1", type: "damp", data: {} },
          { id: "abs_1", type: "abs", data: {} },
        ],
        edges: [
          {
            source: "float_1",
            target: "damp_1",
            sourceHandle: "out",
            targetHandle: "in",
          },
        ],
      }).ok,
    ).toBe(true);
  });

  it("allows scalar passthrough outputs from damp fed by authoring input nodes", () => {
    expect(
      checkConnectionCompatibility(registry, "input", "damp", "out", "in").ok,
    ).toBe(true);

    expect(
      checkConnectionCompatibility(registry, "damp", "abs", "out", "in", {
        sourceNodeId: "damp_1",
        nodes: [
          { id: "input_1", type: "input", data: {} },
          { id: "damp_1", type: "damp", data: {} },
        ],
        edges: [
          {
            source: "input_1",
            target: "damp_1",
            sourceHandle: "out",
            targetHandle: "in",
          },
        ],
      }).ok,
    ).toBe(true);
  });

  it("treats numeric input defaults as scalar passthrough inputs", () => {
    expect(
      checkConnectionCompatibility(registry, "damp", "abs", "out", "in", {
        sourceNodeId: "damp_1",
        nodes: [
          {
            id: "damp_1",
            type: "damp",
            data: { inputDefaults: { in: "0.5" } },
          },
        ],
        edges: [],
      }).ok,
    ).toBe(true);
  });

  it("keeps damp outputs blocked for float inputs until scalar shape is established", () => {
    const result = checkConnectionCompatibility(
      registry,
      "damp",
      "float_sink",
      "out",
      "in",
      {
        sourceNodeId: "damp_1",
        nodes: [
          { id: "damp_1", type: "damp", data: {} },
          { id: "sink_1", type: "float_sink", data: {} },
        ],
        edges: [],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Incompatible types/);
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
