import type { FC } from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import {
  createModuleFacade,
  createOrchestrator,
} from "@vizij/orchestrator-wasm";
import {
  AroraWebOrchestratorRuntime,
  OrchestratorProvider,
  ModuleFacadeOrchestratorRuntime,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
} from "../src";
import type { OrchestratorFrame, ValueJSON } from "../src/types";

type OrchestratorMock = {
  registerGraph: Mock;
  registerMergedGraph: Mock;
  registerAnimation: Mock;
  prebind: Mock;
  setInput: Mock;
  removeInput: Mock;
  step: Mock<(dt: number) => OrchestratorFrame | null>;
  listControllers: Mock<() => { graphs: string[]; anims: string[] }>;
  removeGraph: Mock;
  removeAnimation: Mock;
  normalizeGraphSpec: Mock<(spec: unknown) => Promise<unknown>>;
};

const orchestratorInstances: OrchestratorMock[] = [];
const moduleFacadeDispatches: Array<{
  call: string;
  runtimeHandle?: string;
  args?: unknown;
}> = [];
const stepResultRef: { current: OrchestratorFrame | null } = {
  current: null,
};

const makeFrame = (
  overrides: Partial<OrchestratorFrame> = {},
): OrchestratorFrame => ({
  epoch: 1,
  dt: 1 / 60,
  merged_writes: [],
  conflicts: [],
  timings_ms: { total_ms: 0 },
  events: [],
  ...overrides,
});

const makeInstance = (): OrchestratorMock => {
  const graphs: string[] = [];
  const anims: string[] = [];

  const instance: OrchestratorMock = {
    registerGraph: vi.fn((_cfg: object | string) => {
      const id = `graph-${graphs.length + 1}`;
      graphs.push(id);
      return id;
    }),
    registerMergedGraph: vi.fn((_cfg: object) => {
      const id = `merged-${graphs.length + 1}`;
      graphs.push(id);
      return id;
    }),
    registerAnimation: vi.fn((_cfg: object) => {
      const id = `anim-${anims.length + 1}`;
      anims.push(id);
      return id;
    }),
    prebind: vi.fn(),
    setInput: vi.fn(),
    removeInput: vi.fn(() => true),
    step: vi.fn(() => stepResultRef.current),
    listControllers: vi.fn(() => ({ graphs: [...graphs], anims: [...anims] })),
    removeGraph: vi.fn((id: string) => {
      const idx = graphs.indexOf(id);
      if (idx >= 0) {
        graphs.splice(idx, 1);
        return true;
      }
      return false;
    }),
    removeAnimation: vi.fn((id: string) => {
      const idx = anims.indexOf(id);
      if (idx >= 0) {
        anims.splice(idx, 1);
        return true;
      }
      return false;
    }),
    normalizeGraphSpec: vi.fn(async (spec: unknown) => spec),
  };
  orchestratorInstances.push(instance);
  return instance;
};

function moduleFacadeResponse(request: { call: string; args?: unknown }) {
  switch (request.call) {
    case "runtime.create":
      return {
        ok: true,
        result: { runtimeHandle: "runtime:0", schedule: "SinglePass" },
        version: 1,
      };
    case "orchestrator.step":
      return {
        ok: true,
        result: stepResultRef.current ?? makeFrame(),
        version: 1,
      };
    case "graph.normalize":
      return {
        ok: true,
        result: {
          ...(request.args as { spec?: object }).spec,
          edges: [],
          normalized: true,
        },
        version: 1,
      };
    case "controllers.list":
      return { ok: true, result: { graphs: [], anims: [] }, version: 1 };
    default:
      return { ok: true, result: {}, version: 1 };
  }
}

const makeModuleFacade = () => ({
  dispatch: vi.fn((request: { call: string; args?: unknown }) => {
    moduleFacadeDispatches.push(request);
    return moduleFacadeResponse(request);
  }),
  dispatchJson: vi.fn((requestJson: string) =>
    JSON.stringify({
      ok: true,
      result: { echo: JSON.parse(requestJson) },
      version: 1,
    }),
  ),
});

