import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition } from "../poseRig/types";
import { PoseRigProvider } from "./PoseRigProvider";

const mockNormalizeGraphSpec = vi.fn(async (spec: unknown) => spec);

vi.mock("@vizij/node-graph-wasm", () => ({
  normalizeGraphSpec: (spec: unknown) => mockNormalizeGraphSpec(spec),
}));

type ManagedEntry = {
  input: StandardRigInput;
  source: "auto" | "preset" | "custom";
};

const bindingState = {
  standardInputs: [] as StandardRigInput[],
  standardInputsByPath: new Map<string, StandardRigInput>(),
  managedStandardInputs: [] as ManagedEntry[],
  inputValues: {} as Record<string, number>,
  standardInputSchema: null as { id: string; version: string } | null,
  handleInputValueChange: vi.fn(),
  applyStandardInputBatch: vi.fn(),
  handleCreateCustomStandardInput: vi.fn(),
  handleUpdateStandardInput: vi.fn(),
  handleDeleteCustomStandardInput: vi.fn(),
};

const rigUiState = {
  hiddenDriverIds: new Set<string>(),
};

const graphRuntimeState = {
  faceId: "robot",
};

const graphRuntimeStoreApi = {
  setState: vi.fn(),
};

const poseRigAuthoringState = {
  poses: [] as PoseDefinition[],
  poseGraphSpec: null,
  poseConfigDraft: null,
};

const usePoseRigAuthoringMock = vi.fn(
  (_args?: unknown) => poseRigAuthoringState as any,
);

vi.mock("./RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
  useRigUi: (selector: (state: typeof rigUiState) => unknown) =>
    selector(rigUiState),
  useGraphRuntime: (selector: (state: typeof graphRuntimeState) => unknown) =>
    selector(graphRuntimeState),
  useGraphRuntimeStoreApi: () => graphRuntimeStoreApi,
}));

vi.mock("../poseRig/usePoseRigAuthoring", () => ({
  usePoseRigAuthoring: (...args: unknown[]) => usePoseRigAuthoringMock(...args),
}));

function makeInput(
  id: string,
  path: string,
  overrides?: Partial<StandardRigInput>,
): StandardRigInput {
  return {
    id,
    path,
    label: id,
    group: "test",
    defaultValue: 0,
    range: { min: 0, max: 1 },
    ...overrides,
  };
}

