import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { exportScene } from "@vizij/render";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";
import { buildRigGraphSpec } from "@vizij/node-graph-authoring";
import { useVizijExport } from "../useVizijExport";
import { PoseGraphService } from "../../poseRig/services/poseGraphService";
import { downloadJsonFile } from "../../utils/fileIO";

vi.mock("@vizij/render", () => ({
  exportScene: vi.fn(),
}));

vi.mock("@vizij/node-graph-authoring", async () => {
  const actual = await vi.importActual<
    typeof import("@vizij/node-graph-authoring")
  >("@vizij/node-graph-authoring");
  return {
    ...actual,
    buildRigGraphSpec: vi.fn(),
  };
});

vi.mock("@vizij/node-graph-wasm", async () => {
  const actual = await vi.importActual<typeof import("@vizij/node-graph-wasm")>(
    "@vizij/node-graph-wasm",
  );
  return {
    ...actual,
    normalizeGraphSpec: vi.fn(),
  };
});

vi.mock("../../utils/fileIO", () => ({
  downloadJsonFile: vi.fn(),
  ensureExtension: (value: string, defaultBase: string, extension: string) => {
    const suffix = extension.startsWith(".") ? extension : `.${extension}`;
    const trimmed = value.trim();
    if (!trimmed.length) {
      return `${defaultBase}${suffix}`;
    }
    return trimmed.toLowerCase().endsWith(suffix.toLowerCase())
      ? trimmed
      : `${trimmed}${suffix}`;
  },
}));

vi.mock("../../poseRig/services/poseGraphService", () => ({
  PoseGraphService: {
    buildSpec: vi.fn(),
    validate: vi.fn(),
    parse: vi.fn(),
  },
}));

const mockedExportScene = vi.mocked(exportScene);
const mockedNormalizeGraphSpec = vi.mocked(normalizeGraphSpec);
const mockedBuildRigGraphSpec = vi.mocked(buildRigGraphSpec);
const mockedPoseGraphService = vi.mocked(PoseGraphService);
const mockedDownloadJsonFile = vi.mocked(downloadJsonFile);

type HookResult = ReturnType<typeof useVizijExport>;

