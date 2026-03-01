import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  describe,
  expect,
  it,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from "vitest";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { exportScene } from "@vizij/render";
import { normalizeGraphSpec } from "@vizij/node-graph-wasm";
import { buildRigGraphSpec } from "@vizij/node-graph-authoring";
import { downloadJsonFile } from "@vizij/authoring-shared";
import { useVizijExport } from "../useVizijExport";
import { PoseGraphService } from "../../poseRig/services/poseGraphService";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
} from "../../poseRig/types";
import { auditBundleGraphs } from "../../utils/bundleAudit";

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

vi.mock("@vizij/authoring-shared", () => ({
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

vi.mock("../../utils/bundleAudit", () => ({
  auditBundleGraphs: vi.fn(),
}));

const mockedExportScene = vi.mocked(exportScene);
const mockedNormalizeGraphSpec = vi.mocked(normalizeGraphSpec);
const mockedBuildRigGraphSpec = vi.mocked(buildRigGraphSpec);
const mockedPoseGraphService = vi.mocked(PoseGraphService);
const mockedDownloadJsonFile = vi.mocked(downloadJsonFile);
const mockedAuditBundleGraphs = vi.mocked(auditBundleGraphs);

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
    validOutputTargets: new Set<string>(["/propsrig/face/mouth/pos/y"]),
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
      crossGroupBlendMode: "additive" as const,
    },
    ...overrides,
  };
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mockedAuditBundleGraphs.mockResolvedValue([]);
});