function makePose(
  id: string,
  name: string,
  overrides?: Partial<PoseDefinition>,
): PoseDefinition {
  return {
    id,
    name,
    values: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("PoseRigProvider pose weight synchronization", () => {
  beforeEach(() => {
    bindingState.standardInputs = [];
    bindingState.standardInputsByPath = new Map();
    bindingState.managedStandardInputs = [];
    bindingState.inputValues = {};
    bindingState.standardInputSchema = null;
    bindingState.handleInputValueChange.mockReset();
    bindingState.applyStandardInputBatch.mockReset();
    bindingState.handleCreateCustomStandardInput.mockReset();
    bindingState.handleUpdateStandardInput.mockReset();
    bindingState.handleDeleteCustomStandardInput.mockReset();

    graphRuntimeState.faceId = "robot";
    graphRuntimeStoreApi.setState.mockReset();
    rigUiState.hiddenDriverIds = new Set();

    poseRigAuthoringState.poses = [];
    poseRigAuthoringState.poseGraphSpec = null;
    poseRigAuthoringState.poseConfigDraft = null;

    usePoseRigAuthoringMock.mockClear();
    mockNormalizeGraphSpec.mockClear();
  });

  it("creates canonical pose-weight inputs and excludes them from pose authoring channels", async () => {
    const regularInput = makeInput("jaw_open", "/autorig/robot/jaw/open");
    const existingPoseWeight = makeInput(
      "pose_smile_weight",
      "/poses/pose_smile.weight",
      {
        label: "Pose Weight - Smile",
        sourceId: "pose-weight:pose_smile",
      },
    );
    const createdFrownWeight = makeInput(
      "pose_frown_weight",
      "/poses/pose_frown.weight",
      {
        label: "Pose Weight - Frown",
        sourceId: "pose-weight:pose_frown",
      },
    );

    bindingState.standardInputs = [regularInput, existingPoseWeight];
    bindingState.standardInputsByPath = new Map([
      ["/autorig/robot/jaw/open", regularInput],
      ["/poses/pose_smile.weight", existingPoseWeight],
    ]);
    bindingState.managedStandardInputs = [
      { input: regularInput, source: "custom" },
      { input: existingPoseWeight, source: "custom" },
    ];
    bindingState.handleCreateCustomStandardInput.mockReturnValue(
      createdFrownWeight,
    );

    poseRigAuthoringState.poses = [makePose("pose_frown", "Frown")];

    render(
      <PoseRigProvider rootId="root">
        <div>child</div>
      </PoseRigProvider>,
    );

    await waitFor(() => {
      expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledWith(
        "/poses/pose_frown.weight",
      );
    });

    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdFrownWeight.id,
      {
        path: "/poses/pose_frown.weight",
        label: "Pose Weight - Frown",
        sourceId: "pose-weight:pose_frown",
        defaultValue: 0,
        range: { min: 0, max: 1 },
      },
    );

    expect(usePoseRigAuthoringMock.mock.calls.length).toBeGreaterThan(0);
    const usePoseRigAuthoringArgs = usePoseRigAuthoringMock.mock.calls.at(
      -1,
    )?.[0] as unknown as {
      standardInputs: StandardRigInput[];
    };
    expect(
      usePoseRigAuthoringArgs.standardInputs.map((input) => input.id),
    ).toEqual(["jaw_open"]);
  });

  it("removes stale and duplicate pose-weight custom inputs", async () => {
    const regularInput = makeInput("jaw_open", "/autorig/robot/jaw/open");
    const canonicalPoseWeight = makeInput(
      "pose_smile_weight",
      "/poses/pose_smile.weight",
      {
        label: "Pose Weight - Smile",
        sourceId: "pose-weight:pose_smile",
      },
    );
    const duplicatePoseWeight = makeInput(
      "pose_smile_weight_duplicate",
      "/poses/pose_smile.weight",
      {
        label: "duplicate",
        sourceId: undefined,
      },
    );
    const stalePoseWeight = makeInput(
      "pose_old_weight",
      "/poses/pose_old.weight",
      {
        label: "Pose Weight - Old",
        sourceId: "pose-weight:pose_old",
      },
    );
    const malformedPoseWeight = makeInput(
      "pose_smile_weight_suffix",
      "/poses/pose_smile.weight_2",
      {
        label: "Pose Weight - Smile (suffix)",
      },
    );

    bindingState.standardInputs = [regularInput, canonicalPoseWeight];
    bindingState.standardInputsByPath = new Map([
      ["/autorig/robot/jaw/open", regularInput],
      ["/poses/pose_smile.weight", canonicalPoseWeight],
    ]);
    bindingState.managedStandardInputs = [
      { input: regularInput, source: "custom" },
      { input: canonicalPoseWeight, source: "custom" },
      { input: duplicatePoseWeight, source: "custom" },
      { input: stalePoseWeight, source: "custom" },
      { input: malformedPoseWeight, source: "custom" },
    ];

    poseRigAuthoringState.poses = [makePose("pose_smile", "Smile")];

    render(
      <PoseRigProvider rootId="root">
        <div>child</div>
      </PoseRigProvider>,
    );

    await waitFor(() => {
      const deleted = new Set(
        bindingState.handleDeleteCustomStandardInput.mock.calls.map(
          ([id]) => id,
        ),
      );
      expect(deleted).toEqual(
        new Set([
          duplicatePoseWeight.id,
          stalePoseWeight.id,
          malformedPoseWeight.id,
        ]),
      );
    });

    expect(
      bindingState.handleDeleteCustomStandardInput,
    ).not.toHaveBeenCalledWith(canonicalPoseWeight.id);
    expect(bindingState.handleCreateCustomStandardInput).not.toHaveBeenCalled();
  });

  it("publishes pose graph payload to the graph runtime store", async () => {
    const regularInput = makeInput("jaw_open", "/autorig/robot/jaw/open");
    const poseGraphSpec = { nodes: [{ id: "pose_input", type: "input" }] };
    const poseConfigDraft = {
      version: 1,
      title: "Pose Test",
      rigKind: "face-specific" as const,
      faceId: "robot",
      neutralInputs: {},
      poses: [],
      poseGroups: [],
      standardInputSchema: null,
      blendStages: [],
      crossGroupBlendMode: "average" as const,
      neutralMode: "explicit" as const,
    };

    bindingState.standardInputs = [regularInput];
    bindingState.standardInputsByPath = new Map([
      [regularInput.path, regularInput],
    ]);
    bindingState.managedStandardInputs = [
      { input: regularInput, source: "custom" },
    ];

    poseRigAuthoringState.poses = [makePose("pose_smile", "Smile")];
    poseRigAuthoringState.poseGraphSpec = poseGraphSpec as any;
    poseRigAuthoringState.poseConfigDraft = poseConfigDraft as any;

    render(
      <PoseRigProvider rootId="root">
        <div>child</div>
      </PoseRigProvider>,
    );

    await waitFor(() => {
      expect(mockNormalizeGraphSpec).toHaveBeenCalledWith(poseGraphSpec);
      const updaters = graphRuntimeStoreApi.setState.mock.calls
        .map((call) => call[0] as unknown)
        .filter(
          (updater): updater is (state: any) => any =>
            typeof updater === "function",
        );

      expect(updaters.length).toBeGreaterThanOrEqual(2);

      const configPatch = updaters
        .map((updater) =>
          updater({
            poseConfig: null,
            poseGraphSpec: null,
            poseRuntimeRevision: 0,
          }),
        )
        .find((patch) => patch?.poseConfig === poseConfigDraft);
      expect(configPatch).toEqual({
        poseConfig: poseConfigDraft,
        poseRuntimeRevision: 1,
      });

      const graphPatch = updaters
        .map((updater) =>
          updater({
            poseConfig: poseConfigDraft,
            poseGraphSpec: null,
            poseRuntimeRevision: 1,
          }),
        )
        .find((patch) => patch?.poseGraphSpec === poseGraphSpec);
      expect(graphPatch).toEqual({
        poseGraphSpec,
        poseRuntimeRevision: 2,
      });
    });
  });
});
