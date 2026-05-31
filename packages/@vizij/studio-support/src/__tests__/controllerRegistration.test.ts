import { describe, expect, it } from "vitest";
import type { AnimationRegistrationConfig } from "@vizij/orchestrator-react";
import {
  clearRuntimeControllers,
  registerRuntimeControllers,
} from "../utils/controllerRegistration";

function makeHost(
  controllers: { graphs: string[]; anims: string[] } = {
    graphs: ["old-graph"],
    anims: ["old-anim"],
  },
) {
  const calls: Array<{ kind: string; payload: unknown }> = [];
  const host = {
    listControllers: () => controllers,
    removeGraph: (id: string) => {
      calls.push({ kind: "removeGraph", payload: id });
      return true;
    },
    removeAnimation: (id: string) => {
      calls.push({ kind: "removeAnimation", payload: id });
      return true;
    },
    registerGraph: (config: unknown) => {
      calls.push({ kind: "registerGraph", payload: config });
      return `graph-${calls.filter((call) => call.kind === "registerGraph").length}`;
    },
    registerMergedGraph: (config: unknown) => {
      calls.push({ kind: "registerMergedGraph", payload: config });
      return "merged-controller";
    },
    registerAnimation: (config: AnimationRegistrationConfig) => {
      calls.push({ kind: "registerAnimation", payload: config });
      return `anim-${config.id ?? "unknown"}`;
    },
    setInput: (path: string, value: unknown, shape?: unknown) => {
      calls.push({ kind: "setInput", payload: { path, value, shape } });
    },
  };
  return { host, calls };
}

function makePlan() {
  return {
    graphConfigs: [
      { id: "rig", spec: { nodes: [] } },
      { id: "pose", spec: { nodes: [] } },
    ],
    animationRegistrations: [
      {
        assetId: "clip-a",
        outputPaths: ["rig/face/smile"],
        config: {
          id: "clip-controller",
          setup: { player: { speed: 1 } },
        },
      },
    ],
    programRegistrations: [
      {
        assetId: "program-a",
        config: { id: "program-controller", spec: { nodes: [] } },
        spec: { nodes: [] },
        inputs: [],
        outputs: ["rig/face/smile"],
      },
    ],
    outputPaths: ["demo-face/rig/face/smile"],
    baseOutputPaths: ["rig/face/smile"],
    namespacedOutputPaths: ["demo-face/rig/face/smile"],
    inputConstraints: {
      "demo-face/rig/face/smile": { defaultValue: 0 },
    },
    rigInputMap: { smile: "rig/face/smile" },
    rigPoseControlInputIds: ["smile"],
    graphRegistrations: [],
    diagnostics: [],
  };
}