afterEach(() => {
  mockedExportScene.mockReset();
  mockedNormalizeGraphSpec.mockReset();
  mockedBuildRigGraphSpec.mockReset();
  mockedPoseGraphService.buildSpec.mockReset();
  mockedPoseGraphService.validate.mockReset();
  mockedPoseGraphService.parse.mockReset();
  mockedDownloadJsonFile.mockReset();
  mockedAuditBundleGraphs.mockReset();
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

    expect(mockedAuditBundleGraphs).toHaveBeenCalledWith(
      expect.objectContaining({
        graphs: expect.any(Array),
      }),
      {
        validOutputTargets: options.validOutputTargets,
      },
    );
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
        poses: null,
      },
    });
    hook.unmount();
  });

  it("passes staged pipeline config to graph build and preserves compiled rig pipeline metadata", async () => {
    const compiledPipelineMetadata = {
      version: 1,
      byInputId: {
        input_a: {
          inputId: "input_a",
          directInput: {
            enabled: false,
            valuePath: "rig/face/controls/a",
          },
          clamp: {
            enabled: true,
          },
        },
      },
      links: {
        link_jaw: {
          scale: 1,
          offset: 0,
        },
      },
    };
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: {
        nodes: [{ id: "n1", type: "input" }],
        metadata: {
          vizij: {
            faceId: "face",
            inputs: [],
            bindings: [],
            pipelineV1: compiledPipelineMetadata,
          },
        },
      } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const options = createOptions({
      pipelineMetadataV1: {
        links: {
          link_jaw: {
            scale: 1,
            offset: 0,
          },
        },
      },
      pipelineConfigByInputId: {
        input_a: {
          clamp: { enabled: true },
        },
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedBuildRigGraphSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineV1: expect.objectContaining({
          byInputId: expect.objectContaining({
            input_a: expect.objectContaining({
              clamp: { enabled: true },
            }),
          }),
        }),
      }),
    );
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    const exportPayload = mockedExportScene.mock.calls[0]?.[1] as {
      bundle?: { graphs?: Array<{ kind?: string; spec?: unknown }> };
    };
    const rigGraphSpec = exportPayload.bundle?.graphs?.find(
      (graph) => graph.kind === "rig",
    )?.spec as {
      metadata?: {
        vizij?: {
          pipelineV1?: unknown;
        };
      };
    };
    expect(rigGraphSpec.metadata?.vizij?.pipelineV1).toEqual(
      compiledPipelineMetadata,
    );
    hook.unmount();
  });

  it("normalizes export pipeline metadata so links and byInputId stay internally consistent", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const parentInput: StandardRigInput = {
      id: "blink",
      path: "/controls/eyes/blink",
      label: "Blink",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };
    const childInput: StandardRigInput = {
      id: "propsrig_ltlid_lidcurve_value",
      path: "/propsrig/ltlid/lidcurve/value",
      label: "Left Lid Curve",
      group: "eyes",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };

    const options = createOptions({
      standardInputsById: new Map([
        [parentInput.id, parentInput],
        [childInput.id, childInput],
      ]),
      pipelineMetadataV1: {
        links: {
          "link/blink->propsrig_ltlid_lidcurve_value": {
            parentInputId: "blink",
            childInputId: "propsrig_ltlid_lidcurve_value",
            scale: 1,
            offset: 0.1,
            enabled: true,
          },
        },
      },
      pipelineConfigByInputId: {
        propsrig_ltlid_lidcurve_value: {
          clamp: { enabled: true },
          parents: [],
        },
        blink: {
          inputId: "blink",
          parents: [],
          children: ["propsrig_ltlid_lidcurve_value"],
          directInput: { enabled: false },
          poseSource: { targetIds: [] },
        },
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedBuildRigGraphSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        pipelineV1: expect.objectContaining({
          byInputId: expect.objectContaining({
            propsrig_ltlid_lidcurve_value: expect.objectContaining({
              inputId: "propsrig_ltlid_lidcurve_value",
              parents: [
                expect.objectContaining({
                  inputId: "blink",
                  linkId: "link/blink->propsrig_ltlid_lidcurve_value",
                }),
              ],
            }),
            blink: expect.objectContaining({
              inputId: "blink",
              children: ["propsrig_ltlid_lidcurve_value"],
              directInput: expect.objectContaining({
                enabled: true,
              }),
            }),
          }),
          links: expect.objectContaining({
            "link/blink->propsrig_ltlid_lidcurve_value":
              expect.objectContaining({
                parentInputId: "blink",
                childInputId: "propsrig_ltlid_lidcurve_value",
                linkId: "link/blink->propsrig_ltlid_lidcurve_value",
              }),
          }),
        }),
      }),
    );
    hook.unmount();
  });

  it("includes pose compose targets in rig graph builds for GLB and graph exports", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: {},
          poses: [
            {
              id: "pose_smile",
              name: "Smile",
              values: { input_a: 0.6 },
              createdAt: "2026-03-01T00:00:00.000Z",
              updatedAt: "2026-03-01T00:00:00.000Z",
            },
          ],
          poseGroups: [],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    act(() => {
      hook.result.current?.exportGraph();
    });

    const composeCall = expect.objectContaining({
      inputComposeModesById: expect.objectContaining({
        input_a: "add",
      }),
    });
    expect(mockedBuildRigGraphSpec).toHaveBeenCalledWith(composeCall);
    hook.unmount();
  });

  it("skips null exportable bodies and exports with the first valid body", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const validBody = { traverse: vi.fn() };
    const options = createOptions({
      getExportableBodies: () => [null as unknown as object, validBody],
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(mockedExportScene.mock.calls[0]?.[0]).toBe(validBody);
    hook.unmount();
  });

  it("uses fallback export body when store export bodies are unavailable for raw GLB export", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const fallbackBody = { traverse: vi.fn() };
    const options = createOptions({
      includeVizijBundle: false,
      getExportableBodies: () => [],
      fallbackExportBody: fallbackBody,
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(mockedExportScene.mock.calls[0]?.[0]).toBe(fallbackBody);
    hook.unmount();
  });

  it("blocks bundled export when fallback body lacks RobotData", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const fallbackBody = { traverse: vi.fn() };
    const alertDialog = vi.fn();
    const options = createOptions({
      getExportableBodies: () => [],
      fallbackExportBody: fallbackBody,
      alertDialog,
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).not.toHaveBeenCalled();
    expect(alertDialog).toHaveBeenCalledTimes(1);
    const alertMessage = vi.mocked(alertDialog).mock.calls[0]?.[0];
    expect(typeof alertMessage).toBe("string");
    expect(alertMessage).toContain("Bundled export is using fallback scene");
    expect(alertMessage).toContain("no mounted runtime refs were found");
    expect(alertMessage).toContain("Fallback scene has no RobotData nodes");
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
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              values: {
                input_a: 0.5,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "additive" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseGraphFile();
    });

    expect(mockedPoseGraphService.buildSpec).toHaveBeenCalledWith(
      options.poseRig.poseConfigDraft,
      Array.from(options.standardInputsById.values()),
      expect.objectContaining({
        defaultGroupBlendMode: "additive",
        crossGroupBlendMode: "additive",
      }),
    );
    hook.unmount();
  });

  it("exports pose config from the IR projection when IR is available", async () => {
    const options = createOptions({
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          title: "From Config",
          neutralInputs: {},
          poses: [],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        poseIrDraft: {
          version: 1,
          faceId: "face",
          title: "From IR",
          contracts: {
            targetIds: POSE_IR_TARGETING_CONTRACT,
            syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
          },
          neutral: {
            mode: "explicit",
            values: {
              input_a: 0.1,
            },
          },
          groups: [
            {
              id: "emotion",
              name: "Emotion",
              path: "emotion",
              intraGroupBlendMode: "average",
              poseIds: ["pose_smile"],
            },
          ],
          crossGroupPolicy: {
            mode: "add",
          },
          poses: [
            {
              id: "pose_smile",
              name: "Smile",
              groupIds: ["emotion"],
              targets: {
                input_a: 0.7,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseConfigFile();
    });

    expect(mockedDownloadJsonFile).toHaveBeenCalledTimes(1);
    expect(mockedDownloadJsonFile.mock.calls[0]?.[0]).toMatchObject({
      title: "From IR",
      neutralMode: "explicit",
      crossGroupBlendMode: "additive",
      neutralInputs: {
        input_a: 0.1,
      },
      poses: [
        expect.objectContaining({
          id: "pose_smile",
          values: {
            input_a: 0.7,
          },
        }),
      ],
    });
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
      spec: {
        nodes: [
          { id: "pose_neutral_record", type: "constant" },
          { id: "pose_record_pose_1", type: "constant" },
        ],
      } as GraphSpec,
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
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              values: {
                input_a: 0.5,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "additive" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedPoseGraphService.buildSpec).toHaveBeenCalledWith(
      options.poseRig.poseConfigDraft,
      Array.from(options.standardInputsById.values()),
      expect.objectContaining({
        defaultGroupBlendMode: "additive",
        crossGroupBlendMode: "additive",
      }),
    );
    expect(mockedPoseGraphService.validate).toHaveBeenCalledWith(
      {
        nodes: [
          { id: "pose_neutral_record", type: "constant" },
          { id: "pose_record_pose_1", type: "constant" },
        ],
      },
      Array.from(options.standardInputsById.values()),
    );
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(mockedExportScene.mock.calls[0]?.[1]).toMatchObject({
      bundle: {
        graphs: expect.arrayContaining([
          expect.objectContaining({
            kind: "pose-driver",
            spec: {
              nodes: [
                { id: "pose_neutral_record", type: "constant" },
                { id: "pose_record_pose_1", type: "constant" },
              ],
            },
          }),
        ]),
      },
    });
    hook.unmount();
  });

  it("includes pose config, pose IR, and diagnostics metadata in exported bundles", async () => {
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
      spec: {
        nodes: [
          { id: "pose_neutral_record", type: "constant" },
          { id: "pose_record_pose_1", type: "constant" },
        ],
      } as GraphSpec,
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
          neutralInputs: {
            input_a: 0,
          },
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              values: {
                input_a: 0.75,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        poseIrDraft: {
          version: 1,
          groups: [],
          poses: [{ id: "pose_1" }],
        },
        poseDiagnostics: [
          {
            id: "pose-ir:warning:1",
            severity: "warning",
            code: "legacy-config-warning",
            source: "pose-ir",
            message: "Legacy mapping was normalized.",
          },
          {
            id: "pose-ir:error:2",
            severity: "error",
            code: "unsupported-ir-version",
            source: "pose-ir",
            message: "Unsupported IR version.",
          },
        ],
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(mockedExportScene.mock.calls[0]?.[1]).toMatchObject({
      bundle: {
        poses: {
          config: {
            version: 1,
            faceId: "face",
          },
          metadata: {
            poseIr: {
              version: 1,
              groups: [],
              poses: [{ id: "pose_1" }],
            },
            diagnostics: [
              expect.objectContaining({
                severity: "warning",
                code: "legacy-config-warning",
              }),
              expect.objectContaining({
                severity: "error",
                code: "unsupported-ir-version",
              }),
            ],
            diagnosticSummary: {
              errors: 1,
              warnings: 1,
              info: 0,
            },
          },
        },
      },
    });
    hook.unmount();
  });

  it("normalizes face id across bundle metadata, graph metadata, pose config, and pose IR", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "vizij", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }], faceId: "vizij" } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);
    mockedPoseGraphService.buildSpec.mockReturnValue({
      spec: {
        nodes: [
          { id: "pose_neutral_record", type: "constant" },
          { id: "pose_record_pose_1", type: "constant" },
        ],
      } as GraphSpec,
      summary: { inputs: [], outputs: [] },
    });
    mockedPoseGraphService.validate.mockReturnValue([]);

    const options = createOptions({
      faceId: null,
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "legacy_face",
          neutralInputs: {},
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              values: {
                input_a: 0.5,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        poseIrDraft: {
          version: 1,
          faceId: "legacy_face",
          contracts: {
            targetIds: POSE_IR_TARGETING_CONTRACT,
            syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
          },
          groups: [],
          crossGroupPolicy: {
            mode: "average",
          },
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              groupIds: [],
              targets: {
                input_a: 0.5,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
          neutral: {
            mode: "explicit",
            values: {},
          },
        },
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedPoseGraphService.buildSpec).toHaveBeenCalledWith(
      expect.objectContaining({
        faceId: "vizij",
      }),
      Array.from(options.standardInputsById.values()),
      expect.objectContaining({
        defaultGroupBlendMode: "average",
        crossGroupBlendMode: "additive",
      }),
    );
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(mockedExportScene.mock.calls[0]?.[1]).toMatchObject({
      bundle: {
        metadata: {
          faceId: "vizij",
        },
        graphs: expect.arrayContaining([
          expect.objectContaining({
            kind: "rig",
            id: "vizij",
            metadata: expect.objectContaining({
              faceId: "vizij",
            }),
          }),
        ]),
        poses: {
          config: {
            faceId: "vizij",
          },
          metadata: {
            poseIr: {
              faceId: "vizij",
            },
          },
        },
      },
    });
    hook.unmount();
  });

  it("does not block export when pose graph metadata exists but no poses were authored", async () => {
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
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedPoseGraphService.buildSpec).not.toHaveBeenCalled();
    expect(mockedPoseGraphService.validate).not.toHaveBeenCalled();
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(options.alertDialog).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("does not block export when pose config exists but contains no poses", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: { nodes: [] } as GraphSpec,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: { input_a: 0 },
          poses: [],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        poseIrDraft: {
          version: 1,
          faceId: "face",
          contracts: {
            targetIds: POSE_IR_TARGETING_CONTRACT,
            syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
          },
          groups: [],
          crossGroupPolicy: {
            mode: "average",
          },
          poses: [],
          neutral: {
            mode: "explicit",
            values: { input_a: 0 },
          },
        },
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedPoseGraphService.buildSpec).not.toHaveBeenCalled();
    expect(mockedPoseGraphService.validate).not.toHaveBeenCalled();
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(options.alertDialog).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("blocks export when authored pose graph is invalid", async () => {
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
      spec: {
        nodes: [
          { id: "pose_neutral_record", type: "constant" },
          { id: "pose_record_pose_1", type: "constant" },
        ],
      } as GraphSpec,
      summary: { inputs: [], outputs: [] },
    });
    mockedPoseGraphService.validate.mockReturnValue(["pose invalid"]);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: {
            input_a: 0,
          },
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              values: {
                input_a: 0.75,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
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

  it("does not block export when built pose graph has no pose constants", async () => {
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
      spec: {
        nodes: [{ id: "pose_neutral_record", type: "constant" }],
      } as GraphSpec,
      summary: { inputs: [], outputs: [] },
    });
    mockedPoseGraphService.validate.mockReturnValue([
      "Pose graph does not contain any pose constant nodes.",
    ]);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: {
            input_a: 0,
          },
          poses: [
            {
              id: "pose_1",
              name: "Smile",
              values: {
                input_a: 0.75,
              },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedPoseGraphService.validate).not.toHaveBeenCalled();
    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(options.alertDialog).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("blocks export when bundle audit reports runtime contract diff", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);
    mockedAuditBundleGraphs.mockResolvedValue([
      {
        id: "face",
        kind: "rig",
        status: "diff",
        faceId: "face",
        diffCount: 2,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      } as Awaited<ReturnType<typeof auditBundleGraphs>>[number],
    ]);

    const options = createOptions();
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).not.toHaveBeenCalled();
    expect(options.alertDialog).toHaveBeenCalledWith(
      'Export blocked: graph "face" does not match compiled IR (2 diffs).',
    );
    hook.unmount();
  });

  it("blocks export when bundle audit finds unmapped output targets", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);
    mockedAuditBundleGraphs.mockResolvedValue([
      {
        id: "face",
        kind: "rig",
        status: "match",
        faceId: "face",
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [
          {
            nodeId: "out_1",
            path: "/unknown/output/path",
            status: "missing-target",
          },
        ],
      } as Awaited<ReturnType<typeof auditBundleGraphs>>[number],
    ]);

    const options = createOptions();
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).not.toHaveBeenCalled();
    expect(options.alertDialog).toHaveBeenCalledWith(
      'Export blocked: graph "face" has output path "/unknown/output/path" that does not map to a runtime target.',
    );
    hook.unmount();
  });

  it("ignores non-rig missing IR entries when checking export compatibility", async () => {
    mockedBuildRigGraphSpec.mockReturnValue({
      spec: { nodes: [{ id: "n1", type: "input" }] } as GraphSpec,
      summary: { faceId: "face", inputs: [], outputs: [], bindings: [] },
      issues: { fatal: [], warnings: [], info: [] },
      ir: { graph: { nodes: [{ id: "ir1" }] } },
    } as unknown as ReturnType<typeof buildRigGraphSpec>);
    mockedNormalizeGraphSpec.mockResolvedValue({
      nodes: [{ id: "n1", type: "input" }],
    } as GraphSpec);
    mockedPoseGraphService.validate.mockReturnValue([]);
    mockedAuditBundleGraphs.mockResolvedValue([
      {
        id: "face",
        kind: "rig",
        status: "match",
        faceId: "face",
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      } as Awaited<ReturnType<typeof auditBundleGraphs>>[number],
      {
        id: "face_pose_graph",
        kind: "pose-driver",
        status: "missing-ir",
        faceId: "face",
        diffCount: 0,
        diffLimitReached: false,
        issues: [],
        outputs: [],
      } as Awaited<ReturnType<typeof auditBundleGraphs>>[number],
    ]);

    const options = createOptions({
      poseRig: {
        poseGraphSpec: {
          nodes: [{ id: "pose1", type: "output" }],
        } as GraphSpec,
        poseGraphFileName: "face_pose_graph.json",
        poseConfigDraft: null,
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "average",
        crossGroupBlendMode: "additive",
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportGlb();
    });

    expect(mockedExportScene).toHaveBeenCalledTimes(1);
    expect(options.alertDialog).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("shows a dialog when pose graph build fails during pose export", async () => {
    mockedPoseGraphService.buildSpec.mockImplementation(() => {
      throw new Error("build failed");
    });

    const options = createOptions({
      alertDialog: vi.fn(),
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
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseGraphFile();
    });

    expect(options.alertDialog).toHaveBeenCalledWith(
      "Failed to build pose graph for export: build failed",
    );
    expect(mockedDownloadJsonFile).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("exports a neutral-only pose graph without validation errors", async () => {
    mockedPoseGraphService.buildSpec.mockReturnValue({
      spec: {
        nodes: [{ id: "pose_neutral_record", type: "constant" }],
      } as GraphSpec,
      summary: { inputs: [], outputs: [] },
    });
    mockedPoseGraphService.validate.mockReturnValue([
      "Pose graph does not contain any pose constant nodes.",
    ]);

    const options = createOptions({
      alertDialog: vi.fn(),
      poseRig: {
        poseGraphSpec: null,
        poseGraphFileName: "pose_graph.json",
        poseConfigDraft: {
          version: 1,
          faceId: "face",
          neutralInputs: { input_a: 0 },
          poses: [
            {
              id: "pose_1",
              name: "Pose 1",
              values: { input_a: 0.2 },
              createdAt: "2026-02-19T00:00:00.000Z",
              updatedAt: "2026-02-19T00:00:00.000Z",
            },
          ],
        },
        poseConfigFileName: "pose_config.json",
        importPoseConfig: vi.fn(),
        blendMode: "average" as const,
        crossGroupBlendMode: "additive" as const,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseGraphFile();
    });

    expect(mockedPoseGraphService.validate).not.toHaveBeenCalled();
    expect(options.alertDialog).not.toHaveBeenCalled();
    expect(mockedDownloadJsonFile).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("exports Pose IR using core export hooks when available", async () => {
    const exportPoseIrData = vi.fn().mockResolvedValue({
      version: 1,
      nodes: [{ id: "pose_ir_1" }],
    });
    const options = createOptions({
      poseRig: {
        ...createOptions().poseRig,
        poseIrFileName: "pose_ir_export",
        exportPoseIrData,
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseIrFile();
    });

    expect(exportPoseIrData).toHaveBeenCalledTimes(1);
    expect(mockedDownloadJsonFile).toHaveBeenCalledWith(
      { version: 1, nodes: [{ id: "pose_ir_1" }], faceId: "face" },
      "pose_ir_export.json",
    );
    hook.unmount();
  });

  it("exports Pose IR from draft data when core export hook is unavailable", async () => {
    const options = createOptions({
      poseRig: {
        ...createOptions().poseRig,
        poseIrDraft: { version: 1, nodes: [{ id: "draft_pose_ir" }] },
        poseIrFileName: "pose_ir_draft.json",
      },
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseIrFile();
    });

    expect(mockedDownloadJsonFile).toHaveBeenCalledWith(
      { version: 1, nodes: [{ id: "draft_pose_ir" }], faceId: "face" },
      "pose_ir_draft.json",
    );
    hook.unmount();
  });

  it("alerts when Pose IR export hooks are unavailable", async () => {
    const options = createOptions({
      alertDialog: vi.fn(),
    });
    const hook = renderHook(options);

    await act(async () => {
      await hook.result.current?.exportPoseIrFile();
    });

    expect(mockedDownloadJsonFile).not.toHaveBeenCalled();
    expect(options.alertDialog).toHaveBeenCalledWith(
      expect.stringContaining("Pose IR export is unavailable."),
    );
    hook.unmount();
  });

  it("imports Pose IR using core hooks when available", async () => {
    const importPoseIr = vi.fn().mockResolvedValue(undefined);
    const options = createOptions({
      poseRig: {
        ...createOptions().poseRig,
        importPoseIr,
      },
      alertDialog: vi.fn(),
    });
    const hook = renderHook(options);
    const file = new File(
      [JSON.stringify({ version: 1, nodes: [] })],
      "pose_ir.json",
      { type: "application/json" },
    );

    await act(async () => {
      await hook.result.current?.importPoseIrFile(file);
    });

    expect(importPoseIr).toHaveBeenCalledWith(file);
    expect(options.alertDialog).not.toHaveBeenCalled();
    hook.unmount();
  });

  it("alerts when Pose IR import hooks are unavailable", async () => {
    const options = createOptions({
      alertDialog: vi.fn(),
    });
    const hook = renderHook(options);
    const file = new File(
      [JSON.stringify({ version: 1, nodes: [] })],
      "pose_ir.json",
      { type: "application/json" },
    );

    await act(async () => {
      await hook.result.current?.importPoseIrFile(file);
    });

    expect(options.alertDialog).toHaveBeenCalledWith(
      expect.stringContaining("Pose IR import is unavailable."),
    );
    hook.unmount();
  });
});