const makeAroraWebModule = () => {
  const init = vi.fn(async () => {});
  const loadModule = vi.fn((headerJson: string) => {
    const header = JSON.parse(headerJson) as { id?: string };
    return header.id ?? "144358c2-b7e0-414d-8755-56d7ac03f811";
  });
  const engineCalls: unknown[] = [];

  class Engine {
    loadModule = loadModule;

    call(callJson: string): string {
      const call = JSON.parse(callJson) as {
        module_id?: string;
        args?: Array<{ value?: { str?: string } }>;
      };
      engineCalls.push(call);
      const requestJson = call.args?.[0]?.value?.str;
      if (!requestJson) {
        throw new Error("missing arora request string");
      }
      const request = JSON.parse(requestJson) as {
        call: string;
        runtimeHandle?: string;
        args?: unknown;
      };
      moduleFacadeDispatches.push(request);
      return JSON.stringify({
        ret: { str: JSON.stringify(moduleFacadeResponse(request)) },
        mutated: [],
      });
    }
  }

  return { default: init, Engine, loadModule, engineCalls };
};

const COMPOSED_DISPATCH_FUNCTION_ID = "90725b7e-a4d9-4a3f-99af-8e227612bed7";
const COMPOSED_REQUEST_PARAM_ID = "323d47be-3b30-46ff-882f-bc7f7ffacd57";
const COMPOSED_MODULE_ID = "580d9cef-88be-4f1c-b649-f87032acd8fe";
const COMPATIBILITY_DISPATCH_FUNCTION_ID =
  "debf32e5-1650-48ac-af4a-da2da617aef7";
const COMPATIBILITY_REQUEST_PARAM_ID = "71b4a759-ded6-42a3-b59d-9716472ac045";
const COMPATIBILITY_MODULE_ID = "144358c2-b7e0-414d-8755-56d7ac03f811";
const VIZIJ_ANIMATION_MODULE_ID = "aa32e080-b002-428c-9994-6143aab3bf08";
const VIZIJ_NODE_GRAPH_MODULE_ID = "098bd478-8375-4f3a-b649-d64cb1284944";

function dispatchHeader(args: {
  moduleId: string;
  dispatchFunctionId: string;
  requestParamId: string;
  imports?: Array<Record<string, unknown>>;
}) {
  return {
    id: args.moduleId,
    exports: [
      {
        type: "function",
        id: args.dispatchFunctionId,
        name: "dispatch_json",
        parameters: [
          {
            id: args.requestParamId,
            name: "request_json",
          },
        ],
      },
    ],
    imports: args.imports ?? [],
  };
}

function moduleHeader(moduleId: string) {
  return { id: moduleId, exports: [] };
}

function moduleImport(moduleId: string, functionId: string) {
  return {
    type: "function",
    module: moduleId,
    id: functionId,
  };
}

const COMPATIBILITY_HEADER = dispatchHeader({
  moduleId: COMPATIBILITY_MODULE_ID,
  dispatchFunctionId: COMPATIBILITY_DISPATCH_FUNCTION_ID,
  requestParamId: COMPATIBILITY_REQUEST_PARAM_ID,
});
const COMPOSED_HEADER = dispatchHeader({
  moduleId: COMPOSED_MODULE_ID,
  dispatchFunctionId: COMPOSED_DISPATCH_FUNCTION_ID,
  requestParamId: COMPOSED_REQUEST_PARAM_ID,
  imports: [
    moduleImport(
      VIZIJ_ANIMATION_MODULE_ID,
      "80f5c157-bfc0-457d-9a08-531ba04f5305",
    ),
    moduleImport(
      VIZIJ_NODE_GRAPH_MODULE_ID,
      "d898a9d4-516d-4cda-bd8c-7dbf3fa75b70",
    ),
  ],
});
const VIZIJ_ANIMATION_HEADER = moduleHeader(VIZIJ_ANIMATION_MODULE_ID);
const VIZIJ_NODE_GRAPH_HEADER = moduleHeader(VIZIJ_NODE_GRAPH_MODULE_ID);

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function binaryResponse(value: number[]): Response {
  return new Response(new Uint8Array(value), {
    status: 200,
    headers: { "Content-Type": "application/wasm" },
  });
}

