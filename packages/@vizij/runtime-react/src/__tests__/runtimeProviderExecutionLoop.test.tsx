// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VizijBundleExtension } from "@vizij/render";
import {
  OrchestratorContext,
  type OrchestratorFrame,
  type OrchestratorReactCtx,
  type ShapeJSON,
  type ValueJSON,
} from "@vizij/orchestrator-react";
import { useVizijRuntime } from "../hooks/useVizijRuntime";
import type {
  VizijAssetBundle,
  VizijRuntimeContextValue,
  VizijRuntimeStatus,
} from "../types";
import { VizijRuntimeProvider } from "../VizijRuntimeProvider";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const loadedBundleMock = vi.hoisted(() => ({
  current: null as VizijBundleExtension | null,
}));

vi.mock("@vizij/render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vizij/render")>();
  return {
    ...actual,
    loadGLTFWithBundle: vi.fn(async () => ({
      world: {},
      animatables: {},
      bundle: loadedBundleMock.current,
    })),
    loadGLTFFromBlobWithBundle: vi.fn(async () => ({
      world: {},
      animatables: {},
      bundle: loadedBundleMock.current,
    })),
  };
});

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

function makeProgramBundle(id = "live-program") {
  return {
    programs: [
      {
        id,
        graph: {
          id: `${id}.graph`,
          spec: {
            nodes: [
              {
                id: "out",
                type: "output",
                params: { path: "rig/face/smile" },
              },
            ],
            edges: [],
          },
        },
        resetValues: {
          "rig/face/smile": 0,
        },
      },
    ],
  };
}

