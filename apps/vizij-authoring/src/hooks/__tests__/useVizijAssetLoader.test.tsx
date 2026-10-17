import { act, renderHook } from "@testing-library/react";
import type { LoadedVizijAsset } from "@vizij/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FACE_LOADING_REASON,
  useVizijAssetLoader,
  type FaceLoadPhaseUpdate,
} from "../useVizijAssetLoader";
import {
  importFailure,
  poseGraphFailure,
  rigGraphCompileFailure,
  rigGraphFatalIssuesFailure,
} from "../../utils/faceLoadFailures";

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

  it("ignores stale session loads that begin after a newer import flow starts", async () => {
    const { result } = renderHook(() => useVizijAssetLoader());

    let staleSessionToken!: string;
    let activeSessionToken!: string;
    act(() => {
      staleSessionToken = result.current.beginImportFlow("first preset");
      activeSessionToken = result.current.beginImportFlow("second preset");
    });

    await act(async () => {
      await result.current.loadVizij(
        () => Promise.resolve(createLoadedAsset("root-stale")),
        "first.glb",
        { sessionToken: staleSessionToken },
      );
    });

    expect(result.current.faceLoadSessionToken).toBe(activeSessionToken);
    expect(result.current.rootId).toBeNull();
    expect(result.current.sourceName).toBeNull();
    expect(result.current.bundle).toBeNull();
    expect(addWorldElementsMock).not.toHaveBeenCalled();
  });

  it("invalidates in-flight loads when a newer import flow starts", async () => {
    const pending = createDeferred<LoadedVizijAsset>();
    const { result } = renderHook(() => useVizijAssetLoader());

    let sessionToken!: string;
    let run!: Promise<void>;
    act(() => {
      sessionToken = result.current.beginImportFlow("first preset");
      run = result.current.loadVizij(() => pending.promise, "first.glb", {
        sessionToken,
      });
      result.current.beginImportFlow("second preset");
    });

    await act(async () => {
      pending.resolve(createLoadedAsset("root-stale"));
      await run;
    });

    expect(result.current.rootId).toBeNull();
    expect(result.current.sourceName).toBeNull();
    expect(result.current.bundle).toBeNull();
    expect(addWorldElementsMock).not.toHaveBeenCalled();
  });

  it("reports a face loaded only once its import session completes", async () => {
    const { result } = renderHook(() => useVizijAssetLoader());
    expect(result.current.isFaceLoaded).toBe(false);

    let first!: string;
    act(() => {
      first = result.current.beginImportFlow("first.glb");
    });
    await act(async () => {
      await result.current.loadVizij(
        () => Promise.resolve(createLoadedAsset("root-first")),
        "first.glb",
        { sessionToken: first },
      );
    });

    // The asset is read; its bundle has yet to reach the editor.
    expect(result.current.rootId).toBe("root-first");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFaceLoaded).toBe(false);

    act(() => {
      result.current.completeImportFlow({ sessionToken: first });
    });
    expect(result.current.isFaceLoaded).toBe(true);

    // A new import begins: the previous face is still shown, but it is no
    // longer the face being loaded.
    act(() => {
      result.current.beginImportFlow("second.glb");
    });
    expect(result.current.rootId).toBe("root-first");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFaceLoaded).toBe(false);
  });

  it("marks the bundle synced when the bundle-sync step completes, not one of its substeps", async () => {
    const { result } = renderHook(() => useVizijAssetLoader());

    let sessionToken!: string;
    act(() => {
      sessionToken = result.current.beginImportFlow("face.glb");
    });
    await act(async () => {
      await result.current.loadVizij(
        () => Promise.resolve(createLoadedAsset("root-face")),
        "face.glb",
        { sessionToken },
      );
    });
    expect(result.current.faceLoadMilestones["asset-loaded"]).not.toBeNull();

    act(() => {
      result.current.updateExternalPhase({
        stepId: "bundle-sync",
        status: "active",
        sessionToken,
      });
      result.current.updateExternalPhase({
        stepId: "bundle-sync",
        substepId: "import-rig-graph",
        status: "complete",
        sessionToken,
      });
      result.current.updateExternalPhase({
        stepId: "rig-import-normalization",
        status: "complete",
        sessionToken,
      });
    });
    expect(result.current.faceLoadMilestones["bundle-synced"]).toBeNull();

    act(() => {
      result.current.updateExternalPhase({
        stepId: "bundle-sync",
        status: "complete",
        sessionToken,
      });
    });
    expect(result.current.faceLoadMilestones["bundle-synced"]).not.toBeNull();
  });
});

