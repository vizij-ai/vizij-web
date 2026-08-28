import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { VizijBundleExtension } from "@vizij/render";
import {
  STANDARD_ADAPTATION_KIND,
  adaptationGraphId,
  isAdaptationEntry,
  useStandardAdaptation,
} from "./useStandardAdaptation";

/**
 * A minimal bundle, as an imported face would carry. `metadata` is passed
 * whole so a test can hand over one with no `faceId` at all.
 */
function bundleWith(
  graphs: VizijBundleExtension["graphs"] = [],
  metadata: Record<string, unknown> = { faceId: "quori_latest" },
): VizijBundleExtension {
  return { version: 1, metadata, graphs } as VizijBundleExtension;
}

/**
 * Drive the hook against a mutable bundle, the way the loader does — the
 * updater is functional, so each call sees the previous value.
 */
function renderAgainst(initial: VizijBundleExtension | null) {
  let current = initial;
  const view = renderHook(() =>
    useStandardAdaptation({
      bundle: current,
      updateBundle: (updater) => {
        current =
          typeof updater === "function"
            ? (updater as (p: typeof current) => typeof current)(current)
            : updater;
      },
    }),
  );
  return {
    view,
    bundle: () => current,
    rerender: () => view.rerender(),
  };
}

describe("useStandardAdaptation", () => {
  it("names the graph after the face, matching the native bundler", () => {
    expect(adaptationGraphId("quori_latest")).toBe(
      "quori_latest_standard_adaptation",
    );
  });

  it("adds an adaptation declaring every control, wired to nothing", () => {
    const harness = renderAgainst(bundleWith());
    act(() => {
      harness.view.result.current.toggleAdaptation(true);
    });

    const graphs = harness.bundle()?.graphs ?? [];
    expect(graphs).toHaveLength(1);
    const entry = graphs[0]!;
    expect(entry.kind).toBe(STANDARD_ADAPTATION_KIND);
    expect(entry.id).toBe("quori_latest_standard_adaptation");

    const spec = entry.spec as { nodes: unknown[]; edges: unknown[] };
    expect(spec.nodes).toHaveLength(40);
    expect(spec.edges).toStrictEqual([]);
  });

  it("replaces rather than duplicates when re-enabled", () => {
    const existing = {
      id: "quori_latest_standard_adaptation",
      kind: STANDARD_ADAPTATION_KIND,
      spec: { nodes: [], edges: [] },
    };
    const harness = renderAgainst(bundleWith([existing]));
    act(() => {
      harness.view.result.current.toggleAdaptation(true);
    });

    const graphs = harness.bundle()?.graphs ?? [];
    expect(graphs).toHaveLength(1);
    expect((graphs[0]!.spec as { nodes: unknown[] }).nodes).toHaveLength(40);
  });

  it("removes the adaptation and leaves the face's other graphs alone", () => {
    const rig = { id: "quori_latest", kind: "rig", spec: { nodes: [] } };
    const adaptation = {
      id: "quori_latest_standard_adaptation",
      kind: STANDARD_ADAPTATION_KIND,
      spec: { nodes: [], edges: [] },
    };
    const harness = renderAgainst(bundleWith([rig, adaptation]));
    act(() => {
      harness.view.result.current.toggleAdaptation(false);
    });

    expect(harness.bundle()?.graphs).toStrictEqual([rig]);
  });

  it("reports whether the open face carries one", () => {
    expect(renderAgainst(bundleWith()).view.result.current.embedded).toBe(
      false,
    );
    const withEntry = renderAgainst(
      bundleWith([
        {
          id: "quori_latest_standard_adaptation",
          kind: STANDARD_ADAPTATION_KIND,
          spec: { nodes: [], edges: [] },
        },
      ]),
    );
    expect(withEntry.view.result.current.embedded).toBe(true);
  });

  // A bundle whose metadata carries no usable face id has no rig prefix and no
  // stable id, so embedding would write a graph the runtime cannot address.
  it("refuses to embed when the bundle declares no face id", () => {
    const harness = renderAgainst(bundleWith([], {}));
    expect(harness.view.result.current.graphId).toBeNull();
    act(() => {
      harness.view.result.current.toggleAdaptation(true);
    });
    expect(harness.bundle()?.graphs ?? []).toHaveLength(0);
  });

  it("ignores a non-string face id rather than stringifying it", () => {
    const harness = renderAgainst(bundleWith([], { faceId: 42 }));
    expect(harness.view.result.current.graphId).toBeNull();
  });

  it("recognises an adaptation entry by kind", () => {
    expect(
      isAdaptationEntry({ id: "x", kind: STANDARD_ADAPTATION_KIND, spec: {} }),
    ).toBe(true);
    expect(isAdaptationEntry({ id: "x", kind: "rig", spec: {} })).toBe(false);
  });
});
