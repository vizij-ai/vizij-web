import { describe, expect, it } from "vitest";
import { canonicalizeGraphComparable, diffGraphSpecs } from "./graphDiff";

describe("canonicalizeGraphComparable", () => {
  it("treats permutation-only list changes as equivalent", () => {
    const imported = {
      spec: {
        nodes: [
          { id: "n2", type: "output", params: { path: "rig/face/b" } },
          { id: "n1", type: "input", params: { path: "rig/face/a" } },
        ],
        edges: [
          {
            from: { node_id: "n1" },
            to: { node_id: "n2", input: "in" },
          },
          {
            from: { node_id: "n2" },
            to: { node_id: "n3", input: "in" },
          },
        ],
      },
    };
    const rebuilt = {
      spec: {
        nodes: [
          { id: "n1", type: "input", params: { path: "rig/face/a" } },
          { id: "n2", type: "output", params: { path: "rig/face/b" } },
        ],
        edges: [
          {
            from: { node_id: "n2" },
            to: { node_id: "n3", input: "in" },
          },
          {
            from: { node_id: "n1" },
            to: { node_id: "n2", input: "in" },
          },
        ],
      },
    };

    const importedComparable = canonicalizeGraphComparable(imported);
    const rebuiltComparable = canonicalizeGraphComparable(rebuilt);
    const diff = diffGraphSpecs(importedComparable, rebuiltComparable);
    expect(diff.entries).toEqual([]);
  });

  it("still reports real value mismatches", () => {
    const importedComparable = canonicalizeGraphComparable({
      spec: { nodes: [{ id: "n1", params: { path: "rig/face/a" } }] },
    });
    const rebuiltComparable = canonicalizeGraphComparable({
      spec: { nodes: [{ id: "n1", params: { path: "rig/face/b" } }] },
    });
    const diff = diffGraphSpecs(importedComparable, rebuiltComparable);
    expect(diff.entries.length).toBeGreaterThan(0);
    expect(diff.entries.some((entry) => entry.kind === "mismatch")).toBe(true);
  });
});
