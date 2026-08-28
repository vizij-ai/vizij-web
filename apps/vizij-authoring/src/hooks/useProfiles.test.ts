import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { VizijBundleExtension } from "@vizij/render";
import { useProfiles } from "./useProfiles";

const PORTABLE_KEYS = [
  { path: "standard/vizij/expression/happy" },
  { path: "standard/vizij/viseme/aa" },
];

function bundleWith(
  profiles?: VizijBundleExtension["profiles"],
  metadata: Record<string, unknown> = { faceId: "quori_latest" },
): VizijBundleExtension {
  return { version: 1, metadata, graphs: [], profiles } as VizijBundleExtension;
}

function renderAgainst(initial: VizijBundleExtension | null) {
  let current = initial;
  const view = renderHook(() =>
    useProfiles({
      bundle: current,
      updateBundle: (updater) => {
        current =
          typeof updater === "function"
            ? (updater as (p: typeof current) => typeof current)(current)
            : updater;
      },
    }),
  );
  return { view, bundle: () => current };
}

const asFile = (body: unknown, name = "p.json") =>
  ({ name, text: async () => JSON.stringify(body) }) as File;

const portable = (id = "vizij-face") => ({
  id,
  version: "v1",
  title: "Vizij face",
  keys: PORTABLE_KEYS,
});

describe("useProfiles", () => {
  it("declares an imported profile on the bundle", async () => {
    const harness = renderAgainst(bundleWith());
    await act(async () => {
      await harness.view.result.current.importProfileJson(asFile(portable()));
    });
    const declared = harness.bundle()?.profiles ?? [];
    expect(declared).toHaveLength(1);
    expect(declared[0]!.id).toBe("vizij-face");
  });

  // A profile file is portable — the paths are unprefixed — but the store is
  // not, so importing addresses them to the open face.
  it("addresses portable paths to the open face", async () => {
    const harness = renderAgainst(bundleWith());
    await act(async () => {
      await harness.view.result.current.importProfileJson(asFile(portable()));
    });
    expect(
      (harness.bundle()?.profiles ?? [])[0]!.keys.map((k) => k.path),
    ).toStrictEqual([
      "rig/quori_latest/standard/vizij/expression/happy",
      "rig/quori_latest/standard/vizij/viseme/aa",
    ]);
  });

  // A file exported from a face already carries a prefix; re-importing it must
  // not stack a second one.
  it("leaves an already-addressed path alone", async () => {
    const harness = renderAgainst(bundleWith());
    await act(async () => {
      await harness.view.result.current.importProfileJson(
        asFile({
          id: "vizij-face",
          version: "v1",
          keys: [{ path: "rig/other_face/standard/vizij/expression/happy" }],
        }),
      );
    });
    expect((harness.bundle()?.profiles ?? [])[0]!.keys[0]!.path).toBe(
      "rig/other_face/standard/vizij/expression/happy",
    );
  });

  it("imports portable paths verbatim when the face has no id", async () => {
    const harness = renderAgainst(bundleWith(undefined, {}));
    await act(async () => {
      await harness.view.result.current.importProfileJson(asFile(portable()));
    });
    expect((harness.bundle()?.profiles ?? [])[0]!.keys[0]!.path).toBe(
      "standard/vizij/expression/happy",
    );
  });

  it("replaces rather than duplicates when re-imported", async () => {
    const harness = renderAgainst(
      bundleWith([{ id: "vizij-face", version: "v0", keys: [] }]),
    );
    await act(async () => {
      await harness.view.result.current.importProfileJson(asFile(portable()));
    });
    const declared = harness.bundle()?.profiles ?? [];
    expect(declared).toHaveLength(1);
    expect(declared[0]!.version).toBe("v1");
  });

  it("removes a declared profile and leaves the others", () => {
    const harness = renderAgainst(
      bundleWith([
        { id: "vizij-face", version: "v1", keys: PORTABLE_KEYS },
        { id: "ros4hri", version: "v1", keys: [] },
      ]),
    );
    act(() => {
      harness.view.result.current.removeProfile("vizij-face");
    });
    expect((harness.bundle()?.profiles ?? []).map((p) => p.id)).toStrictEqual([
      "ros4hri",
    ]);
  });

  it("reports the paths a declared profile defines", () => {
    const harness = renderAgainst(
      bundleWith([{ id: "vizij-face", version: "v1", keys: PORTABLE_KEYS }]),
    );
    expect(
      harness.view.result.current.profilePaths("vizij-face"),
    ).toStrictEqual(PORTABLE_KEYS.map((k) => k.path));
    expect(harness.view.result.current.profilePaths("absent")).toStrictEqual(
      [],
    );
  });

  describe("refuses a file that is not a profile", () => {
    const refuses = async (body: unknown) => {
      const harness = renderAgainst(bundleWith());
      await act(async () => {
        await harness.view.result.current.importProfileJson(asFile(body));
      });
      expect(harness.bundle()?.profiles ?? []).toHaveLength(0);
    };

    it("a graph spec", () => refuses({ nodes: [], edges: [] }));
    it("keys that are not paths", () =>
      refuses({ id: "lab", version: "v2", keys: [{ name: "oops" }] }));
    it("a missing version", () => refuses({ id: "lab", keys: PORTABLE_KEYS }));
  });

  it("refuses JSON that does not parse", async () => {
    const harness = renderAgainst(bundleWith());
    await act(async () => {
      await harness.view.result.current.importProfileJson({
        name: "bad.json",
        text: async () => "{not json",
      } as File);
    });
    expect(harness.bundle()?.profiles ?? []).toHaveLength(0);
  });
});