function makeOrchestratorContext(
  calls: RuntimeCall[],
  backend: OrchestratorReactCtx["backend"] = "direct",
): OrchestratorReactCtx {
  const graphIds: string[] = [];
  const animationIds: string[] = [];
  const pathCache = new Map<string, ValueJSON>([
    ["demo-face/rig/face/blink", { float: 0 }],
  ]);

  return {
    backend,
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

async function mountRuntime(
  assetBundle = makeBundle(),
  options: {
    backend?: OrchestratorReactCtx["backend"];
    configureOrchestrator?: (orchestrator: OrchestratorReactCtx) => void;
    onStatusChange?: (status: VizijRuntimeStatus) => void;
  } = {},
) {
  const calls: RuntimeCall[] = [];
  const orchestrator = makeOrchestratorContext(calls, options.backend);
  options.configureOrchestrator?.(orchestrator);
  let runtime: VizijRuntimeContextValue | null = null;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  function Probe() {
    runtime = useVizijRuntime();
    return null;
  }

  const renderRuntime = (nextAssetBundle: VizijAssetBundle) => {
    root.render(
      <OrchestratorContext.Provider value={orchestrator}>
        <VizijRuntimeProvider
          assetBundle={nextAssetBundle}
          orchestratorScope="shared"
          autoCreate={false}
          autostart={false}
          driveOrchestrator={false}
          namespace="demo-face"
          onStatusChange={options.onStatusChange}
        >
          <Probe />
        </VizijRuntimeProvider>
      </OrchestratorContext.Provider>,
    );
  };

  await act(async () => {
    renderRuntime(assetBundle);
    await Promise.resolve();
  });

  if (!runtime) {
    throw new Error("VizijRuntimeProvider did not expose runtime context");
  }

  mountedRoots.push({ root, container });
  return {
    calls,
    rerender: async (nextAssetBundle: VizijAssetBundle) => {
      await act(async () => {
        renderRuntime(nextAssetBundle);
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    runtime: () => runtime as VizijRuntimeContextValue,
  };
}

afterEach(() => {
  loadedBundleMock.current = null;
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe("VizijRuntimeProvider execution loop", () => {
  it("does not report runtime ready when controller registration fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const statuses: VizijRuntimeStatus[] = [];
    try {
      const { runtime } = await mountRuntime(
        makeBundle({
          rig: {
            id: "rig",
            spec: {
              nodes: [
                {
                  id: "in",
                  type: "input",
                  params: { path: "rig/face/smile" },
                },
                {
                  id: "out",
                  type: "output",
                  params: { path: "rig/face/smile" },
                },
              ],
              edges: [],
            },
          },
        }),
        {
          configureOrchestrator: (orchestrator) => {
            orchestrator.registerGraph = vi.fn(() => {
              throw new Error("graph register failed");
            });
          },
          onStatusChange: (status) => {
            statuses.push(status);
          },
        },
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(runtime().ready).toBe(false);
      expect(runtime().loading).toBe(false);
      expect(runtime().error?.message).toBe("Failed to register rig graphs");
      expect(statuses.at(-1)?.ready).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

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

  it("does not rehydrate bundle programs after an explicit empty program override", async () => {
    const { calls, runtime } = await mountRuntime(
      makeBundle({
        rig: undefined,
        pose: undefined,
        programs: [],
        bundle: {
          version: 1,
          graphs: [
            {
              id: "bundle-program",
              kind: "motiongraph",
              spec: {
                nodes: [
                  {
                    id: "out",
                    type: "output",
                    params: { path: "rig/face/smile" },
                  },
                ],
                edges: [],
              },
            },
          ],
        } as VizijAssetBundle["bundle"],
      }),
    );

    expect(runtime().assetBundle.programs).toEqual([]);
    expect(
      calls.some(
        (call) =>
          call.kind === "registerGraph" || call.kind === "registerMergedGraph",
      ),
    ).toBe(false);
  });

  it("keeps extracted bundle assets while applying graph-only program updates", async () => {
    loadedBundleMock.current = {
      version: 1,
      graphs: [
        {
          id: "bundle-rig",
          kind: "rig",
          spec: {
            nodes: [
              {
                id: "out",
                type: "output",
                params: { path: "rig/face/smile" },
              },
            ],
            edges: [],
          },
        },
      ],
    };

    const { runtime } = await mountRuntime(
      makeBundle({
        glb: {
          kind: "url",
          src: "/face.glb",
        },
        programs: [],
        bundle: null,
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runtime().assetBundle.bundle).toBe(loadedBundleMock.current);
    expect(runtime().assetBundle.rig?.id).toBe("bundle-rig");

    await act(async () => {
      runtime().setGraphBundle(makeProgramBundle(), { tier: "graphs" });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runtime().assetBundle.bundle).toBe(loadedBundleMock.current);
    expect(runtime().assetBundle.rig?.id).toBe("bundle-rig");
    expect(
      runtime().assetBundle.programs?.map((program) => program.id),
    ).toEqual(["live-program"]);
  });

  it("registers and plays programs added through the runtime graph bundle", async () => {
    const { calls, runtime } = await mountRuntime(
      makeBundle({
        rig: undefined,
        pose: undefined,
        programs: [],
      }),
    );

    await act(async () => {
      runtime().setGraphBundle(makeProgramBundle(), { tier: "graphs" });
      await Promise.resolve();
      await Promise.resolve();
    });

    calls.splice(0);
    await act(async () => {
      runtime().playProgram("live-program");
    });

    expect(calls.filter((call) => call.kind === "registerGraph")).toMatchObject(
      [
        {
          kind: "registerGraph",
          config: {
            id: "demo-face/graph/live-program.graph",
            spec: {
              nodes: [
                {
                  id: "out",
                  type: "output",
                  params: { path: "demo-face/rig/face/smile" },
                },
              ],
            },
            subs: {
              outputs: ["demo-face/rig/face/smile"],
            },
          },
        },
      ],
    );
  });

  it("clears graph bundle overrides when the source asset bundle changes", async () => {
    const { rerender, runtime } = await mountRuntime(
      makeBundle({
        programs: [],
      }),
    );

    await act(async () => {
      runtime().setGraphBundle(makeProgramBundle("live-program"), {
        tier: "graphs",
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      runtime().assetBundle.programs?.map((program) => program.id),
    ).toEqual(["live-program"]);

    await rerender(
      makeBundle({
        faceId: "reloaded-face",
        programs: makeProgramBundle("imported-program").programs,
      }),
    );

    expect(runtime().assetBundle.faceId).toBe("reloaded-face");
    expect(
      runtime().assetBundle.programs?.map((program) => program.id),
    ).toEqual(["imported-program"]);
  });

  it("routes animation playback through orchestrator commands for Arora web runtimes", async () => {
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
      { backend: "aroraWeb" },
    );

    const registration = calls.find(
      (call): call is Extract<RuntimeCall, { kind: "registerAnimation" }> =>
        call.kind === "registerAnimation",
    );
    expect(registration?.config).toMatchObject({
      id: "demo-face/animation/blink",
      setup: {
        player: {
          speed: 0,
        },
      },
    });

    calls.splice(0);
    await act(async () => {
      void runtime().playAnimation("blink", {
        reset: true,
        speed: 1.25,
        weight: 0.5,
      });
    });

    expect(
      calls.filter((call) => call.kind === "setInput" || call.kind === "step"),
    ).toEqual([
      {
        kind: "setInput",
        path: "anim/controller/anim-1/player/0/cmd/seek",
        value: { float: 0 },
        shape: undefined,
      },
      {
        kind: "setInput",
        path: "anim/controller/anim-1/player/0/cmd/set_loop",
        value: "once",
        shape: undefined,
      },
      {
        kind: "setInput",
        path: "anim/controller/anim-1/player/0/cmd/set_speed",
        value: { float: 1.25 },
        shape: undefined,
      },
      {
        kind: "setInput",
        path: "anim/controller/anim-1/player/0/instance/0/weight",
        value: { float: 0.5 },
        shape: undefined,
      },
      {
        kind: "setInput",
        path: "anim/controller/anim-1/player/0/cmd/play",
        value: { bool: true },
        shape: undefined,
      },
      { kind: "step", dt: 0 },
    ]);
  });

  it("does not host-sample animation playback when Arora web controller registration fails", async () => {
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
      {
        backend: "aroraWeb",
        configureOrchestrator: (orchestrator) => {
          orchestrator.registerAnimation = vi.fn(() => {
            throw new Error("animation register failed");
          });
        },
      },
    );

    calls.splice(0);
    await act(async () => {
      await expect(
        runtime().playAnimation("blink", {
          reset: true,
        }),
      ).rejects.toThrow(
        "Cannot play animation blink through orchestrator transport because no animation controller was registered.",
      );
    });

    expect(
      calls.filter((call) => call.kind === "setInput" || call.kind === "step"),
    ).toEqual([]);
    expect(runtime().error?.message).toBe(
      "Cannot play animation blink through orchestrator transport because no animation controller was registered.",
    );
  });
});