describe("useVizijAssetLoader: why the face is not loaded", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  async function renderLoadingFace() {
    const hook = renderHook(() => useVizijAssetLoader());
    let sessionToken!: string;
    act(() => {
      sessionToken = hook.result.current.beginImportFlow("face.glb");
    });
    await act(async () => {
      await hook.result.current.loadVizij(
        () => Promise.resolve(createLoadedAsset("root-face")),
        "face.glb",
        { sessionToken },
      );
    });
    const report = (update: Omit<FaceLoadPhaseUpdate, "sessionToken">) =>
      act(() => {
        hook.result.current.updateExternalPhase({ ...update, sessionToken });
      });
    return { ...hook, sessionToken, report };
  }

  it("gives no reason without a face or an import", () => {
    const { result } = renderHook(() => useVizijAssetLoader());
    expect(result.current.faceNotLoadedReason).toBeNull();
  });

  it("says the face is loading while its import is in progress", async () => {
    const { result, sessionToken } = await renderLoadingFace();
    expect(result.current.isFaceLoaded).toBe(false);
    expect(result.current.faceNotLoadedReason).toBe(FACE_LOADING_REASON);

    act(() => {
      result.current.completeImportFlow({ sessionToken });
    });
    expect(result.current.isFaceLoaded).toBe(true);
    expect(result.current.faceNotLoadedReason).toBeNull();
  });

  it.each([
    [
      "a fatal rig issue",
      {
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
      },
      rigGraphFatalIssuesFailure(["mouth_open: unknown slot 'nope'"]),
    ],
    [
      "a rig graph that does not compile",
      {
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
      },
      rigGraphCompileFailure("IR compile failed. Runtime apply blocked."),
    ],
    [
      "a rig graph whose import failed",
      { stepId: "bundle-sync", substepId: "import-rig-graph" },
      importFailure("rig graph", new Error("Graph spec is missing metadata.")),
    ],
    [
      "a pose config whose import failed",
      { stepId: "bundle-sync", substepId: "import-pose-config" },
      importFailure("pose config", new Error("Unsupported version: 7.")),
    ],
    [
      "a pose graph that failed to build",
      { stepId: "pose-graph-bootstrap", substepId: "normalize-pose-graph" },
      poseGraphFailure(new Error("bad pose node")),
    ],
  ])(
    "gives the cause when the load stops on %s",
    async (_name, step, message) => {
      const { result, report } = await renderLoadingFace();

      await report({ ...step, status: "error", message });
      expect(result.current.isFaceLoaded).toBe(false);
      expect(result.current.faceNotLoadedReason).toBe(message);

      // The step reporting again (the graph compiles, the import is retried)
      // withdraws the cause.
      await report({ ...step, status: "complete" });
      expect(result.current.faceNotLoadedReason).toBe(FACE_LOADING_REASON);
    },
  );

  it("forgets the previous load's failure when a new import begins", async () => {
    const { result, report } = await renderLoadingFace();
    await report({
      stepId: "bundle-sync",
      substepId: "import-rig-graph",
      status: "error",
      message: "The face's rig graph failed to import: boom",
    });

    act(() => {
      result.current.beginImportFlow("next.glb");
    });
    expect(result.current.faceNotLoadedReason).toBe(FACE_LOADING_REASON);
  });
});
