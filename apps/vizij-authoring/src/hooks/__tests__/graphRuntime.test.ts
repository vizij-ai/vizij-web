import { describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { GraphSpec } from "@vizij/node-graph";
import { createGraphRuntimeStore } from "../../state/graphRuntimeStore";
import {
  buildFallbackGraphPath,
  stageGraphInputsFromState,
  subscribeRuntimeInputBridgeAvailable,
} from "../graphRuntime";
import type { GraphInputBindingEntry } from "../graphRuntime";

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

describe("buildFallbackGraphPath", () => {
  it("prepends the active face id and normalizes blank paths", () => {
    const input: StandardRigInput = {
      id: "jaw_open",
      path: "/standard/jaw/open",
      label: "Jaw Open",
      group: "/standard/jaw",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    };
    expect(buildFallbackGraphPath("face", input)).toBe(
      "rig/face/standard/jaw/open",
    );
    const rootInput: StandardRigInput = {
      id: "root",
      path: "/",
      label: "Root",
      group: "/",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    };
    expect(buildFallbackGraphPath("face", rootInput)).toBe(
      "rig/face/custom/input",
    );
  });
});

describe("stageGraphInputsFromState", () => {
  it("uses fallback bindings when direct bindings are missing", () => {
    const stageSpy = vi.fn();
    const fallback: GraphInputBindingEntry[] = [
      {
        graphPath: "rig/face/standard/mouth/x",
        inputId: "mouth_x",
        defaultValue: 0.25,
      },
    ];

    stageGraphInputsFromState({
      graphStatus: "ready",
      bindingsById: new Map(),
      fallbackBindings: fallback,
      inputValues: { mouth_x: 0.75 },
      standardInputsById: new Map(),
      stageRigInput: (path, payload) => stageSpy(path, payload.float),
      clearRigStaged: () => {},
    });

    expect(stageSpy).toHaveBeenCalledWith("rig/face/standard/mouth/x", 0.75);
  });

  it("falls back to the provided default value when no stored input exists", () => {
    const stageSpy = vi.fn();
    const fallback: GraphInputBindingEntry[] = [
      {
        graphPath: "rig/face/standard/eye/x",
        inputId: "eye_x",
        defaultValue: 0.6,
      },
    ];

    stageGraphInputsFromState({
      graphStatus: "ready",
      bindingsById: new Map(),
      fallbackBindings: fallback,
      inputValues: {},
      standardInputsById: new Map(),
      stageRigInput: (path, payload) => stageSpy(path, payload.float),
      clearRigStaged: vi.fn(),
    });

    expect(stageSpy).toHaveBeenCalledWith("rig/face/standard/eye/x", 0.6);
  });
});
