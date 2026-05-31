// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VizijAssetBundle } from "../types";
import { VizijRuntimeProvider } from "../VizijRuntimeProvider";

const orchestratorProviderProps = vi.hoisted(
  () => [] as Array<Record<string, unknown>>,
);

vi.mock("@vizij/orchestrator-react", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@vizij/orchestrator-react")>();
  const React = await vi.importActual<typeof import("react")>("react");
  const OrchestratorContext = React.createContext<Record<
    string,
    unknown
  > | null>(null);
  const mockOrchestrator = {
    backend: "aroraWeb",
    ready: true,
    createOrchestrator: vi.fn(async () => {}),
    registerGraph: vi.fn(() => "graph-1"),
    registerMergedGraph: vi.fn(() => "merged-graph-1"),
    registerAnimation: vi.fn(() => "anim-1"),
    prebind: vi.fn(),
    setInput: vi.fn(),
    removeInput: vi.fn(() => true),
    step: vi.fn((dt: number) => ({
      epoch: 1,
      dt,
      merged_writes: [],
      conflicts: [],
      timings_ms: { total_ms: 0 },
      events: [],
    })),
    listControllers: vi.fn(() => ({ graphs: [], anims: [] })),
    removeGraph: vi.fn(() => true),
    removeAnimation: vi.fn(() => true),
    getLatestFrame: vi.fn(() => null),
    subscribeToPath: vi.fn(() => () => {}),
    getPathSnapshot: vi.fn(() => undefined),
    subscribeToFrame: vi.fn(() => () => {}),
    getFrameSnapshot: vi.fn(() => null),
    normalizeGraphSpec: vi.fn(async (spec: unknown) => spec),
    getDebugInfo: vi.fn(() => ({
      aroraWebInstanceId: "arora-web:test-runtime",
    })),
  };

  function OrchestratorProvider(props: Record<string, unknown>) {
    orchestratorProviderProps.push(props);
    return React.createElement(
      OrchestratorContext.Provider,
      { value: mockOrchestrator },
      props.children as React.ReactNode,
    );
  }

  function useOrchestrator() {
    return React.useContext(OrchestratorContext) ?? mockOrchestrator;
  }

  function useOrchFrame() {
    return null;
  }

  function resolveVizijOrchestratorInitInput(
    backend?: string,
    initInput?: unknown,
  ) {
    if (backend !== "aroraWeb") {
      return initInput;
    }
    const defaults = {
      orchestratorModule: "composed",
      moduleRegistryUrl: "/arora-web/modules/manifest.json",
    };
    if (!initInput) {
      return defaults;
    }
    if (typeof initInput !== "object" || initInput === null) {
      return initInput;
    }
    const prototype = Object.getPrototypeOf(initInput);
    if (prototype !== Object.prototype && prototype !== null) {
      return initInput;
    }
    return {
      ...defaults,
      ...(initInput as Record<string, unknown>),
    };
  }

  return {
    ...actual,
    OrchestratorProvider,
    OrchestratorContext,
    useOrchestrator,
    useOrchFrame,
    resolveVizijOrchestratorInitInput,
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

function makeBundle(): VizijAssetBundle {
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
  };
}

async function mountProvider(
  props: Partial<React.ComponentProps<typeof VizijRuntimeProvider>> = {},
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(
      <VizijRuntimeProvider
        assetBundle={makeBundle()}
        autoCreate={false}
        autostart={false}
        driveOrchestrator={false}
        namespace="demo-face"
        {...props}
      >
        <div />
      </VizijRuntimeProvider>,
    );
    await Promise.resolve();
  });
}

afterEach(() => {
  delete (
    globalThis as {
      __VIZIJ_MEMORY_INVESTIGATION__?: unknown;
      __vizijMemoryDebugState?: unknown;
    }
  ).__VIZIJ_MEMORY_INVESTIGATION__;
  delete (
    globalThis as {
      __VIZIJ_MEMORY_INVESTIGATION__?: unknown;
      __vizijMemoryDebugState?: unknown;
    }
  ).__vizijMemoryDebugState;
  orchestratorProviderProps.splice(0);
  mountedRoots.splice(0).forEach(({ root, container }) => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});

describe("VizijRuntimeProvider orchestrator wiring", () => {
  it("creates an owned Arora web orchestrator with composed module defaults", async () => {
    await mountProvider({ orchestratorBackend: "aroraWeb" });

    expect(orchestratorProviderProps).toHaveLength(1);
    expect(orchestratorProviderProps[0]).toMatchObject({
      backend: "aroraWeb",
      initInput: {
        orchestratorModule: "composed",
        moduleRegistryUrl: "/arora-web/modules/manifest.json",
      },
      autostart: false,
      autoCreate: false,
    });
  });

  it("preserves explicit Arora web compatibility fallback settings", async () => {
    await mountProvider({
      orchestratorBackend: "aroraWeb",
      orchestratorInitInput: {
        orchestratorModule: "compatibility",
        moduleRegistryUrl: false,
      },
    });

    expect(orchestratorProviderProps).toHaveLength(1);
    expect(orchestratorProviderProps[0]).toMatchObject({
      backend: "aroraWeb",
      initInput: {
        orchestratorModule: "compatibility",
        moduleRegistryUrl: false,
      },
    });
  });

  it("publishes the backing Arora web debug instance id", async () => {
    (
      globalThis as {
        __VIZIJ_MEMORY_INVESTIGATION__?: { enabled?: boolean };
      }
    ).__VIZIJ_MEMORY_INVESTIGATION__ = { enabled: true };

    await mountProvider({ orchestratorBackend: "aroraWeb" });

    const runtimes = Object.values(
      (
        globalThis as {
          __vizijMemoryDebugState?: {
            runtimes?: Record<string, Record<string, unknown>>;
          };
        }
      ).__vizijMemoryDebugState?.runtimes ?? {},
    );
    expect(runtimes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          namespace: "demo-face",
          aroraWebDebugInstanceId: "arora-web:test-runtime",
        }),
      ]),
    );
  });

  it("fails closed when shared scope has no parent orchestrator", async () => {
    await expect(
      mountProvider({
        orchestratorBackend: "aroraWeb",
        orchestratorScope: "shared",
      }),
    ).rejects.toThrow(
      '[vizij-runtime] orchestratorScope="shared" requires an OrchestratorProvider higher in the tree.',
    );

    expect(orchestratorProviderProps).toHaveLength(0);
  });
});
