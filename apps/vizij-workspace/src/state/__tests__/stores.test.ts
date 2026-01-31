import { describe, expect, it, vi } from "vitest";
import { createGraphRuntimeStore } from "../graphRuntimeStore";
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
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.setState({ faceSegment: "segment" });
    expect(listener).toHaveBeenCalledTimes(1);
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
