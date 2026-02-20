import { describe, expect, it, vi } from "vitest";
import type { AnimatableValue, StandardRigInput } from "@vizij/utils";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { createGraphRuntimeStore } from "../../state/graphRuntimeStore";
import {
  applyGraphOutputsToAnimatables,
  stageGraphInputsFromState,
  subscribeRuntimeInputBridgeAvailable,
} from "../graphRuntime";

describe("subscribeRuntimeInputBridgeAvailable", () => {
  it("replays staged defaults when runtime bridge becomes available after graph setup", () => {
    const store = createGraphRuntimeStore({
      graphStatus: "ready",
      stageRuntimeInput: undefined,
    });
    const runtimeStageSpy = vi.fn();
    const bindingsById = new Map([["jaw_open", "rig/face/standard/jaw/open"]]);
    const standardInputsById = new Map([
      [
        "jaw_open",
        {
          id: "jaw_open",
          path: "/standard/jaw/open",
          defaultValue: 0.42,
        } as StandardRigInput,
      ],
    ]);

    const unsubscribe = subscribeRuntimeInputBridgeAvailable(store, () => {
      const stageRuntimeInput = store.getState().stageRuntimeInput;
      if (!stageRuntimeInput) {
        return;
      }
      stageGraphInputsFromState({
        graphStatus: "ready",
        bindingsById,
        fallbackBindings: [],
        inputValues: {},
        standardInputsById,
        stageRigInput: (graphPath, payload) =>
          stageRuntimeInput(graphPath, payload.float),
        clearRigStaged: () => {},
      });
    });

    store.setState({ graphSpec: { nodes: [] } as GraphSpec });
    expect(runtimeStageSpy).not.toHaveBeenCalled();

    store.setState({
      stageRuntimeInput: (path, value) => runtimeStageSpy(path, value),
    });

    expect(runtimeStageSpy).toHaveBeenCalledWith(
      "rig/face/standard/jaw/open",
      0.42,
    );

    unsubscribe();
  });

  it("fires when runtime bridge callback is replaced", () => {
    const first = vi.fn();
    const second = vi.fn();
    const store = createGraphRuntimeStore({ stageRuntimeInput: first });
    const onAvailable = vi.fn();

    const unsubscribe = subscribeRuntimeInputBridgeAvailable(
      store,
      onAvailable,
    );
    store.setState({ stageRuntimeInput: first });
    expect(onAvailable).toHaveBeenCalledTimes(0);

    store.setState({ stageRuntimeInput: second });
    expect(onAvailable).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe("applyGraphOutputsToAnimatables", () => {
  it("ignores malformed write payloads and still applies valid writes", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const setValue = vi.fn();
    const drivenAnimatablesRef = {
      current: new Set<string>(["rig/face/standard/eye/open"]),
    };
    const animatables: Record<string, AnimatableValue> = {
      "rig/face/standard/jaw/open": {
        id: "rig/face/standard/jaw/open",
        type: "number",
        default: 0,
        constraints: {},
      },
      "rig/face/standard/eye/open": {
        id: "rig/face/standard/eye/open",
        type: "number",
        default: 0.1,
        constraints: {},
      },
    };

    applyGraphOutputsToAnimatables({
      result: {
        writes: [
          { path: "rig/face/standard/jaw/open", value: { float: 0.6 } },
          { path: 42, value: { float: 0.2 } },
          null,
        ],
      },
      animatables,
      namespace: "default",
      setValue,
      drivenAnimatablesRef,
      resetDrivenAnimatables: vi.fn(),
    });

    expect(setValue).toHaveBeenCalledWith(
      "rig/face/standard/jaw/open",
      "default",
      0.6,
    );
    expect(setValue).toHaveBeenCalledWith(
      "rig/face/standard/eye/open",
      "default",
      0.1,
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[vizij-authoring] Ignored 2 invalid graph runtime write entries.",
      expect.any(Object),
    );

    warnSpy.mockRestore();
  });

  it("warns when writes container is not an array", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    applyGraphOutputsToAnimatables({
      result: { writes: "bad-payload" },
      animatables: {},
      namespace: "default",
      setValue: vi.fn(),
      drivenAnimatablesRef: { current: new Set<string>() },
      resetDrivenAnimatables: vi.fn(),
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "[vizij-authoring] Ignored graph runtime writes because payload.writes was not an array.",
      { writes: "bad-payload" },
    );
    warnSpy.mockRestore();
  });
});