vi.mock("@vizij/orchestrator-wasm", async () => {
  const actual = await vi.importActual<
    typeof import("@vizij/orchestrator-wasm")
  >("@vizij/orchestrator-wasm");
  return {
    ...actual,
    listOrchestrationFixtures: actual.listOrchestrationFixtures,
    loadOrchestrationBundle: actual.loadOrchestrationBundle,
    loadOrchestrationDescriptor: actual.loadOrchestrationDescriptor,
    loadOrchestrationJson: actual.loadOrchestrationJson,
    init: vi.fn(async () => {}),
    createOrchestrator: vi.fn(async () => makeInstance()),
    createModuleFacade: vi.fn(async () => makeModuleFacade()),
    Orchestrator: vi.fn(() => makeInstance()),
    abi_version: vi.fn(() => 2),
    module_facade_version: vi.fn(() => 1),
  };
});

const Harness: FC = () => {
  const ctx = useOrchestrator();
  const frame = useOrchFrame();
  const latest = useOrchTarget("demo/output/value");

  return (
    <div>
      <span data-testid="ready">{ctx.ready ? "ready" : "pending"}</span>
      <span data-testid="epoch">{frame?.epoch ?? "none"}</span>
      <span data-testid="target">
        {latest === undefined ? "undefined" : JSON.stringify(latest)}
      </span>
      <button data-testid="step" type="button" onClick={() => ctx.step(1 / 60)}>
        step
      </button>
      <button
        data-testid="set-input"
        type="button"
        onClick={() =>
          ctx.setInput("demo/input/value", { float: 2 } satisfies ValueJSON)
        }
      >
        set input
      </button>
    </div>
  );
};

