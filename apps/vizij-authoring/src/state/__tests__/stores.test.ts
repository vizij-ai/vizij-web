import { describe, expect, it, vi } from "vitest";
import {
  createAuthoringCompileTargets,
  createGraphRuntimeStore,
  resolveRuntimeBundleAcknowledgementPatch,
  resolveRuntimeErrorCompilePatch,
  resolveVisibleAuthoringCompileState,
} from "../graphRuntimeStore";
import { createBindingAuthoringStore } from "../bindingAuthoringStore";
import { createSelectionStore } from "../selectionStore";
import { createPoseRigStore } from "../../poseRig/store";

describe("graphRuntimeStore", () => {
  it("merges partial updates and notifies subscribers", () => {
    const store = createGraphRuntimeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState({ faceId: "demo", graphStatus: "ready" });
    expect(store.getState().faceId).toBe("demo");
    expect(store.getState().graphStatus).toBe("ready");
    expect(store.getState().authoringCompileStatus).toBe("idle");
    expect(listener).toHaveBeenCalledTimes(1);
    store.setState({
      authoringCompileStatus: "registered",
      authoringCompileTarget: "motiongraph",
      authoringCompileSignature: "abc",
    });
    expect(store.getState().authoringCompileStatus).toBe("registered");
    expect(store.getState().authoringCompileTarget).toBe("motiongraph");
    expect(store.getState().authoringCompileSignature).toBe("abc");
    expect(store.getState().authoringCompileTargets.motiongraph).toMatchObject({
      status: "registered",
      signature: "abc",
    });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.setState({ faceSegment: "segment" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("builds fresh compile target maps for runtime reset/error states", () => {
    const idleTargets = createAuthoringCompileTargets();
    const errorTargets = createAuthoringCompileTargets({
      status: "runtime-error",
      message: "runtime failed",
      signature: null,
    });

    expect(idleTargets.animation).toEqual({
      status: "idle",
      message: null,
      signature: null,
    });
    expect(errorTargets.animation).toEqual({
      status: "runtime-error",
      message: "runtime failed",
      signature: null,
    });
    expect(errorTargets.animation).not.toBe(errorTargets.motiongraph);
  });

  it("preserves explicit all-target compile reset maps", () => {
    const store = createGraphRuntimeStore();

    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileSignature: "animation-v1",
    });
    store.setState({
      authoringCompileStatus: "runtime-error",
      authoringCompileTarget: "animation",
      authoringCompileMessage: "runtime failed",
      authoringCompileSignature: null,
      authoringCompileTargets: createAuthoringCompileTargets({
        status: "runtime-error",
        message: "runtime failed",
        signature: null,
      }),
    });

    expect(store.getState().authoringCompileTargets).toEqual({
      "runtime-graph": {
        status: "runtime-error",
        message: "runtime failed",
        signature: null,
      },
      animation: {
        status: "runtime-error",
        message: "runtime failed",
        signature: null,
      },
      motiongraph: {
        status: "runtime-error",
        message: "runtime failed",
        signature: null,
      },
    });
  });

  it("does not demote a registered compile target on a matching compiled update", () => {
    const store = createGraphRuntimeStore();

    store.setState({
      authoringCompileStatus: "registered",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });
    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });

    expect(store.getState().authoringCompileStatus).toBe("registered");
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "registered",
      message: null,
      signature: "animation-v1",
    });

    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v2",
    });

    expect(store.getState().authoringCompileStatus).toBe("compiled");
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "compiled",
      message: null,
      signature: "animation-v2",
    });
  });

  it("does not hide a matching runtime-error target on a compiled update", () => {
    const store = createGraphRuntimeStore();

    store.setState({
      authoringCompileStatus: "runtime-error",
      authoringCompileTarget: "animation",
      authoringCompileMessage: "animation registration failed",
      authoringCompileSignature: "animation-v1",
    });
    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });

    expect(store.getState().authoringCompileStatus).toBe("runtime-error");
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "runtime-error",
      message: "animation registration failed",
      signature: "animation-v1",
    });

    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v2",
    });

    expect(store.getState().authoringCompileStatus).toBe("compiled");
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "compiled",
      message: null,
      signature: "animation-v2",
    });
  });

  it("surfaces the worst compile target state before the latest target", () => {
    const targets = createAuthoringCompileTargets();
    targets["runtime-graph"] = {
      status: "runtime-error",
      message: "runtime graph failed",
      signature: null,
    };
    targets.animation = {
      status: "registered",
      message: null,
      signature: "animation-v1",
    };

    expect(
      resolveVisibleAuthoringCompileState({
        authoringCompileTarget: "animation",
        authoringCompileTargets: targets,
      }),
    ).toMatchObject({
      target: "runtime-graph",
      status: "runtime-error",
      message: "runtime graph failed",
    });
  });

  it("uses the latest compile target as the tie-breaker for equal states", () => {
    const targets = createAuthoringCompileTargets();
    targets.animation = {
      status: "compiled",
      message: null,
      signature: "animation-v1",
    };
    targets.motiongraph = {
      status: "compiled",
      message: null,
      signature: "motiongraph-v1",
    };

    expect(
      resolveVisibleAuthoringCompileState({
        authoringCompileTarget: "motiongraph",
        authoringCompileTargets: targets,
      }),
    ).toMatchObject({
      target: "motiongraph",
      status: "compiled",
      signature: "motiongraph-v1",
    });
  });

  it("promotes only matching runtime bundle acknowledgements to registered", () => {
    const store = createGraphRuntimeStore();
    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });

    store.setState((state) =>
      resolveRuntimeBundleAcknowledgementPatch(state, {
        source: { key: "animation", signature: "stale" },
        revision: 1,
        controllers: { graphs: ["graph-a", "graph-b"], anims: [] },
        reregistered: true,
        reloadedAssets: false,
      }),
    );

    expect(store.getState().runtimeViewGraphCount).toBe(2);
    expect(store.getState().authoringCompileTargets.animation.status).toBe(
      "compiled",
    );

    store.setState((state) =>
      resolveRuntimeBundleAcknowledgementPatch(state, {
        source: { key: "animation", signature: "animation-v1" },
        revision: 2,
        controllers: { graphs: ["graph-a", "graph-b", "graph-c"], anims: [] },
        reregistered: true,
        reloadedAssets: false,
      }),
    );

    expect(store.getState().runtimeViewGraphCount).toBe(3);
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "registered",
      message: null,
      signature: "animation-v1",
    });

    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "motiongraph",
      authoringCompileMessage: null,
      authoringCompileSignature: "motiongraph-v1",
    });
    store.setState((state) =>
      resolveRuntimeBundleAcknowledgementPatch(state, {
        source: { key: "motiongraph", signature: "motiongraph-v1" },
        revision: 3,
        controllers: {
          graphs: ["graph-a", "graph-b", "graph-c", "graph-d"],
          anims: [],
        },
        reregistered: false,
        reloadedAssets: false,
      }),
    );

    expect(store.getState().runtimeViewGraphCount).toBe(4);
    expect(store.getState().authoringCompileTargets.motiongraph).toMatchObject({
      status: "registered",
      message: null,
      signature: "motiongraph-v1",
    });
  });

  it("keeps matching runtime bundle acknowledgements idempotent after registration", () => {
    const store = createGraphRuntimeStore();
    store.setState({
      authoringCompileStatus: "registered",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });

    store.setState((state) =>
      resolveRuntimeBundleAcknowledgementPatch(state, {
        source: { key: "animation", signature: "animation-v1" },
        revision: 2,
        controllers: { graphs: ["graph-a"], anims: ["animation-a"] },
        reregistered: true,
        reloadedAssets: false,
      }),
    );

    expect(store.getState().runtimeViewGraphCount).toBe(1);
    expect(store.getState().authoringCompileStatus).toBe("registered");
    expect(store.getState().authoringCompileTarget).toBe("animation");
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "registered",
      message: null,
      signature: "animation-v1",
    });
  });

  it("applies sourced runtime errors without failing unrelated targets", () => {
    const store = createGraphRuntimeStore();
    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "runtime-graph",
      authoringCompileMessage: null,
      authoringCompileSignature: "graph-v1",
    });
    store.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "animation",
      authoringCompileMessage: null,
      authoringCompileSignature: "animation-v1",
    });

    store.setState((state) =>
      resolveRuntimeErrorCompilePatch(state, {
        message: "graph registration failed",
        sources: [{ key: "runtime-graph", signature: "graph-v1" }],
      }),
    );

    expect(
      store.getState().authoringCompileTargets["runtime-graph"],
    ).toMatchObject({
      status: "runtime-error",
      message: "graph registration failed",
      signature: "graph-v1",
    });
    expect(store.getState().authoringCompileTargets.animation).toMatchObject({
      status: "compiled",
      message: null,
    });
  });
});

describe("bindingAuthoringStore", () => {
  it("registers partial updates", () => {
    const store = createBindingAuthoringStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState({ featureLabelOverrides: { foo: "bar" } });
    expect(store.getState().featureLabelOverrides.foo).toBe("bar");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setState({ standardInputRoots: ["root"] });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("selectionStore", () => {
  it("updates selection stack", () => {
    const store = createSelectionStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState({
      selectionStack: [{ id: "a", type: "shape", namespace: "default" }],
    });
    expect(store.getState().selectionStack).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setState({ hoveredId: "demo" } as any);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("poseRigStore", () => {
  it("stores pose rig snapshots", () => {
    const store = createPoseRigStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setState((state) => ({
      ...state,
      rigName: "custom",
      poses: [{ id: "pose_1" } as any],
    }));
    expect(store.getState().rigName).toBe("custom");
    expect(store.getState().poses).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
