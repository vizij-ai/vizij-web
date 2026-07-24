import { describe, expect, it } from "vitest";
import { graphSpecDiff } from "../engine/graphSpecDiff";

const constant = (id: string, value: number) => ({
  id,
  type: "constant",
  params: { value: { f32: value } },
});
const output = (id: string, path: string) => ({
  id,
  type: "output",
  params: { path },
});
const edge = (from: string, to: string, input: string, selector?: unknown) => ({
  from: { node_id: from, output: "out" },
  to: { node_id: to, input },
  ...(selector ? { selector } : {}),
});

describe("graphSpecDiff", () => {
  it("returns null for structurally identical specs", () => {
    const spec = { nodes: [constant("a", 1)], edges: [] };
    expect(graphSpecDiff(spec, structuredClone(spec))).toBeNull();
  });

  it("is order-insensitive for node keys", () => {
    const a = {
      nodes: [{ id: "a", type: "constant", params: { value: { f32: 1 } } }],
      edges: [],
    };
    const b = {
      nodes: [{ params: { value: { f32: 1 } }, type: "constant", id: "a" }],
      edges: [],
    };
    expect(graphSpecDiff(a, b)).toBeNull();
  });

  it("upserts an added node", () => {
    const prev = { nodes: [constant("a", 1)], edges: [] };
    const next = { nodes: [constant("a", 1), constant("b", 2)], edges: [] };
    const diff = graphSpecDiff(prev, next)!;
    expect(diff.upsert_nodes.map((n) => n.id)).toEqual(["b"]);
    expect(diff.remove_nodes).toEqual([]);
  });

  it("upserts a node whose param changed", () => {
    const prev = { nodes: [constant("a", 1)], edges: [] };
    const next = { nodes: [constant("a", 2)], edges: [] };
    const diff = graphSpecDiff(prev, next)!;
    expect(diff.upsert_nodes.map((n) => n.id)).toEqual(["a"]);
  });

  it("removes a deleted node", () => {
    const prev = { nodes: [constant("a", 1), constant("b", 2)], edges: [] };
    const next = { nodes: [constant("a", 1)], edges: [] };
    const diff = graphSpecDiff(prev, next)!;
    expect(diff.remove_nodes).toEqual(["b"]);
    expect(diff.upsert_nodes).toEqual([]);
  });

  it("adding an edge upserts both endpoints and carries the edge", () => {
    const prev = { nodes: [constant("a", 1), output("out", "x/y")], edges: [] };
    const next = {
      nodes: [constant("a", 1), output("out", "x/y")],
      edges: [edge("a", "out", "in")],
    };
    const diff = graphSpecDiff(prev, next)!;
    expect(new Set(diff.upsert_nodes.map((n) => n.id))).toEqual(
      new Set(["a", "out"]),
    );
    // The upserted nodes are removed then re-added, so the edge must ride along.
    expect(diff.upsert_edges).toHaveLength(1);
    expect(diff.upsert_edges[0].to).toMatchObject({
      node_id: "out",
      input: "in",
    });
  });

  it("removing an edge whose endpoints survive reflects it via the upsert, not remove_edges", () => {
    const prev = {
      nodes: [constant("a", 1), output("out", "x/y")],
      edges: [edge("a", "out", "in")],
    };
    const next = { nodes: [constant("a", 1), output("out", "x/y")], edges: [] };
    const diff = graphSpecDiff(prev, next)!;
    // The edge change upserts its endpoints; `out` (removed+re-added) carries
    // only its surviving incident edges (none) — no explicit unwiring needed.
    expect(new Set(diff.upsert_nodes.map((n) => n.id))).toEqual(
      new Set(["a", "out"]),
    );
    expect(diff.upsert_edges).toEqual([]);
    expect(diff.remove_edges).toEqual([]);
  });

  it("carries an edge selector, and a selector change upserts the edge", () => {
    const sel = [{ field: "layers" }, { index: 0 }, { field: "gain" }];
    const prev = {
      nodes: [constant("a", 1), output("out", "x/y")],
      edges: [edge("a", "out", "in", sel)],
    };
    const next = {
      nodes: [constant("a", 1), output("out", "x/y")],
      edges: [
        edge("a", "out", "in", [
          { field: "layers" },
          { index: 1 },
          { field: "gain" },
        ]),
      ],
    };
    const diff = graphSpecDiff(prev, next)!;
    expect(diff.upsert_edges).toHaveLength(1);
    expect(diff.upsert_edges[0].selector).toEqual([
      { field: "layers" },
      { index: 1 },
      { field: "gain" },
    ]);
  });
});
