import { describe, expect, test } from "vitest";
import {
  isConnectionCompatible,
  isConnectionCompatibleWithRegistry,
} from "../utils/connectionUtils";

test("compatible when types identical", () => {
  const src = { id: "a", type: "foo" } as any;
  const tgt = { id: "b", type: "foo" } as any;
  expect(isConnectionCompatible(src, tgt).ok).toBe(true);
});

test("compatible when source is constant", () => {
  const src = { id: "a", type: "constant" } as any;
  const tgt = { id: "b", type: "some" } as any;
  expect(isConnectionCompatible(src, tgt).ok).toBe(true);
});

test("compatible when target handle contains any", () => {
  const src = { id: "a", type: "foo" } as any;
  const tgt = { id: "b", type: "bar" } as any;
  expect(isConnectionCompatible(src, tgt, "out", "any_in").ok).toBe(true);
});

test("incompatible otherwise", () => {
  const src = { id: "a", type: "foo" } as any;
  const tgt = { id: "b", type: "bar" } as any;
  const res = isConnectionCompatible(src, tgt);
  expect(res.ok).toBe(false);
  expect(res.reason).toMatch(/Incompatible types/);
});

describe("isConnectionCompatibleWithRegistry", () => {
  const registry = {
    nodes: [],
    getPortsForType(typeId: string) {
      switch (typeId) {
        case "float_source":
          return {
            inputs: [],
            outputs: [{ id: "out", type: "float" }],
          };
        case "damp":
          return {
            inputs: [{ id: "in", type: "vector" }],
            outputs: [{ id: "out", type: "vector" }],
          };
        case "vector_source":
          return {
            inputs: [],
            outputs: [{ id: "out", type: "vector" }],
          };
        case "abs":
          return {
            inputs: [{ id: "in", type: "float" }],
            outputs: [{ id: "out", type: "float" }],
          };
        case "add":
          return {
            inputs: [],
            outputs: [{ id: "out", type: "float" }],
            variadicInputs: { id: "operand", type: "float" },
            variadicOutputs: null,
          };
        case "vector_math":
          return {
            inputs: [{ id: "lhs", type: "vector" }],
            outputs: [{ id: "out", type: "vector" }],
          };
        default:
          return { inputs: [], outputs: [] };
      }
    },
  };

  test("allows float outputs into damp input", () => {
    const src = { id: "src", type: "float_source" } as any;
    const tgt = { id: "tgt", type: "damp" } as any;

    expect(
      isConnectionCompatibleWithRegistry(registry, src, tgt, "out", "in").ok,
    ).toBe(true);
  });

  test("allows scalar passthrough outputs from damp into float inputs", () => {
    const src = { id: "damp_1", type: "damp", data: {} } as any;
    const tgt = { id: "abs_1", type: "abs" } as any;

    expect(
      isConnectionCompatibleWithRegistry(registry, src, tgt, "out", "in", {
        nodes: [{ id: "float_1", type: "float_source", data: {} }, src, tgt],
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

  test("allows vector outputs into scalar math inputs that preserve numeric layout", () => {
    const src = { id: "src", type: "vector_source" } as any;
    const tgt = { id: "tgt", type: "abs" } as any;

    expect(
      isConnectionCompatibleWithRegistry(registry, src, tgt, "out", "in").ok,
    ).toBe(true);
  });

  test("allows vector outputs into variadic scalar math inputs that preserve numeric layout", () => {
    const src = { id: "src", type: "vector_source" } as any;
    const tgt = { id: "tgt", type: "add" } as any;

    expect(
      isConnectionCompatibleWithRegistry(registry, src, tgt, "out", "operand_0")
        .ok,
    ).toBe(true);
  });

  test("keeps float outputs blocked for ordinary vector inputs", () => {
    const src = { id: "src", type: "float_source" } as any;
    const tgt = { id: "tgt", type: "vector_math" } as any;
    const result = isConnectionCompatibleWithRegistry(
      registry,
      src,
      tgt,
      "out",
      "lhs",
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Incompatible types/);
  });
});
