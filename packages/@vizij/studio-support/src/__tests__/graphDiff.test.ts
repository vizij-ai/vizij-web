import { describe, expect, it } from "vitest";
import {
  canonicalizeGraphComparable,
  diffGraphSpecs,
  rewriteGraphFaceNamespace,
} from "../utils/graphDiff";

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
    const mismatch = diff.entries.find((entry) => entry.kind === "mismatch");
    expect(mismatch?.context).toMatchObject({
      entityType: "node",
      entityId: "n1",
      scopePath: "spec.nodes[n1]",
      fieldPath: "params.path",
      fieldName: "path",
      importedType: "string",
      rebuiltType: "string",
    });
  });

  it("preserves order for primitive arrays", () => {
    const importedComparable = canonicalizeGraphComparable({
      spec: { values: [1, 2, 3] },
    });
    const rebuiltComparable = canonicalizeGraphComparable({
      spec: { values: [3, 2, 1] },
    });
    const diff = diffGraphSpecs(importedComparable, rebuiltComparable);
    expect(diff.entries.length).toBeGreaterThan(0);
  });

  it("annotates edge slot swaps with endpoint context and risk guidance", () => {
    const importedComparable = canonicalizeGraphComparable({
      spec: {
        nodes: [
          { id: "a", type: "input" },
          { id: "sub", type: "subtract" },
        ],
        edges: [
          { from: { node_id: "a" }, to: { node_id: "sub", input: "lhs" } },
        ],
      },
    });
    const rebuiltComparable = canonicalizeGraphComparable({
      spec: {
        nodes: [
          { id: "a", type: "input" },
          { id: "sub", type: "subtract" },
        ],
        edges: [
          { from: { node_id: "a" }, to: { node_id: "sub", input: "rhs" } },
        ],
      },
    });
    const diff = diffGraphSpecs(importedComparable, rebuiltComparable);
    const mismatch = diff.entries.find(
      (entry) =>
        entry.kind === "mismatch" && entry.path.endsWith("edges[0].to.input"),
    );
    expect(mismatch?.context?.entityType).toBe("edge");
    expect(mismatch?.context?.connection).toMatchObject({
      sameNodePair: true,
      slotOnlyChange: true,
      commutativeTarget: false,
      likelyNormalizationOnly: false,
      likelySemanticRisk: true,
      imported: {
        fromNodeId: "a",
        toNodeId: "sub",
        toNodeType: "subtract",
        toPort: "lhs",
      },
      rebuilt: {
        fromNodeId: "a",
        toNodeId: "sub",
        toNodeType: "subtract",
        toPort: "rhs",
      },
    });
  });

  it("resolves edge endpoint context when diff paths use synthetic spec prefix", () => {
    const importedComparable = canonicalizeGraphComparable({
      nodes: [
        { id: "a", type: "input" },
        { id: "sum", type: "add" },
      ],
      edges: [{ from: { node_id: "a" }, to: { node_id: "sum", input: "lhs" } }],
    });
    const rebuiltComparable = canonicalizeGraphComparable({
      nodes: [
        { id: "a", type: "input" },
        { id: "sum", type: "add" },
      ],
      edges: [
        {
          from: { node_id: "a" },
          to: { node_id: "sum", input: "operand_1" },
        },
      ],
    });
    const diff = diffGraphSpecs(importedComparable, rebuiltComparable);
    const mismatch = diff.entries.find(
      (entry) =>
        entry.kind === "mismatch" && entry.path.endsWith("edges[0].to.input"),
    );
    expect(mismatch?.context?.connection).toMatchObject({
      imported: {
        fromNodeId: "a",
        toNodeId: "sum",
        toNodeType: "add",
        toPort: "lhs",
      },
      rebuilt: {
        fromNodeId: "a",
        toNodeId: "sum",
        toNodeType: "add",
        toPort: "operand_1",
      },
      slotOnlyChange: true,
      commutativeTarget: true,
      likelyNormalizationOnly: true,
      likelySemanticRisk: false,
    });
  });
});

describe("rewriteGraphFaceNamespace", () => {
  it("rewrites rig path prefixes and face id literals", () => {
    const rewritten = rewriteGraphFaceNamespace(
      {
        face: "legacy_face",
        spec: {
          nodes: [
            { id: "in", params: { path: "rig/legacy_face/mouth/open" } },
            { id: "out", params: { path: "/rig/legacy_face/mouth/open" } },
          ],
        },
      },
      "legacy_face",
      "robot",
    ) as {
      face: string;
      spec: { nodes: Array<{ params: { path: string } }> };
    };

    expect(rewritten.face).toBe("robot");
    expect(rewritten.spec.nodes[0].params.path).toBe("rig/robot/mouth/open");
    expect(rewritten.spec.nodes[1].params.path).toBe("/rig/robot/mouth/open");
  });

  it("does not mutate unrelated strings", () => {
    const rewritten = rewriteGraphFaceNamespace(
      { label: "legacy_face_controller" },
      "legacy_face",
      "robot",
    ) as { label: string };
    expect(rewritten.label).toBe("legacy_face_controller");
  });
});
