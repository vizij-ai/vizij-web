import React, { act } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import {
  GraphRuntimeStoreProvider,
  createGraphRuntimeStore,
} from "../../state/graphRuntimeStore";
import {
  BindingAuthoringStoreProvider,
  createBindingAuthoringStore,
} from "../../state/bindingAuthoringStore";
import { useAnimationStore } from "../../state/animationStore";
import { useEditorStore } from "../../motiongraph/store/useEditorStore";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  type AnimationClipIR,
} from "../../types/animationClipIr";
import { Viewer } from "./Viewer";

const motionGraphValueSamplerSpy = vi.hoisted(() => vi.fn());

/** The main face's device: its keys under `rig/face/`, and what it was
 * asked. The animation module answers with the ids it hands out. */
const device = vi.hoisted(() => ({
  path: (relative: string) => `rig/face/${relative}`,
  loadGraph: vi.fn(async (_spec: unknown) => undefined),
  invoke: vi.fn(async (method: string, _args?: unknown) =>
    method === "load_animation"
      ? { u32: 3 }
      : method === "create_player"
        ? { u32: 7 }
        : method === "add_instance_with_weight"
          ? { u32: 1 }
          : undefined,
  ),
  hold: vi.fn(),
  release: vi.fn(),
  readValues: vi.fn((paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, null])),
  ),
  moduleAnimation: vi.fn((animation: { id: string }) => ({
    moduleAnimation: { clipOf: animation },
  })),
}));

const face = vi.hoisted(() => ({
  vizijId: "authoring-main",
  status: "ready",
  error: null,
  runtime: device,
  description: { graphs: [], animatables: {}, rigInputs: [] },
}));

vi.mock("@vizij/runtime-react", () => ({
  VizijRuntimeFace: ({ className }: { className?: string }) => (
    <div data-testid="runtime-face" className={className} />
  ),
  useOptionalVizijRuntime: () => face,
  useVizijRuntime: () => face,
  useVizijChanges: () => {},
}));

vi.mock("@vizij/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@vizij/runtime")>()),
  ANIMATION_PLAYERS_PATH: "vizij/animations/players",
  decodePlayerStates: () => [],
  composeVizij: vi.fn(async (gltf: unknown, options: unknown) => ({
    composed: { gltf, options },
  })),
  outputKeys: vi.fn(async () => ["rig/face/standard/brow/inner_up"]),
}));

// The real demo mounts its own runtime provider and fetches a GLB, neither of
// which works in jsdom.
vi.mock("./emptyStateDemo/EmptyStateDemo", () => ({
  EmptyStateDemo: () => <div data-testid="empty-state-demo" />,
}));

vi.mock("../../motiongraph/components/MotionGraphValueSampler", () => ({
  MotionGraphValueSampler: ({ active }: { active: boolean }) => {
    motionGraphValueSamplerSpy({ active });
    return (
      <div
        data-testid="motiongraph-value-sampler"
        data-active={String(active)}
      />
    );
  },
}));

vi.mock("../../motiongraph/components/InputValueBridge", () => ({
  InputValueBridge: () => <div data-testid="input-value-bridge" />,
}));

vi.mock("../../motiongraph/MotionGraphDriverBridge", () => ({
  MotionGraphDriverBridge: () => (
    <div data-testid="motiongraph-driver-bridge" />
  ),
}));

type ViewerProps = React.ComponentProps<typeof Viewer>;

const BASE_PROPS: ViewerProps = {
  rootId: "root",
  bundle: null,
  onClearSelection: () => {},
  showSelectionGlow: false,
  onImportClick: () => {},
  onLoadQuori: () => {},
};

function renderViewer(
  props: Partial<ViewerProps> = {},
  stores: {
    graph?: ReturnType<typeof createGraphRuntimeStore>;
    binding?: ReturnType<typeof createBindingAuthoringStore>;
  } = {},
) {
  const graphStore = stores.graph ?? createGraphRuntimeStore();
  const bindingStore = stores.binding ?? createBindingAuthoringStore();
  const tree = (next: Partial<ViewerProps>) => (
    <GraphRuntimeStoreProvider store={graphStore}>
      <BindingAuthoringStoreProvider store={bindingStore}>
        <Viewer {...BASE_PROPS} {...next} />
      </BindingAuthoringStoreProvider>
    </GraphRuntimeStoreProvider>
  );
  const view = render(tree(props));
  return {
    container: view.container,
    rerender: (next: Partial<ViewerProps>) => view.rerender(tree(next)),
  };
}

