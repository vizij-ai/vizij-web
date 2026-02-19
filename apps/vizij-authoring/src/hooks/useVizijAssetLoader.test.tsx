import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { useVizijAssetLoader } from "./useVizijAssetLoader";

vi.mock("@vizij/render", () => ({
  useVizijStore: vi.fn(),
  useVizijStoreSetter: vi.fn(),
}));

const mockedUseVizijStore = vi.mocked(useVizijStore);
const mockedUseVizijStoreSetter = vi.mocked(useVizijStoreSetter);

describe("useVizijAssetLoader", () => {
  const addWorldElements = vi.fn();
  const setStoreState = vi.fn();

  beforeEach(() => {
    addWorldElements.mockReset();
    setStoreState.mockReset();

    mockedUseVizijStore.mockImplementation((selector: any) =>
      selector({
        addWorldElements,
      }),
    );
    mockedUseVizijStoreSetter.mockReturnValue(setStoreState as any);
  });

  it("accepts derived root fallback when metadata bounds are missing", async () => {
    const hook = renderHook(() => useVizijAssetLoader());

    await act(async () => {
      await hook.result.current.loadVizij(
        async () =>
          ({
            world: {
              root: {
                id: "root",
                type: "group",
                root: true,
              },
            },
            animatables: {},
            bundle: { version: 1 },
          }) as any,
        "derived-root.glb",
      );
    });

    expect(hook.result.current.rootId).toBe("root");
    expect(hook.result.current.sourceName).toBe("derived-root.glb");
    expect(hook.result.current.error).toBeNull();
    expect(addWorldElements).toHaveBeenCalledTimes(1);
  });

  it("keeps existing loaded state when candidate load is blocked", async () => {
    const hook = renderHook(() => useVizijAssetLoader());

    await act(async () => {
      await hook.result.current.loadVizij(
        async () =>
          ({
            world: {
              root: {
                id: "root",
                type: "group",
                root: true,
              },
            },
            animatables: {},
            bundle: { version: 1, metadata: { id: "stable" } },
          }) as any,
        "stable.glb",
      );
    });

    await act(async () => {
      await hook.result.current.loadVizij(
        async () =>
          ({
            world: {
              shape_1: {
                id: "shape_1",
                type: "shape",
              },
            },
            animatables: {},
            bundle: { version: 1, metadata: { id: "bad" } },
          }) as any,
        "invalid.glb",
      );
    });

    expect(hook.result.current.rootId).toBe("root");
    expect(hook.result.current.sourceName).toBe("stable.glb");
    expect((hook.result.current.bundle as any)?.metadata?.id).toBe("stable");
    expect(hook.result.current.error).toMatch(
      /Unable to resolve a Vizij root/i,
    );
    expect(addWorldElements).toHaveBeenCalledTimes(1);
    expect(setStoreState).toHaveBeenCalledTimes(1);
  });
});
