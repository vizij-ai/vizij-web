import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { VizijBundleExtension } from "@vizij/render";
import { useProfiles } from "./useProfiles";

// The registry is the runtime's, not this app's — stub it so the hook's own
// behaviour is under test rather than the wasm's. `vi.mock` is hoisted above
// the imports, so the stub is in place before `useProfiles` resolves it.
const { profilesMock, profileMock } = vi.hoisted(() => ({
  profilesMock: vi.fn(),
  profileMock: vi.fn(),
}));
vi.mock("@vizij/runtime", () => ({
  profiles: profilesMock,
  profile: profileMock,
}));

const KEYS = [
  { path: "rig/quori_latest/standard/vizij/expression/happy" },
  { path: "rig/quori_latest/standard/vizij/viseme/aa" },
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

beforeEach(() => {
  profilesMock
    .mockReset()
    .mockResolvedValue([
      {
        id: "vizij-face",
        version: "v1",
        title: "Vizij face",
        description: "",
        keys: 81,
      },
    ]);
  profileMock
    .mockReset()
    .mockImplementation(async (id: string) =>
      id === "vizij-face" ? { id, version: "v1", keys: KEYS } : null,
    );
});

describe("useProfiles", () => {
  it("lists the registry the runtime serves", async () => {
    const harness = renderAgainst(bundleWith());
    await waitFor(() =>
      expect(harness.view.result.current.available).toHaveLength(1),
    );
    expect(harness.view.result.current.available[0]!.id).toBe("vizij-face");
  });

  // A profile's paths address one face's store, so the import asks for it with
  // the open face's rig prefix.
  it("fetches the profile with this face's rig prefix", async () => {
    const harness = renderAgainst(bundleWith());
    await act(async () => {
      await harness.view.result.current.importProfile("vizij-face");
    });
    expect(profileMock).toHaveBeenCalledWith("vizij-face", "rig/quori_latest/");
  });

  it("declares the imported profile on the bundle", async () => {
    const harness = renderAgainst(bundleWith());
    await act(async () => {
      await harness.view.result.current.importProfile("vizij-face");
    });
    const declared = harness.bundle()?.profiles ?? [];
    expect(declared).toHaveLength(1);
    expect(declared[0]!.id).toBe("vizij-face");
    expect(declared[0]!.keys).toHaveLength(2);
  });

  it("replaces rather than duplicates when re-imported", async () => {
    const harness = renderAgainst(
      bundleWith([{ id: "vizij-face", version: "v0", keys: [] }]),
    );
    await act(async () => {
      await harness.view.result.current.importProfile("vizij-face");
    });
    const declared = harness.bundle()?.profiles ?? [];
    expect(declared).toHaveLength(1);
    expect(declared[0]!.version).toBe("v1");
  });

  it("resolves null and declares nothing for an unknown id", async () => {
    const harness = renderAgainst(bundleWith());
    let result: unknown;
    await act(async () => {
      result = await harness.view.result.current.importProfile("nope");
    });
    expect(result).toBeNull();
    expect(harness.bundle()?.profiles ?? []).toHaveLength(0);
  });

  it("removes a declared profile and leaves the others", async () => {
    const harness = renderAgainst(
      bundleWith([
        { id: "vizij-face", version: "v1", keys: KEYS },
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
      bundleWith([{ id: "vizij-face", version: "v1", keys: KEYS }]),
    );
    expect(
      harness.view.result.current.profilePaths("vizij-face"),
    ).toStrictEqual(KEYS.map((k) => k.path));
    expect(harness.view.result.current.profilePaths("absent")).toStrictEqual(
      [],
    );
  });

  // A face with no id has no rig prefix; the profile is then the portable form.
  it("asks for the unprefixed profile when the bundle declares no face id", async () => {
    const harness = renderAgainst(bundleWith(undefined, {}));
    await act(async () => {
      await harness.view.result.current.importProfile("vizij-face");
    });
    expect(profileMock).toHaveBeenCalledWith("vizij-face", "");
  });

  describe("importing from a file", () => {
    const asFile = (body: unknown) =>
      ({ name: "p.json", text: async () => JSON.stringify(body) }) as File;

    it("declares a well-formed profile", async () => {
      const harness = renderAgainst(bundleWith());
      await act(async () => {
        await harness.view.result.current.importProfileJson(
          asFile({ id: "lab", version: "v2", keys: KEYS }),
        );
      });
      expect((harness.bundle()?.profiles ?? [])[0]?.id).toBe("lab");
    });

    it("refuses JSON that is not a profile", async () => {
      const harness = renderAgainst(bundleWith());
      await act(async () => {
        await harness.view.result.current.importProfileJson(
          asFile({ nodes: [], edges: [] }),
        );
      });
      expect(harness.bundle()?.profiles ?? []).toHaveLength(0);
    });

    it("refuses a profile whose keys are not paths", async () => {
      const harness = renderAgainst(bundleWith());
      await act(async () => {
        await harness.view.result.current.importProfileJson(
          asFile({ id: "lab", version: "v2", keys: [{ name: "oops" }] }),
        );
      });
      expect(harness.bundle()?.profiles ?? []).toHaveLength(0);
    });
  });
});