/** Let the device operations the bridges queued run. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  });
}

function clip(value = 1): AnimationClipIR {
  return {
    schemaVersion: 1,
    id: AUTHORED_TIMELINE_CLIP_ID,
    duration: 1,
    tracks: [
      {
        id: "t0",
        variableId: "a",
        channel: "controls/a",
        interpolation: "linear",
        keyframes: [
          { id: "k0", time: 0, value: 0 },
          { id: "k1", time: 1, value },
        ],
      },
    ],
  };
}

const methodsInvoked = () => device.invoke.mock.calls.map(([method]) => method);

describe("Viewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAnimationStore.getState().reset();
    useEditorStore.getState().clear();
  });

  afterEach(cleanup);

  it("shows the empty scene with its demo when no face is loaded", () => {
    const { container } = renderViewer({ rootId: null });

    expect(
      container.querySelector('[data-testid="empty-state-demo"]'),
    ).toBeTruthy();
    expect(
      container.querySelector('[data-testid="main-import-file-button"]'),
    ).toBeTruthy();
    expect(container.querySelector('[data-testid="runtime-face"]')).toBeNull();
  });

  it("shows the main face's slot when a face is loaded", () => {
    const { container } = renderViewer();

    expect(
      container.querySelector(
        '[data-testid="main-runtime-view"] [data-testid="runtime-face"]',
      ),
    ).toBeTruthy();
  });

  it("loads the authored rig and pose graphs into the face's device, in place of the bundle's", async () => {
    const rig = { nodes: [{ id: "authored-rig" }] } as unknown as GraphSpec;
    const pose = { nodes: [{ id: "authored-pose" }] } as unknown as GraphSpec;
    const poseConfig = { version: 1, neutralInputs: {}, poses: [] };
    const graph = createGraphRuntimeStore({
      graphSpec: rig,
      poseGraphSpec: pose,
      poseConfig: poseConfig as never,
    });
    renderViewer(
      {
        bundle: {
          version: 1,
          graphs: [{ id: "shipped-rig", kind: "rig", spec: { nodes: [] } }],
        },
      },
      { graph },
    );
    await settle();

    expect(device.loadGraph).toHaveBeenCalledTimes(1);
    expect(device.loadGraph).toHaveBeenCalledWith({
      composed: {
        gltf: {
          asset: { version: "2.0" },
          extensions: {
            VIZIJ_bundle: {
              version: 1,
              graphs: [
                { id: "shipped-rig", kind: "rig", spec: rig },
                { id: "pose", kind: "pose-driver", spec: pose },
              ],
              poses: { config: poseConfig },
            },
          },
        },
        options: {
          graphs: ["rig", "pose-driver", "pose"],
          program: "none",
          animations: true,
        },
      },
    });
  });

  it("plays the active clip on the timeline's own player, reloading it in place on edits", async () => {
    const { rerender } = renderViewer({
      animationSourceActive: true,
      animationRuntimeClip: clip(),
    });
    await settle();

    expect(device.invoke.mock.calls).toEqual([
      ["load_animation", { clip: expect.anything() }],
      ["create_player", { name: AUTHORED_TIMELINE_CLIP_ID }],
      [
        "add_instance_with_weight",
        { player: { u32: 7 }, anim: { u32: 3 }, weight: { f32: 1 } },
      ],
    ]);
    expect(useAnimationStore.getState().transportRuntimeReady).toBe(true);

    device.invoke.mockClear();
    rerender({ animationSourceActive: true, animationRuntimeClip: clip(2) });
    await settle();

    expect(device.invoke.mock.calls).toEqual([
      ["reload_animation", { anim: { u32: 3 }, clip: expect.anything() }],
      [
        "set_weight",
        { player: { u32: 7 }, instance: { u32: 1 }, weight: { f32: 1 } },
      ],
    ]);
  });

  it("silences the timeline and returns its keys to rest when its clip goes", async () => {
    const { rerender } = renderViewer({
      animationSourceActive: true,
      animationRuntimeClip: clip(),
    });
    await settle();
    device.invoke.mockClear();

    rerender({ animationSourceActive: false, animationRuntimeClip: null });
    await settle();

    expect(device.invoke.mock.calls).toEqual([
      ["stop", { player: { u32: 7 } }],
      [
        "set_weight",
        { player: { u32: 7 }, instance: { u32: 1 }, weight: { f32: 0 } },
      ],
      ["reset_keys", { keys: { strs: ["rig/face/controls/a"] } }],
    ]);
    expect(useAnimationStore.getState().transportRuntimeReady).toBe(false);
  });

  it("loads nothing on the timeline while no clip is active", async () => {
    renderViewer({ animationSourceActive: false });
    await settle();

    expect(methodsInvoked()).toEqual([]);
  });

  it("holds the inspector's locked targets on the face", async () => {
    const binding = createBindingAuthoringStore({
      lockedInspectorTargetIds: new Set(["jaw:x"]),
    });
    renderViewer({}, { binding });
    await settle();

    expect(device.hold).toHaveBeenCalledWith(["jaw:x"]);
  });

  it("resets managed input IDs to their defaults", () => {
    const applyStandardInputBatch = vi.fn();
    const binding = createBindingAuthoringStore({
      managedStandardInputs: [
        {
          input: {
            id: "jaw_open",
            label: "Jaw Open",
            path: "/standard/jaw/open",
            range: { min: -1, max: 1 },
            defaultValue: 0.5,
          } as never,
          source: "custom",
          disabled: false,
        },
        {
          input: {
            id: "jaw_control",
            label: "Pose Control Jaw",
            path: "/pose/control/jaw_open",
            range: { min: 0, max: 1 },
            defaultValue: 0.9,
          } as never,
          source: "auto",
          disabled: false,
        },
        {
          input: {
            id: "pose_smile_weight",
            label: "Smile Weight",
            path: "/poses/pose_smile.weight",
            range: { min: 0, max: 1 },
          } as never,
          source: "auto",
          disabled: false,
        },
      ],
      applyStandardInputBatch,
    });
    const { container } = renderViewer({}, { binding });

    fireEvent.click(
      container.querySelector(
        'button[title="Reset main-face inputs to their default values"]',
      ) as HTMLButtonElement,
    );

    expect(applyStandardInputBatch).toHaveBeenCalledWith({
      jaw_open: 0.5,
      pose_smile_weight: 0,
    });
  });

  it("skips the reset when only pose-control inputs exist", () => {
    const applyStandardInputBatch = vi.fn();
    const binding = createBindingAuthoringStore({
      managedStandardInputs: [
        {
          input: {
            id: "pose_control_jaw",
            label: "Pose Control Jaw",
            path: "/pose/control/jaw_open",
            range: { min: 0, max: 1 },
            defaultValue: 0.5,
          } as never,
          source: "auto",
          disabled: false,
        },
      ],
      applyStandardInputBatch,
    });
    const { container } = renderViewer({}, { binding });

    fireEvent.click(
      container.querySelector(
        'button[title="Reset main-face inputs to their default values"]',
      ) as HTMLButtonElement,
    );

    expect(applyStandardInputBatch).not.toHaveBeenCalled();
  });

  it("keeps motion-graph sampling active while plotting a program that plays", () => {
    renderViewer({
      motionGraphPlaybackState: "playing",
      motionGraphRuntimeControllerId: "graph:test",
      motionGraphRuntimeNodes: [],
      motionGraphRuntimeEdges: [],
    });

    act(() => {
      useEditorStore.getState().togglePlot();
    });

    expect(motionGraphValueSamplerSpy).toHaveBeenLastCalledWith({
      active: true,
    });
  });

  it("returns a stopped program's outputs to rest", async () => {
    const playing: Partial<ViewerProps> = {
      motionGraphPlaybackState: "playing",
      motionGraphRuntimeControllerId: "graph:test",
      motionGraphRuntimeNodes: [],
      motionGraphRuntimeEdges: [],
    };
    const { rerender } = renderViewer(playing);
    await settle();
    device.invoke.mockClear();

    rerender({
      motionGraphPlaybackState: "stopped",
      motionGraphRuntimeControllerId: null,
      motionGraphRuntimeNodes: null,
      motionGraphRuntimeEdges: null,
    });
    await settle();

    expect(device.invoke).toHaveBeenCalledWith("reset_keys", {
      keys: { strs: ["rig/face/standard/brow/inner_up"] },
    });
  });
});