function renderHook(options: Parameters<typeof useVizijExport>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const result: { current: HookResult | null } = { current: null };

  function HookWrapper() {
    result.current = useVizijExport(options);
    return null;
  }

  let root: Root;
  act(() => {
    root = createRoot(container);
    root.render(<HookWrapper />);
  });

  return {
    result,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

const ANIMATABLE: AnimatableValue = {
  id: "rig/face/mouth/pos/y",
  type: "number",
  name: "Mouth Pos Y",
  default: 0,
  constraints: {
    min: -1,
    max: 1,
  },
  pub: {
    public: true,
    output: "Mouth Pos Y",
  },
};

const COMPONENT: AnimatableComponent = {
  id: "component_1",
  safeId: "component_1",
  animatableId: ANIMATABLE.id,
  animatableType: "number",
  label: "Mouth Pos Y",
  defaultValue: 0,
  range: {
    min: -1,
    max: 1,
  },
};

const INPUT: StandardRigInput = {
  id: "input_a",
  path: "/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

function createOptions(
  overrides: Partial<Parameters<typeof useVizijExport>[0]> = {},
): Parameters<typeof useVizijExport>[0] {
  const values = new Map<string, number>();
  return {
    faceId: "face",
    graphFileName: "graph.json",
    exportFileName: "scene.glb",
    rootId: "root",
    sourceName: "source",
    includeVizijBundle: true,
    includeImportedAnimations: false,
    loadedBundle: null,
    animatableComponents: [COMPONENT],
    animatables: {
      [ANIMATABLE.id]: ANIMATABLE,
    },
    values,
    bindings: {},
    inputBindings: {},
    standardInputsById: new Map([[INPUT.id, INPUT]]),
    featureLabelOverrides: {},
    collectAnimatableExportState: () => ({
      appliedOverrides: false,
      nextAnimatables: {},
      nextValues: new Map(),
      effectiveAnimatables: {
        [ANIMATABLE.id]: ANIMATABLE,
      },
    }),
    setStoreState: () => {},
    getExportableBodies: () => [{ traverse: () => {} }],
    alertDialog: vi.fn(),
    poseRig: {
      poseGraphSpec: null,
      poseGraphFileName: "pose_graph.json",
      poseConfigDraft: null,
      poseConfigFileName: "pose_config.json",
      importPoseConfig: vi.fn(),
      blendMode: "average" as const,
    },
    ...overrides,
  };
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  mockedExportScene.mockReset();
  mockedNormalizeGraphSpec.mockReset();
  mockedBuildRigGraphSpec.mockReset();
  mockedPoseGraphService.buildSpec.mockReset();
  mockedPoseGraphService.validate.mockReset();
  mockedPoseGraphService.parse.mockReset();
  mockedDownloadJsonFile.mockReset();
});

describe("useVizijExport", () => {
  it("blocks export when buildRigGraphSpec has fatal issues", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: {
        fatal: [{ id: "fatal", message: "bad" }],
        warnings: [],
        info: [],
      },
      ir: { graph: { nodes: [] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);

    const options = createOptions();
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedNormalizeGraphSpec).not.toHaveBeenCalled();
    expect(mockedExportScene).not.toHaveBeenCalled();
    expect(options.alertDialog).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("blocks export when normalizeGraphSpec throws", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockRejectedValue(new Error("normalize failed"));

    const options = createOptions();
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).not.toHaveBeenCalled();
    expect(options.alertDialog).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("exports when GraphSpec is valid", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const options = createOptions();
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    const exportArgs = mockedExportScene.mock.calls[0];
    expect(exportArgs?.[1]).toMatchObject({
      fileName: "scene.glb",
      bundle: {
        graphs: [
          {
            spec: { nodes: [{ id: "n1", type: "input" }] },
            ir: { nodes: [{ id: "ir1" }] },
          },
        ],
      },
    });
    hook.unmount();
  });

  it("uses the current blend mode when exporting pose graphs", async () => {
    mockedPoseGraphService.buildSpec.mockReturnValue({
      spec: { nodes: [] } as GraphSpec,
      summary: { inputs: [], outputs: [] },
    });
    mockedPoseGraphService.validate.mockReturnValue([]);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: {},
          poses: [],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseGraphFile();
    });

    expect(mockedPoseGraphService.buildSpec).toHaveBeenCalledWith(
      options.poseRig.poseConfigDraft,
      Array.from(options.standardInputsById.values()),
      expect.objectContaining({ blendMode: "additive" }),
    );
    hook.unmount();
  });

  it("recomputes pose graph for GLB export using the active blend mode", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);
    mockedPoseGraphService.buildSpec.mockReturnValue({
      spec: { nodes: [{ id: "pose1", type: "output" }] } as GraphSpec,
      summary: { inputs: [], outputs: [] },
    });
    mockedPoseGraphService.validate.mockReturnValue([]);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: {},
          poses: [],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedPoseGraphService.buildSpec).toHaveBeenCalledWith(
      options.poseRig.poseConfigDraft,
      Array.from(options.standardInputsById.values()),
      expect.objectContaining({ blendMode: "additive" }),
    );
    expect(mockedPoseGraphService.validate).toHaveBeenCalledWith(
      { nodes: [{ id: "pose1", type: "output" }] },
      Array.from(options.standardInputsById.values()),
    );
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(mockedExportScene.mock.calls[0]?.[1]).toMatchObject({
      bundle: {
        graphs: expect.arrayContaining([
          expect.objectContaining({
            kind: "pose-driver",
            spec: { nodes: [{ id: "pose1", type: "output" }] },
          }),
        ]),
      },
    });
    hook.unmount();
  });

  it("blocks export when pose graph is invalid", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);
    mockedPoseGraphService.validate.mockReturnValue(["pose invalid"]);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: { nodes: [] } as GraphSpec,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: null,
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "average" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).not.toHaveBeenCalled();
    expect(options.alertDialog).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});
