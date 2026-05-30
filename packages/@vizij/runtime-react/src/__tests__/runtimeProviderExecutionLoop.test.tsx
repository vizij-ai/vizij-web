// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OrchestratorContext,
  type OrchestratorFrame,
  type OrchestratorReactCtx,
  type ShapeJSON,
  type ValueJSON,
} from "@vizij/orchestrator-react";
import { useVizijRuntime } from "../hooks/useVizijRuntime";
import type { VizijAssetBundle, VizijRuntimeContextValue } from "../types";
import { VizijRuntimeProvider } from "../VizijRuntimeProvider";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type RuntimeCall =
  | { kind: "registerGraph"; config: unknown }
  | { kind: "registerMergedGraph"; config: unknown }
  | { kind: "registerAnimation"; config: unknown }
  | { kind: "setInput"; path: string; value: ValueJSON; shape?: ShapeJSON }
  | { kind: "removeInput"; path: string }
  | { kind: "step"; dt: number };

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function makeFrame(dt: number): OrchestratorFrame {
  return {
    epoch: 1,
    dt,
    merged_writes: [],
    conflicts: [],
    timings_ms: { total_ms: 0 },
    events: [],
  };
}

function makeBundle(
  overrides: Partial<VizijAssetBundle> = {},
): VizijAssetBundle {
  return {
    namespace: "demo-face",
    faceId: "face",
    glb: {
      kind: "world",
      world: {},
      animatables: {},
      bundle: null,
    },
    bundle: null,
    ...overrides,
  };
}

function makeOrchestratorContext(calls: RuntimeCall[]): OrchestratorReactCtx {
  const graphIds: string[] = [];
  const animationIds: string[] = [];
  const pathCache = new Map<string, ValueJSON>([
    ["demo-face/rig/face/blink", { float: 0 }],
  ]);

  return {
    backend: "direct",
    ready: true,
    createOrchestrator: vi.fn(async () => {}),
    registerGraph: vi.fn((config) => {
      const id = `graph-${graphIds.length + 1}`;
      graphIds.push(id);
      calls.push({ kind: "registerGraph", config });
      return id;
    }),
    registerMergedGraph: vi.fn((config) => {
      const id = `merged-${graphIds.length + 1}`;
      graphIds.push(id);
      calls.push({ kind: "registerMergedGraph", config });
      return id;
    }),
    registerAnimation: vi.fn((config) => {
      const id = `anim-${animationIds.length + 1}`;
      animationIds.push(id);
      calls.push({ kind: "registerAnimation", config });
      return id;
    }),
    prebind: vi.fn(),
    setInput: vi.fn((path, value, shape) => {
      pathCache.set(path, value);
      calls.push({ kind: "setInput", path, value, shape });
    }),
    removeInput: vi.fn((path) => {
      pathCache.delete(path);
      calls.push({ kind: "removeInput", path });
      return true;
    }),
    step: vi.fn((dt) => {
      calls.push({ kind: "step", dt });
      return makeFrame(dt);
    }),
    listControllers: vi.fn(() => ({
      graphs: [...graphIds],
      anims: [...animationIds],
    })),
    removeGraph: vi.fn((id) => {
      const index = graphIds.indexOf(id);
      if (index < 0) {
        return false;
      }
      graphIds.splice(index, 1);
      return true;
    }),
    removeAnimation: vi.fn((id) => {
      const index = animationIds.indexOf(id);
      if (index < 0) {
        return false;
      }
      animationIds.splice(index, 1);
      return true;
    }),
    getLatestFrame: vi.fn(() => null),
    subscribeToPath: vi.fn(() => () => {}),
    getPathSnapshot: vi.fn((path) => pathCache.get(path)),
    subscribeToFrame: vi.fn(() => () => {}),
    getFrameSnapshot: vi.fn(() => null),
    normalizeGraphSpec: vi.fn(async (spec) =>
      typeof spec === "string" ? JSON.parse(spec) : spec,
    ),
  };
}

async function mountRuntime(assetBundle = makeBundle()) {
  const calls: RuntimeCall[] = [];
  const orchestrator = makeOrchestratorContext(calls);
  let runtime: VizijRuntimeContextValue | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    runtime = useVizijRuntime();
    return null;
  }

  await act(async () => {
    root.render(
      <OrchestratorContext.Provider value={orchestrator}>
        <VizijRuntimeProvider
          assetBundle={assetBundle}
          orchestratorScope="shared"
          autoCreate={false}
          autostart={false}
          driveOrchestrator={false}
          namespace="demo-face"
        >
          <Probe />
        </VizijRuntimeProvider>
      </OrchestratorContext.Provider>,
    );
    await Promise.resolve();
  });

  if (!runtime) {
    throw new Error("VizijRuntimeProvider did not expose runtime context");
  }

  mountedRoots.push({ root, container });
  return {
    calls,
    runtime: () => runtime as VizijRuntimeContextValue,
  };
}

afterEach(() => {
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe("VizijRuntimeProvider execution loop", () => {
  it("flushes staged public inputs and host animation updates before stepping the runtime", async () => {
    const { calls, runtime } = await mountRuntime();

    await act(async () => {
      runtime().setInput("rig/face/smile", { float: 0.25 });
    });
    expect(calls.filter((call) => call.kind === "setInput")).toEqual([]);

    await act(async () => {
      void runtime().animateValue(
        "rig/face/blink",
        { float: 1 },
        {
          duration: 1,
          easing: "linear",
        },
      );
      runtime().step(0.5, { forceRuntime: true });
    });

    expect(
      calls.filter((call) => call.kind === "setInput" || call.kind === "step"),
    ).toEqual([
      {
        kind: "setInput",
        path: "demo-face/rig/face/smile",
        value: { float: 0.25 },
        shape: undefined,
      },
      {
        kind: "setInput",
        path: "demo-face/rig/face/blink",
        value: { float: 0.5 },
        shape: undefined,
      },
      { kind: "step", dt: 0.5 },
    ]);
  });

  it("flushes immediate animation seeks through the public runtime API", async () => {
    const { calls, runtime } = await mountRuntime(
      makeBundle({
        animations: [
          {
            id: "blink",
            clip: {
              id: "blink",
              duration: 1,
              tracks: [
                {
                  channel: "rig/face/smile",
                  keyframes: [
                    { time: 0, value: 0 },
                    { time: 1, value: 1 },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );
    calls.splice(0);

    await act(async () => {
      runtime().seekAnimation("blink", 0.5);
    });

    expect(
      calls.filter((call) => call.kind === "setInput" || call.kind === "step"),
    ).toEqual([
      {
        kind: "setInput",
        path: "demo-face/rig/face/smile",
        value: { float: 0.5 },
        shape: undefined,
      },
    ]);
  });
});