describe("clearRuntimeControllers", () => {
  it("removes currently registered graph and animation controllers", () => {
    const { host, calls } = makeHost();

    const result = clearRuntimeControllers({ host });

    expect(result.errors).toEqual([]);
    expect(calls).toEqual([
      { kind: "removeGraph", payload: "old-graph" },
      { kind: "removeAnimation", payload: "old-anim" },
    ]);
  });

  it("keeps clearing controllers while collecting removal errors", () => {
    const { host, calls } = makeHost();

    const result = clearRuntimeControllers({
      host: {
        ...host,
        removeGraph: (id) => {
          calls.push({ kind: "removeGraph", payload: id });
          throw new Error("graph remove failed");
        },
      },
    });

    expect(result.removedAnimations).toEqual(["old-anim"]);
    expect(result.errors).toMatchObject([
      {
        message: "Failed to remove graph old-graph",
        phase: "registration",
      },
    ]);
    expect(calls).toEqual([
      { kind: "removeGraph", payload: "old-graph" },
      { kind: "removeAnimation", payload: "old-anim" },
    ]);
  });

  it("removes only controllers owned by the namespace in shared hosts", () => {
    const { host, calls } = makeHost({
      graphs: [
        "face-a/graph/rig",
        "face-a/merged/merged-face-a",
        "face-b/graph/rig",
        "loose-graph",
      ],
      anims: ["face-a/animation/blink", "face-b/animation/blink", "loose-anim"],
    });

    const result = clearRuntimeControllers({
      host,
      namespace: "face-a",
    });

    expect(result.errors).toEqual([]);
    expect(result.removedGraphs).toEqual([
      "face-a/graph/rig",
      "face-a/merged/merged-face-a",
    ]);
    expect(result.removedAnimations).toEqual(["face-a/animation/blink"]);
    expect(calls).toEqual([
      { kind: "removeGraph", payload: "face-a/graph/rig" },
      { kind: "removeGraph", payload: "face-a/merged/merged-face-a" },
      { kind: "removeAnimation", payload: "face-a/animation/blink" },
    ]);
  });

  it("removes explicit controller ids without touching unrelated controllers", () => {
    const { host, calls } = makeHost({
      graphs: [
        "owned-graph",
        "owned-program-graph",
        "other-face/graph/rig",
        "loose-graph",
      ],
      anims: ["owned-anim", "other-face/animation/blink", "loose-anim"],
    });

    const result = clearRuntimeControllers({
      host,
      graphIds: ["owned-graph", "owned-program-graph"],
      animationIds: ["owned-anim"],
    });

    expect(result.errors).toEqual([]);
    expect(result.removedGraphs).toEqual([
      "owned-graph",
      "owned-program-graph",
    ]);
    expect(result.removedAnimations).toEqual(["owned-anim"]);
    expect(calls).toEqual([
      { kind: "removeGraph", payload: "owned-graph" },
      { kind: "removeGraph", payload: "owned-program-graph" },
      { kind: "removeAnimation", payload: "owned-anim" },
    ]);
  });
});

describe("registerRuntimeControllers", () => {
  it("applies a prepared registration plan to the runtime host", () => {
    const { host, calls } = makeHost();
    const result = registerRuntimeControllers({
      host,
      namespace: "demo-face",
      animationTransport: "orchestrator",
      plan: makePlan(),
      initialInputs: {
        "rig/face/smile": { float: 0.5 },
      },
    });

    expect(result.errors).toEqual([]);
    expect(result.graphIds).toEqual(["merged-controller"]);
    expect(result.animationIds).toEqual(["anim-clip-controller"]);
    expect(result.animationControllerIds.get("clip-a")).toBe(
      "anim-clip-controller",
    );
    expect(result.programRegistrationMap.get("program-a")?.config.id).toBe(
      "program-controller",
    );
    expect(result.outputPaths.has("demo-face/rig/face/smile")).toBe(true);
    expect(result.inputConstraints["demo-face/rig/face/smile"]).toEqual({
      defaultValue: 0,
    });
    expect(calls).toMatchObject([
      { kind: "registerMergedGraph" },
      {
        kind: "registerAnimation",
        payload: {
          id: "clip-controller",
          setup: { player: { speed: 0 } },
        },
      },
      {
        kind: "setInput",
        payload: { path: "rig/face/smile", value: { float: 0.5 } },
      },
    ]);
  });

  it("continues registering animations and staging inputs after graph errors", () => {
    const { host, calls } = makeHost();

    const result = registerRuntimeControllers({
      host: {
        ...host,
        registerMergedGraph: (config) => {
          calls.push({ kind: "registerMergedGraph", payload: config });
          throw new Error("graph register failed");
        },
      },
      namespace: "demo-face",
      animationTransport: "host",
      plan: makePlan(),
      initialInputs: {
        "rig/face/smile": { float: 0.5 },
      },
    });

    expect(result.graphIds).toEqual([]);
    expect(result.animationIds).toEqual(["anim-clip-controller"]);
    expect(result.errors).toMatchObject([
      {
        message: "Failed to register rig graphs",
        phase: "registration",
      },
    ]);
    expect(calls.map((call) => call.kind)).toEqual([
      "registerMergedGraph",
      "registerAnimation",
      "setInput",
    ]);
  });
});