describe("OrchestratorProvider", () => {
  beforeEach(() => {
    orchestratorInstances.length = 0;
    moduleFacadeDispatches.length = 0;
    stepResultRef.current = null;
    vi.clearAllMocks();
    cleanup();
    vi.mocked(createOrchestrator).mockImplementation(async () =>
      makeInstance(),
    );
  });

  it("can drive the provider through the module-facade backend", async () => {
    stepResultRef.current = makeFrame({
      epoch: 7,
      merged_writes: [
        {
          path: "demo/output/value",
          value: { float: 0.75 },
        },
      ],
    });

    render(
      <OrchestratorProvider backend="moduleFacade" autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("ready");
      expect(createModuleFacade).toHaveBeenCalledTimes(1);
      expect(createOrchestrator).not.toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("step"));

    await waitFor(() => {
      expect(screen.getByTestId("epoch").textContent).toBe("7");
      expect(screen.getByTestId("target").textContent).toContain("0.75");
    });

    expect(moduleFacadeDispatches.map((request) => request.call)).toContain(
      "runtime.create",
    );
    const stepDispatch = moduleFacadeDispatches.find(
      (request) => request.call === "orchestrator.step",
    );
    expect(stepDispatch?.runtimeHandle).toBe("runtime:0");
  });

  it("normalizes graph specs through the module-facade backend", async () => {
    const runtime = await ModuleFacadeOrchestratorRuntime.create();
    const normalized = await runtime.normalizeGraphSpec({
      nodes: [{ id: "source", kind: "Node" }],
    });

    expect(normalized).toMatchObject({ edges: [], normalized: true });
    const normalizeDispatch = moduleFacadeDispatches.find(
      (request) => request.call === "graph.normalize",
    );
    expect(normalizeDispatch?.runtimeHandle).toBe("runtime:0");
  });

  it("can drive the provider through the arora-web backend", async () => {
    stepResultRef.current = makeFrame({
      epoch: 11,
      merged_writes: [
        {
          path: "demo/output/value",
          value: { float: 0.25 },
        },
      ],
    });
    const aroraWeb = makeAroraWebModule();

    render(
      <OrchestratorProvider
        backend="aroraWeb"
        initInput={{
          aroraWeb,
          headerJson: COMPATIBILITY_HEADER,
          wasmBytes: new Uint8Array([0]),
        }}
        autostart={false}
      >
        <Harness />
      </OrchestratorProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("ready");
      expect(aroraWeb.default).toHaveBeenCalledTimes(1);
      expect(aroraWeb.loadModule).toHaveBeenCalledTimes(1);
      expect(createModuleFacade).not.toHaveBeenCalled();
      expect(createOrchestrator).not.toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId("step"));

    await waitFor(() => {
      expect(screen.getByTestId("epoch").textContent).toBe("11");
      expect(screen.getByTestId("target").textContent).toContain("0.25");
    });

    const stepDispatch = moduleFacadeDispatches.find(
      (request) => request.call === "orchestrator.step",
    );
    expect(stepDispatch?.runtimeHandle).toBe("runtime:0");
    expect(aroraWeb.engineCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module_id: COMPATIBILITY_MODULE_ID,
        }),
      ]),
    );
  });

  it("normalizes graph specs through the arora-web backend", async () => {
    const aroraWeb = makeAroraWebModule();
    const runtime = await AroraWebOrchestratorRuntime.create(undefined, {
      aroraWeb,
      headerJson: COMPATIBILITY_HEADER,
      wasmBytes: new Uint8Array([0]),
    });
    const normalized = await runtime.normalizeGraphSpec({
      nodes: [{ id: "source", kind: "Node" }],
    });

    expect(normalized).toMatchObject({ edges: [], normalized: true });
    const normalizeDispatch = moduleFacadeDispatches.find(
      (request) => request.call === "graph.normalize",
    );
    expect(normalizeDispatch?.runtimeHandle).toBe("runtime:0");
  });

  it("preloads the independent Vizij modules by default for the composed arora-web orchestrator", async () => {
    const aroraWeb = makeAroraWebModule();
    const fetch = vi.fn(async (url: Parameters<typeof globalThis.fetch>[0]) => {
      const urlText = String(url);
      if (
        urlText.includes("vizij-animation") &&
        urlText.endsWith("module.json")
      ) {
        return jsonResponse(VIZIJ_ANIMATION_HEADER);
      }
      if (
        urlText.includes("vizij-node-graph") &&
        urlText.endsWith("module.json")
      ) {
        return jsonResponse(VIZIJ_NODE_GRAPH_HEADER);
      }
      if (
        urlText.includes("vizij-animation") &&
        urlText.endsWith("vizij_animation.wasm")
      ) {
        return binaryResponse([1]);
      }
      if (
        urlText.includes("vizij-node-graph") &&
        urlText.endsWith("vizij_node_graph.wasm")
      ) {
        return binaryResponse([2]);
      }
      throw new Error(`unexpected fetch: ${urlText}`);
    });
    const runtime = await AroraWebOrchestratorRuntime.create(undefined, {
      aroraWeb,
      orchestratorModule: "composed",
      headerJson: COMPOSED_HEADER,
      fetch: fetch as unknown as typeof globalThis.fetch,
      wasmBytes: new Uint8Array([0]),
    });

    runtime.step(1 / 60);

    expect(aroraWeb.loadModule).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(VIZIJ_ANIMATION_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(VIZIJ_NODE_GRAPH_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(COMPOSED_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.engineCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module_id: COMPOSED_MODULE_ID,
          id: COMPOSED_DISPATCH_FUNCTION_ID,
          args: [
            expect.objectContaining({
              id: COMPOSED_REQUEST_PARAM_ID,
            }),
          ],
        }),
      ]),
    );
  });

  it("derives default composed preloads from the selected module imports", async () => {
    const aroraWeb = makeAroraWebModule();
    const graphOnlyComposedHeader = dispatchHeader({
      moduleId: COMPOSED_MODULE_ID,
      dispatchFunctionId: COMPOSED_DISPATCH_FUNCTION_ID,
      requestParamId: COMPOSED_REQUEST_PARAM_ID,
      imports: [
        moduleImport(
          VIZIJ_NODE_GRAPH_MODULE_ID,
          "14e86906-c4e4-45e8-936d-725dc43ec9bb",
        ),
        moduleImport(
          VIZIJ_NODE_GRAPH_MODULE_ID,
          "d898a9d4-516d-4cda-bd8c-7dbf3fa75b70",
        ),
      ],
    });
    const fetch = vi.fn(async (url: Parameters<typeof globalThis.fetch>[0]) => {
      const urlText = String(url);
      if (
        urlText.includes("vizij-node-graph") &&
        urlText.endsWith("module.json")
      ) {
        return jsonResponse(VIZIJ_NODE_GRAPH_HEADER);
      }
      if (
        urlText.includes("vizij-node-graph") &&
        urlText.endsWith("vizij_node_graph.wasm")
      ) {
        return binaryResponse([2]);
      }
      throw new Error(`unexpected fetch: ${urlText}`);
    });

    await AroraWebOrchestratorRuntime.create(undefined, {
      aroraWeb,
      orchestratorModule: "composed",
      headerJson: graphOnlyComposedHeader,
      fetch: fetch as unknown as typeof globalThis.fetch,
      wasmBytes: new Uint8Array([0]),
    });

    expect(aroraWeb.loadModule).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(VIZIJ_NODE_GRAPH_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(COMPOSED_MODULE_ID),
      expect.any(Uint8Array),
    );
  });

  it("can preload independent Vizij modules before the composed arora-web orchestrator", async () => {
    const aroraWeb = makeAroraWebModule();
    const fetch = vi.fn(async (url: Parameters<typeof globalThis.fetch>[0]) => {
      const urlText = String(url);
      if (urlText.includes("vizij-animation")) {
        return jsonResponse(VIZIJ_ANIMATION_HEADER);
      }
      if (urlText.includes("vizij-node-graph")) {
        return jsonResponse(VIZIJ_NODE_GRAPH_HEADER);
      }
      throw new Error(`unexpected fetch: ${urlText}`);
    });
    const runtime = await AroraWebOrchestratorRuntime.create(undefined, {
      aroraWeb,
      orchestratorModule: "composed",
      headerJson: COMPOSED_HEADER,
      preloadModules: [
        {
          preset: "vizij-animation",
          wasmBytes: new Uint8Array([1]),
        },
        {
          preset: "vizij-node-graph",
          wasmBytes: new Uint8Array([2]),
        },
      ],
      fetch: fetch as unknown as typeof globalThis.fetch,
      wasmBytes: new Uint8Array([0]),
    });

    runtime.step(1 / 60);

    expect(aroraWeb.loadModule).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(VIZIJ_ANIMATION_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(VIZIJ_NODE_GRAPH_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.loadModule).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(COMPOSED_MODULE_ID),
      expect.any(Uint8Array),
    );
    expect(aroraWeb.engineCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module_id: COMPOSED_MODULE_ID,
        }),
      ]),
    );
  });

  const renderHarness = () =>
    render(
      <OrchestratorProvider autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );

  it("marks context as ready once orchestrator is created", async () => {
    renderHarness();
    expect(screen.getByTestId("ready").textContent).toBe("pending");

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("ready");
      expect(orchestratorInstances).toHaveLength(1);
    });
  });

  it("forwards setInput calls to the wasm orchestrator", async () => {
    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("ready"),
    );

    fireEvent.click(screen.getByTestId("set-input"));

    const instance = orchestratorInstances[0];
    expect(instance.setInput).toHaveBeenCalledWith(
      "demo/input/value",
      { float: 2 },
      undefined,
    );
  });

  it("steps the orchestrator and updates frame + hook subscribers", async () => {
    stepResultRef.current = makeFrame({
      epoch: 3,
      merged_writes: [
        {
          path: "demo/output/value",
          value: { float: 0.5 },
        },
      ],
      timings_ms: { total_ms: 1.23 },
    });

    renderHarness();
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("ready"),
    );

    fireEvent.click(screen.getByTestId("step"));

    await waitFor(() => {
      expect(screen.getByTestId("epoch").textContent).toBe("3");
      expect(screen.getByTestId("target").textContent).toContain("0.5");
    });

    const instance = orchestratorInstances[0];
    expect(instance.step).toHaveBeenCalledWith(1 / 60);
  });

  it("does not set state after unmount when create resolves late", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    let resolveCreate: ((value: OrchestratorMock) => void) | null = null;
    vi.mocked(createOrchestrator).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );

    const { unmount } = render(
      <OrchestratorProvider autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );

    // Unmount before the async create resolves.
    unmount();

    await act(async () => {
      resolveCreate?.(makeInstance());
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    vi.mocked(createOrchestrator).mockImplementation(async () =>
      makeInstance(),
    );
    consoleError.mockRestore();
  });

  it("handles mount/unmount/remount without leaving ready false", async () => {
    const first = render(
      <OrchestratorProvider autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("ready"),
    );
    first.unmount();

    const second = render(
      <OrchestratorProvider autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("ready"),
    );
    second.unmount();

    expect(vi.mocked(createOrchestrator)).toHaveBeenCalledTimes(2);
  });
});
