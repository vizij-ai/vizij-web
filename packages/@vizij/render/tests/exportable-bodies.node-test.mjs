import test from "node:test";
import assert from "node:assert/strict";
import { selectExportableGroupEntries } from "../src/functions/exportable-bodies.ts";

test("falls back to top-level groups when rootBounds metadata is missing", () => {
  const world = {
    root: {
      id: "root",
      type: "group",
      parent: null,
    },
    child: {
      id: "child",
      type: "group",
      parent: "root",
    },
  };

  const selected = selectExportableGroupEntries(world);
  assert.deepEqual(
    selected.map((entry) => entry.id),
    ["root"],
  );
});

test("resolves explicit filter ids even when rootBounds metadata is missing", () => {
  const world = {
    root: {
      id: "root",
      type: "group",
      parent: null,
    },
  };

  const selected = selectExportableGroupEntries(world, ["root"]);
  assert.deepEqual(
    selected.map((entry) => entry.id),
    ["root"],
  );
});

test("prefers rootBounds-tagged groups when available", () => {
  const world = {
    root_with_bounds: {
      id: "root_with_bounds",
      type: "group",
      parent: null,
      rootBounds: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
    },
    root_without_bounds: {
      id: "root_without_bounds",
      type: "group",
      parent: null,
    },
  };

  const selected = selectExportableGroupEntries(world);
  assert.deepEqual(
    selected.map((entry) => entry.id),
    ["root_with_bounds"],
  );
});
