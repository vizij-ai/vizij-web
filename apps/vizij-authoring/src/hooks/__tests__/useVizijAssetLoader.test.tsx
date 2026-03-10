import { act, renderHook } from "@testing-library/react";
import type { LoadedVizijAsset } from "@vizij/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVizijAssetLoader } from "../useVizijAssetLoader";

const addWorldElementsMock = vi.fn();
const setStoreStateMock = vi.fn();

vi.mock("@vizij/render", () => ({
  useVizijStore: (
    selector: (state: {
      addWorldElements: typeof addWorldElementsMock;
    }) => unknown,
  ) =>
    selector({
      addWorldElements: addWorldElementsMock,
    }),
  useVizijStoreSetter: () => setStoreStateMock,
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function createLoadedAsset(rootId: string): LoadedVizijAsset {
  return {
    world: {
      [rootId]: {
        id: rootId,
        type: "group",
        rootBounds: { min: [0, 0], max: [1, 1] },
      },
    },
    animatables: {},
    animations: [],
    bundle: {
      graphs: [],
      animations: [],
    },
    scene: {
      name: `${rootId}-scene`,
    },
  } as unknown as LoadedVizijAsset;
}

describe("useVizijAssetLoader", () => {
  beforeEach(() => {
    addWorldElementsMock.mockReset();
    setStoreStateMock.mockReset();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("keeps the newest load when loaders resolve out of order", async () => {
    const first = createDeferred<LoadedVizijAsset>();
    const second = createDeferred<LoadedVizijAsset>();
    const { result } = renderHook(() => useVizijAssetLoader());

    let firstRun!: Promise<void>;
    let secondRun!: Promise<void>;
    act(() => {
      firstRun = result.current.loadVizij(() => first.promise, "first.glb");
      secondRun = result.current.loadVizij(() => second.promise, "second.glb");
    });

    await act(async () => {
      second.resolve(createLoadedAsset("root-second"));
      await secondRun;
    });

    expect(result.current.rootId).toBe("root-second");
    expect(result.current.sourceName).toBe("second.glb");
    expect(result.current.bundle).toEqual({
      graphs: [],
      animations: [],
    });
    expect(addWorldElementsMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(createLoadedAsset("root-first"));
      await firstRun;
    });

    expect(result.current.rootId).toBe("root-second");
    expect(result.current.sourceName).toBe("second.glb");
    expect(addWorldElementsMock).toHaveBeenCalledTimes(1);
    expect(setStoreStateMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        world: expect.objectContaining({
          "root-first": expect.anything(),
        }),
      }),
    );
  });

  it("invalidates in-flight loads when the session resets", async () => {
    const pending = createDeferred<LoadedVizijAsset>();
    const { result } = renderHook(() => useVizijAssetLoader());

    let run!: Promise<void>;
    act(() => {
      run = result.current.loadVizij(() => pending.promise, "pending.glb");
    });

    expect(result.current.isLoading).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.rootId).toBeNull();
    expect(result.current.bundle).toBeNull();

    await act(async () => {
      pending.resolve(createLoadedAsset("root-late"));
      await run;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.rootId).toBeNull();
    expect(result.current.bundle).toBeNull();
    expect(addWorldElementsMock).not.toHaveBeenCalled();
  });
});
