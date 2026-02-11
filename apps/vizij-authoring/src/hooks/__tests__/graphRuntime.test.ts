import { describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { createGraphRuntimeStore } from "../../state/graphRuntimeStore";
import {
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
