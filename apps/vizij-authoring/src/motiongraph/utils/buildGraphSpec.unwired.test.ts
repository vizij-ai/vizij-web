import { describe, expect, it } from "vitest";
import { unwiredInputs } from "./buildGraphSpec";

const ports =
  (
    required: Record<string, string[]>,
    optional: Record<string, string[]> = {},
  ) =>
  (type: string) => ({
    inputs: [
      ...(required[type] ?? []).map((id) => ({ id })),
      ...(optional[type] ?? []).map((id) => ({ id, optional: true })),
    ],
  });

describe("unwiredInputs", () => {
  const spec = {
    nodes: [
      { id: "source", type: "input" },
      { id: "remap", type: "remap" },
      { id: "target", type: "output" },
    ],
    edges: [
      { from: { node_id: "remap" }, to: { node_id: "target", input: "in" } },
    ],
  };

  it("names each required input with no wire", () => {
    expect(
      unwiredInputs(spec, ports({ remap: ["in"], output: ["in"] })),
    ).toEqual(["remap.in"]);
  });

  it("leaves out optional inputs and types the registry does not know", () => {
    expect(
      unwiredInputs(spec, ports({ output: ["in"] }, { remap: ["in"] })),
    ).toEqual([]);
    expect(unwiredInputs(spec, () => ({ inputs: [] }))).toEqual([]);
  });

  it("is empty once every required input is wired", () => {
    const wired = {
      ...spec,
      edges: [
        ...spec.edges,
        { from: { node_id: "source" }, to: { node_id: "remap", input: "in" } },
      ],
    };
    expect(
      unwiredInputs(wired, ports({ remap: ["in"], output: ["in"] })),
    ).toEqual([]);
  });
});
