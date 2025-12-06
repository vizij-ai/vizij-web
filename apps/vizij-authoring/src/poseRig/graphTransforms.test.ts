import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { remapPoseGraphInputIds } from "./graphTransforms";

function buildRecord(values: Record<string, number>) {
  return {
    record: {
      values: {
        record: Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, { float: value }]),
        ),
      },
    },
  };
}

describe("remapPoseGraphInputIds", () => {
  it("rewrites record keys, entry arrays, and selectors", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "pose_neutral_record",
          type: "constant",
          params: {
            value: buildRecord({ foo: 0, keep: 1 }),
          },
        },
        {
          id: "pose_record_pose_a",
          type: "constant",
          params: {
            value: {
              record: {
                values: {
                  entries: [
                    { key: "foo", value: { float: 0.5 } },
                    { key: "keep", value: { float: 0 } },
                  ],
                },
              },
            },
          },
        },
      ],
      edges: [
        {
          from: { node_id: "pose_blend" },
          to: { node_id: "out_pose_a", input: "in" },
          selector: [{ field: "values" }, { field: "foo" }],
        },
      ],
    };

    remapPoseGraphInputIds(spec, [{ fromId: "foo", toId: "bar" }]);

    const neutralRecord = (spec.nodes?.[0]?.params as { value?: any }).value
      .record.values.record;
    expect(Object.keys(neutralRecord)).toContain("bar");
    expect(neutralRecord.bar).toEqual({ float: 0 });
    expect(neutralRecord.keep).toEqual({ float: 1 });

    const entries = (spec.nodes?.[1]?.params as { value?: any }).value.record
      .values.entries;
    expect(entries?.[0]?.key).toBe("bar");
    expect(entries?.[1]?.key).toBe("keep");

    const selector = spec.edges?.[0]?.selector;
    expect(selector?.[1]).toEqual({ field: "bar" });
  });

  it("ignores remaps with empty or matching identifiers", () => {
    const spec: GraphSpec = {
      nodes: [],
    };
    remapPoseGraphInputIds(spec, [
      { fromId: "", toId: "bar" },
      { fromId: "baz", toId: "baz" },
    ]);
    expect(spec.nodes).toEqual([]);
  });
});
