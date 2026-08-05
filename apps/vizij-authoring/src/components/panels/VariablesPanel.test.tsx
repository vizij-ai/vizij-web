import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, PoseRigConfigFile } from "../../poseRig/types";
import { buildPoseWeightInputSourceId } from "../../poseRig/utils";
import type { BlendStageInspectorSelection } from "../../types/poseGroupInspector";
import type {
  ReferenceCatalog,
  ReferencePoseDefinition,
} from "../../referenceFace/types";
import { useEditorStore } from "../../motiongraph/store/useEditorStore";
import { useAnimationStore } from "../../state/animationStore";
import {
  VariablesPanel,
  filterTreeForActiveSurface,
  formatSurfaceLabelWithCount,
  resolveVisibleRootForActiveSurface,
} from "./VariablesPanel";

function normalizeCatalogPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
}

function makeReferenceCatalog(
  inputs: StandardRigInput[],
  links?: Array<{
    parentInputId: string;
    childInputId: string;
    linkId?: string;
    scale?: number;
    offset?: number;
    enabled?: boolean;
  }>,
  poses?: ReferencePoseDefinition[],
): ReferenceCatalog {
  const normalizedLinks = (links ?? []).map((link) => ({
    linkId: link.linkId ?? `${link.parentInputId}->${link.childInputId}`,
    parentInputId: link.parentInputId,
    childInputId: link.childInputId,
    scale: link.scale ?? 1,
    offset: link.offset ?? 0,
    enabled: link.enabled ?? true,
    source: "pipeline-link" as const,
  }));

  const inputsWithRelationships = inputs.map((input) => ({
    id: input.id,
    path: input.path,
    label: input.label,
    defaultValue: input.defaultValue,
    range: {
      min: input.range.min,
      max: input.range.max,
    },
    parents: normalizedLinks
      .filter((link) => link.childInputId === input.id)
      .map((link) => ({
        linkId: link.linkId,
        parentInputId: link.parentInputId,
        scale: link.scale,
        offset: link.offset,
        enabled: link.enabled,
      })),
    children: normalizedLinks
      .filter((link) => link.parentInputId === input.id)
      .map((link) => ({
        linkId: link.linkId,
        childInputId: link.childInputId,
        scale: link.scale,
        offset: link.offset,
        enabled: link.enabled,
      })),
  }));

  const inputsById = new Map(
    inputsWithRelationships.map((input) => [input.id, input]),
  );
  const inputsByPath = new Map<string, typeof inputsWithRelationships>();
  inputsWithRelationships.forEach((input) => {
    const key = normalizeCatalogPath(input.path);
    const existing = inputsByPath.get(key) ?? [];
    inputsByPath.set(key, [...existing, input]);
  });
  const catalogPoses = poses ?? [];

  return {
    inputs: inputsWithRelationships,
    inputsById,
    inputsByPath,
    pipelineLinks: normalizedLinks,
    poses: catalogPoses,
    posesById: new Map(catalogPoses.map((pose) => [pose.id, pose])),
  };
}

const poseRigState = {
  poses: [] as PoseDefinition[],
  neutralInputs: {} as Record<string, number>,
  applyPose: vi.fn(),
  selectPose: vi.fn(),
  selectedPoseId: null as string | null,
  createPose: vi.fn(),
  createPoseFromSnapshot: vi.fn(() => "pose_capture"),
  addPoseInput: vi.fn(),
  duplicatePose: vi.fn(),
  createPoseGroup: vi.fn(),
  renamePoseGroup: vi.fn(),
  deletePoseGroup: vi.fn(),
  deletePose: vi.fn(),
  replacePoseTargets: vi.fn(),
  updatePoseValue: vi.fn(),
  blendStages: [] as NonNullable<PoseRigConfigFile["blendStages"]>,
  createBlendStage: vi.fn(),
  renameBlendStage: vi.fn(),
  setBlendStageMode: vi.fn(),
  deleteBlendStage: vi.fn(),
  reorderBlendStage: vi.fn(),
  setBlendStageSources: vi.fn(),
  addPoseToGroup: vi.fn(),
  removePoseFromGroup: vi.fn(),
  updatePoseGroup: vi.fn(),
  setCrossGroupBlendMode: vi.fn(),
  crossGroupBlendMode: "additive" as const,
  blendMode: "average" as const,
  poseConfigDraft: null as PoseRigConfigFile | null,
};

const referenceFaceState = {
  file: { name: "ref.glb" } as File | null,
  setFile: vi.fn(),
  isLoaded: true,
  isLoading: false,
  standardInputs: [] as StandardRigInput[],
  standardInputsById: new Map<string, StandardRigInput>(),
  inputIdsWithBindings: new Set<string>(),
  bundle: null,
  referenceCatalog: makeReferenceCatalog([]),
  getReferenceCatalogInput: vi.fn(),
  getReferenceCatalogPose: vi.fn(),
  getReferenceCatalogLinksForInput: vi.fn(() => []),
  inputValues: {} as Record<string, number>,
  handleInputValueChange: vi.fn(),
  handleInputPathValueChange: vi.fn(),
  handleResetAllInputValues: vi.fn(),
  onStandardInputsReady: vi.fn(),
  onLoadingStateChange: vi.fn(),
  onAnimateValueReady: vi.fn(),
  onStandardInputChange: vi.fn(),
  onBundleReady: vi.fn(),
};

const bindingState = {
  managedStandardInputs: [] as Array<{
    input: StandardRigInput;
    source: "auto" | "preset" | "custom";
    metadata?: {
      elementType?: string;
      elementId?: string;
      componentId?: string;
    };
    disabled?: boolean;
  }>,
  lockedInspectorTargetIds: new Set<string>(),
  standardInputsByPath: new Map<string, StandardRigInput>(),
  standardInputsById: new Map<string, StandardRigInput>(),
  pipelineConfigByInputId: {} as Record<string, Record<string, unknown>>,
  inputValues: {} as Record<string, number>,
  bindings: {} as Record<string, unknown>,
  inputBindings: {} as Record<string, unknown>,
  handleInputValueChange: vi.fn(),
  applyInputBindingPatch: vi.fn(),
  applyStandardInputBatch: vi.fn(),
  handleCreateCustomStandardInput: vi.fn(),
  handleUpdateStandardInput: vi.fn(),
  handleDeleteCustomStandardInput: vi.fn(),
  handleCloneStandardInputs: vi.fn(() => new Map<string, string>()),
  handleLinkChildInput: vi.fn(),
};

const graphRuntimeState = {
  world: null,
  animatables: {},
  graphPlaybackState: "paused" as "playing" | "paused",
  setStoreState: vi.fn(),
};

const authoringUiState = {
  activeEditFocus: "default" as "default" | "pose-creation",
};

vi.mock("../../state/PoseRigProvider", () => ({
  usePoseRig: () => poseRigState,
}));

vi.mock("../../state/AuthoringUiProvider", () => ({
  useAuthoringUiState: () => authoringUiState,
}));

vi.mock("../../state/ReferenceFaceContext", () => ({
  useReferenceFace: () => referenceFaceState,
}));

vi.mock("../../state/RigControllerProvider", () => ({
  useBindingAuthoring: (selector: (state: typeof bindingState) => unknown) =>
    selector(bindingState),
  useGraphRuntime: (selector: (state: typeof graphRuntimeState) => unknown) =>
    selector(graphRuntimeState),
}));

vi.mock("../../scene/useSceneComposer", () => ({
  useSceneComposer: () => ({
    objects: [],
    getNode: () => null,
  }),
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
    range: { min: -1, max: 1 },
    ...overrides,
  };
}

describe("VariablesPanel", () => {
  beforeEach(() => {
    poseRigState.poses = [];
    poseRigState.neutralInputs = {};
    poseRigState.selectedPoseId = null;
    poseRigState.applyPose.mockReset();
    poseRigState.selectPose.mockReset();
    poseRigState.createPose.mockReset();
    poseRigState.createPoseFromSnapshot.mockReset();
    poseRigState.createPoseFromSnapshot.mockReturnValue("pose_capture");
    poseRigState.addPoseInput.mockReset();
    poseRigState.duplicatePose.mockReset();
    poseRigState.createPoseGroup.mockReset();
    poseRigState.renamePoseGroup.mockReset();
    poseRigState.deletePoseGroup.mockReset();
    poseRigState.deletePose.mockReset();
    poseRigState.replacePoseTargets.mockReset();
    poseRigState.updatePoseValue.mockReset();
    poseRigState.blendStages = [];
    poseRigState.createBlendStage.mockReset();
    poseRigState.renameBlendStage.mockReset();
    poseRigState.setBlendStageMode.mockReset();
    poseRigState.deleteBlendStage.mockReset();
    poseRigState.reorderBlendStage.mockReset();
    poseRigState.setBlendStageSources.mockReset();
    poseRigState.addPoseToGroup.mockReset();
    poseRigState.removePoseFromGroup.mockReset();
    poseRigState.updatePoseGroup.mockReset();
    poseRigState.setCrossGroupBlendMode.mockReset();
    poseRigState.poseConfigDraft = null;

    referenceFaceState.file = { name: "ref.glb" } as File;
    referenceFaceState.isLoaded = true;
    referenceFaceState.isLoading = false;
    referenceFaceState.standardInputs = [];
    referenceFaceState.standardInputsById = new Map();
    referenceFaceState.bundle = null;
    referenceFaceState.referenceCatalog = makeReferenceCatalog([]);
    referenceFaceState.inputValues = {};
    referenceFaceState.handleInputValueChange.mockReset();
    referenceFaceState.handleInputPathValueChange.mockReset();
    referenceFaceState.getReferenceCatalogInput.mockReset();
    referenceFaceState.getReferenceCatalogPose.mockReset();
    referenceFaceState.getReferenceCatalogLinksForInput.mockReset();
    referenceFaceState.getReferenceCatalogLinksForInput.mockReturnValue([]);

    bindingState.managedStandardInputs = [];
    bindingState.lockedInspectorTargetIds = new Set();
    bindingState.standardInputsByPath = new Map();
    bindingState.standardInputsById = new Map();
    bindingState.pipelineConfigByInputId = {};
    bindingState.inputValues = {};
    bindingState.bindings = {};
    bindingState.inputBindings = {};
    bindingState.handleInputValueChange.mockReset();
    bindingState.applyInputBindingPatch.mockReset();
    bindingState.applyStandardInputBatch.mockReset();
    bindingState.handleCreateCustomStandardInput.mockReset();
    bindingState.handleUpdateStandardInput.mockReset();
    bindingState.handleDeleteCustomStandardInput.mockReset();
    bindingState.handleCloneStandardInputs.mockReset();
    bindingState.handleLinkChildInput.mockReset();
    bindingState.handleCloneStandardInputs.mockImplementation(
      () => new Map<string, string>(),
    );
    authoringUiState.activeEditFocus = "default";

    useEditorStore.setState({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      enabledOutputs: new Set(),
      enabledInputs: new Set(),
      customInputPaths: [],
      plotActive: false,
    });
    graphRuntimeState.graphPlaybackState = "paused";
    useAnimationStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("surfaces shared variables when main and reference paths overlap", () => {
    const sharedMain = makeInput("main_jaw", "/standard/jaw/open", {
      label: "Jaw Open",
    });
    const sharedRef = makeInput("ref_jaw", "/standard/jaw/open", {
      label: "Jaw Open Ref",
    });
    bindingState.managedStandardInputs = [
      {
        input: sharedMain,
        source: "custom",
      },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/standard/jaw/open", sharedMain],
    ]);
    referenceFaceState.standardInputs = [sharedRef];
    referenceFaceState.standardInputsById = new Map([
      [sharedRef.id, sharedRef],
    ]);

    render(<VariablesPanel />);

    expect(screen.getByText(/Shared \(1\)/)).toBeTruthy();
  });

  it("renders Control Elements header with explicit per-surface count labels", () => {
    const view = render(
      <VariablesPanel
        availableSurfaces={["variables", "poses", "pose-groups", "inputs"]}
      />,
    );

    expect(within(view.container).getByText("Control Elements")).toBeTruthy();
    expect(within(view.container).getByText("Drivers (0)")).toBeTruthy();
    expect(within(view.container).getByText("Poses (0)")).toBeTruthy();
    expect(within(view.container).getByText("Pose Groups (0)")).toBeTruthy();
    expect(within(view.container).getByText("Inputs (0)")).toBeTruthy();
  });

  it("shows explicit variables context labels when reference face is available", () => {
    const view = render(
      <VariablesPanel
        availableSurfaces={["variables"]}
        activeSurfaceOverride="variables"
      />,
    );

    const contextRow = within(view.container)
      .getByText("Variables Context")
      .closest("div");
    expect(contextRow).toBeTruthy();
    const scoped = within(contextRow as HTMLElement);
    expect(scoped.getByText("Main Face")).toBeTruthy();
    expect(scoped.getByText("Shared")).toBeTruthy();
    expect(scoped.getByText("Reference Face")).toBeTruthy();
  });

  it("shows explicit poses context labels when reference face is available", () => {
    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    const contextRow = within(view.container)
      .getByText("Poses Context")
      .closest("div");
    expect(contextRow).toBeTruthy();
    const scoped = within(contextRow as HTMLElement);
    expect(scoped.getByText("Main Face")).toBeTruthy();
    expect(scoped.getByText("Reference Face")).toBeTruthy();
  });

  it("shows inputs context labels describing main-only inputs and where to compare", () => {
    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );

    const contextRow = within(view.container)
      .getByText("Inputs Context")
      .closest("div");
    expect(contextRow).toBeTruthy();
    const scoped = within(contextRow as HTMLElement);
    expect(scoped.getByText("Main Face Inputs Only")).toBeTruthy();
    expect(scoped.getByText("Compare in Variables/Poses")).toBeTruthy();
  });

  it("does not select an input when the slider hit area is clicked", () => {
    const input = makeInput("jaw_open", "/standard/jaw/open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [
      {
        input,
        source: "preset",
      },
    ];
    bindingState.standardInputsById = new Map([[input.id, input]]);
    bindingState.standardInputsByPath = new Map([[input.path, input]]);
    const onSelectRig = vi.fn();

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        onSelectRig={onSelectRig}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search inputs..."), {
      target: { value: "Jaw Open" },
    });
    const inputRow = screen.getByTitle("Jaw Open").closest('[role="button"]');
    expect(inputRow).toBeTruthy();
    const sliderRoot = inputRow?.querySelector('[class*="touch-none"]');
    expect(sliderRoot).toBeTruthy();
    fireEvent.click(sliderRoot as HTMLElement);

    expect(onSelectRig).not.toHaveBeenCalled();
  });

  it("saves the current input value onto the selected pose whenever a pose is selected", () => {
    const poseId = "pose_smile";
    const smileInput = makeInput("smile", "/smile", {
      label: "Smile",
      defaultValue: 0.1,
      range: { min: -1, max: 1 },
    });
    poseRigState.poses = [
      {
        id: poseId,
        name: "Smile Pose",
        values: {},
        group: null,
        groupId: null,
        groupIds: [],
        createdAt: "2026-03-08T00:00:00.000Z",
        updatedAt: "2026-03-08T00:00:00.000Z",
      },
    ];
    poseRigState.selectedPoseId = poseId;
    bindingState.managedStandardInputs = [
      {
        input: smileInput,
        source: "custom",
      },
    ];
    bindingState.standardInputsByPath = new Map([
      [smileInput.path, smileInput],
    ]);
    bindingState.standardInputsById = new Map([[smileInput.id, smileInput]]);
    bindingState.inputValues = { [smileInput.id]: 0.42 };
    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save Pose Target" }));

    expect(poseRigState.addPoseInput).toHaveBeenCalledWith(
      poseId,
      smileInput.id,
    );
    expect(poseRigState.updatePoseValue).toHaveBeenCalledWith(
      poseId,
      smileInput.id,
      0.42,
    );
  });

  it("resets inputs and solos the captured pose weight after capture", async () => {
    const existingPose: PoseDefinition = {
      id: "pose_existing",
      name: "Existing",
      values: {},
      createdAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
    };
    const capturedPose: PoseDefinition = {
      id: "pose_capture",
      name: "Captured",
      values: {},
      createdAt: "2026-03-08T00:00:00.000Z",
      updatedAt: "2026-03-08T00:00:00.000Z",
    };

    poseRigState.poses = [existingPose];
    poseRigState.neutralInputs = { smile: 0, brow_raise: 0 };
    poseRigState.createPoseFromSnapshot.mockReturnValue(capturedPose.id);
    bindingState.managedStandardInputs = [
      {
        input: makeInput(
          "pose_existing_weight",
          "/poses/pose_existing.weight",
          {
            label: "Pose Weight - Existing",
            sourceId: buildPoseWeightInputSourceId(existingPose.id),
          },
        ),
        source: "custom",
      },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );

    fireEvent.click(screen.getByTestId("variables-inputs-capture-current"));

    expect(poseRigState.createPoseFromSnapshot).toHaveBeenCalledTimes(1);
    expect(bindingState.applyStandardInputBatch).toHaveBeenNthCalledWith(1, {
      smile: 0,
      brow_raise: 0,
    });

    poseRigState.poses = [existingPose, capturedPose];
    bindingState.managedStandardInputs = [
      {
        input: makeInput(
          "pose_existing_weight",
          "/poses/pose_existing.weight",
          {
            label: "Pose Weight - Existing",
            sourceId: buildPoseWeightInputSourceId(existingPose.id),
          },
        ),
        source: "custom",
      },
      {
        input: makeInput("pose_capture_weight", "/poses/pose_capture.weight", {
          label: "Pose Weight - Captured",
          sourceId: buildPoseWeightInputSourceId(capturedPose.id),
        }),
        source: "custom",
      },
    ];

    view.rerender(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );

    await waitFor(() => {
      expect(bindingState.applyStandardInputBatch).toHaveBeenNthCalledWith(2, {
        pose_existing_weight: 0,
        pose_capture_weight: 1,
      });
    });
  });

  it("filters out /rig/element variables from the variables panel", () => {
    const metadataInput = makeInput("rig_jaw", "/rig/element/jaw/open", {
      label: "Rig Element Jaw",
    });
    bindingState.managedStandardInputs = [
      {
        input: metadataInput,
        source: "custom",
      },
    ];

    render(<VariablesPanel />);

    expect(screen.queryByText("Rig Element Jaw")).toBeNull();
  });

  it("applies min/default/max actions to reference drivers", () => {
    const referenceOnly = makeInput("ref_brow", "/standard/brow/up", {
      label: "Ref Brow Up",
      defaultValue: 0.42,
      range: { min: -0.25, max: 0.9 },
    });
    referenceFaceState.standardInputs = [referenceOnly];
    referenceFaceState.standardInputsById = new Map([
      [referenceOnly.id, referenceOnly],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([referenceOnly]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/brow/up" },
      },
    );

    fireEvent.click(screen.getByTitle("Set current value to min"));
    fireEvent.click(screen.getByTitle("Set current value to default"));
    fireEvent.click(screen.getByTitle("Set current value to max"));

    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(1, referenceOnly.path, referenceOnly.range.min);
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(
      2,
      referenceOnly.path,
      referenceOnly.defaultValue,
    );
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(3, referenceOnly.path, referenceOnly.range.max);
    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
    expect(bindingState.handleInputValueChange).not.toHaveBeenCalled();
  });

  it("excludes derived reference pose outputs from driver controls", () => {
    const referenceDriver = makeInput("ref_brow", "/standard/brow/up", {
      label: "Ref Brow Up",
    });
    const referenceGroupOutput = makeInput(
      "ref_pose_group_output",
      "/pose/groups/eyes.output",
      {
        label: "Ref Group Output",
      },
    );
    referenceFaceState.standardInputs = [referenceDriver, referenceGroupOutput];
    referenceFaceState.standardInputsById = new Map([
      [referenceDriver.id, referenceDriver],
      [referenceGroupOutput.id, referenceGroupOutput],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      referenceDriver,
      referenceGroupOutput,
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.click(within(view.container).getByText(/^Auto \(\d+\)$/));
    fireEvent.click(within(view.container).getByText(/^Preset \(\d+\)$/));
    fireEvent.click(within(view.container).getByText(/^Custom \(\d+\)$/));
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "brow" },
      },
    );

    expect(screen.getByText("standard/brow/up")).toBeTruthy();
    expect(screen.queryByText("pose/groups/eyes.output")).toBeNull();
  });

  it("applies min/default/max actions to shared drivers on both faces", () => {
    const mainShared = makeInput("main_jaw", "/standard/jaw/open", {
      label: "Main Jaw Open",
      defaultValue: 0.35,
      range: { min: -0.15, max: 0.8 },
    });
    const referenceShared = makeInput("ref_jaw", "/standard/jaw/open", {
      label: "Ref Jaw Open",
      defaultValue: 0.6,
      range: { min: -0.25, max: 1 },
    });

    bindingState.managedStandardInputs = [
      {
        input: mainShared,
        source: "custom",
      },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/standard/jaw/open", mainShared],
    ]);
    bindingState.standardInputsById = new Map([[mainShared.id, mainShared]]);
    referenceFaceState.standardInputs = [referenceShared];
    referenceFaceState.standardInputsById = new Map([
      [referenceShared.id, referenceShared],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      referenceShared,
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.click(within(view.container).getByText(/^Custom \(\d+\)$/));
    fireEvent.click(
      within(view.container).getByText(/^Reference Face \(\d+\)$/),
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/jaw/open" },
      },
    );

    fireEvent.click(screen.getByTitle("Set current value to min"));
    fireEvent.click(screen.getByTitle("Set current value to default"));
    fireEvent.click(screen.getByTitle("Set current value to max"));

    expect(bindingState.handleInputValueChange).toHaveBeenNthCalledWith(
      1,
      mainShared.id,
      mainShared.range.min,
    );
    expect(bindingState.handleInputValueChange).toHaveBeenNthCalledWith(
      2,
      mainShared.id,
      mainShared.defaultValue,
    );
    expect(bindingState.handleInputValueChange).toHaveBeenNthCalledWith(
      3,
      mainShared.id,
      mainShared.range.max,
    );

    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(1, referenceShared.path, mainShared.range.min);
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(2, referenceShared.path, mainShared.defaultValue);
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(3, referenceShared.path, mainShared.range.max);
    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
  });

  it("opens the variable copy modal from row copy action", () => {
    const referenceOnly = makeInput("ref_brow", "/standard/brow/up", {
      label: "Brow Up",
    });
    referenceFaceState.standardInputs = [referenceOnly];
    referenceFaceState.standardInputsById = new Map([
      [referenceOnly.id, referenceOnly],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([referenceOnly]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/brow/up" },
      },
    );

    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );

    expect(screen.getAllByText("Variable Copy Mapping").length).toBeGreaterThan(
      0,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);
  });

  it("does not write when variable copy modal is cancelled", () => {
    const referenceOnly = makeInput("ref_brow", "/standard/brow/up", {
      label: "Brow Up",
      defaultValue: 0.25,
      range: { min: 0, max: 1 },
      sourceId: "legacy_ref_brow",
    });
    referenceFaceState.standardInputs = [referenceOnly];
    referenceFaceState.standardInputsById = new Map([
      [referenceOnly.id, referenceOnly],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([referenceOnly]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/brow/up" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );
    expect(screen.getAllByText("Variable Copy Mapping").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);

    expect(bindingState.handleCreateCustomStandardInput).not.toHaveBeenCalled();
    expect(bindingState.handleUpdateStandardInput).not.toHaveBeenCalled();
    expect(bindingState.handleLinkChildInput).not.toHaveBeenCalled();
  });

  it("commits variable copy writes only after confirm", () => {
    const sourceParent = makeInput("ref_parent", "/standard/parent", {
      label: "Parent",
    });
    const source = makeInput("ref_source", "/standard/source", {
      label: "Source",
      defaultValue: 0.35,
      range: { min: 0, max: 1 },
      sourceId: "legacy_ref_source",
    });
    const sourceChild = makeInput("ref_child", "/standard/child", {
      label: "Child",
    });
    const destinationParent = makeInput("main_parent", "/standard/parent", {
      label: "Main Parent",
    });
    const destinationChild = makeInput("main_child", "/standard/child", {
      label: "Main Child",
    });
    const created = makeInput("main_source", "/standard/source", {
      label: "Source",
      defaultValue: 0.35,
      range: { min: 0, max: 1 },
      sourceId: "legacy_ref_source",
    });

    referenceFaceState.standardInputs = [source];
    referenceFaceState.standardInputsById = new Map([[source.id, source]]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceParent, source, sourceChild],
      [
        {
          parentInputId: sourceParent.id,
          childInputId: source.id,
          scale: 0.5,
          offset: 0.1,
        },
        {
          parentInputId: source.id,
          childInputId: sourceChild.id,
          scale: 0.8,
          offset: -0.2,
        },
      ],
    );

    bindingState.managedStandardInputs = [
      { input: destinationParent, source: "custom" },
      { input: destinationChild, source: "custom" },
    ];
    bindingState.standardInputsByPath = new Map([
      [destinationParent.path, destinationParent],
      [destinationChild.path, destinationChild],
    ]);
    bindingState.standardInputsById = new Map([
      [destinationParent.id, destinationParent],
      [destinationChild.id, destinationChild],
    ]);
    bindingState.handleCreateCustomStandardInput.mockReturnValue(created);
    bindingState.applyInputBindingPatch.mockImplementation((updater) => {
      bindingState.inputBindings = updater(
        bindingState.inputBindings as any,
      ) as typeof bindingState.inputBindings;
    });

    const onSelectRig = vi.fn();
    const view = render(<VariablesPanel onSelectRig={onSelectRig} />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/source" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledWith(
      "/standard/source",
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      created.id,
      {
        label: source.label,
        sourceId: source.sourceId,
        defaultValue: source.defaultValue,
        range: source.range,
      },
    );
    expect(bindingState.handleLinkChildInput).toHaveBeenCalledWith(
      destinationParent.id,
      created.id,
    );
    expect(bindingState.handleLinkChildInput).toHaveBeenCalledWith(
      created.id,
      destinationChild.id,
    );

    const createdBinding = bindingState.inputBindings[created.id] as
      | {
          expression?: string;
          slots?: Array<{ inputId?: string | null }>;
          metadata?: {
            vizij?: {
              pipelineV1?: {
                directInput?: {
                  enabled?: boolean;
                };
                override?: {
                  enabled?: boolean;
                };
                clamp?: {
                  enabled?: boolean;
                };
                migration?: {
                  status?: string;
                };
                links?: Record<
                  string,
                  {
                    parentInputId?: string;
                    childInputId?: string;
                    scale?: number;
                    offset?: number;
                  }
                >;
              };
            };
          };
        }
      | undefined;
    const destinationChildBinding = bindingState.inputBindings[
      destinationChild.id
    ] as typeof createdBinding;

    expect(
      createdBinding?.slots?.some(
        (slot) => slot.inputId === destinationParent.id,
      ),
    ).toBe(true);
    expect(
      destinationChildBinding?.slots?.some(
        (slot) => slot.inputId === created.id,
      ),
    ).toBe(true);
    expect((createdBinding?.expression ?? "").toLowerCase()).toContain("s2");
    expect(
      Object.values(createdBinding?.metadata?.vizij?.pipelineV1?.links ?? {}),
    ).toContainEqual(
      expect.objectContaining({
        parentInputId: destinationParent.id,
        childInputId: created.id,
        scale: 0.5,
        offset: 0.1,
      }),
    );
    expect(
      Object.values(
        destinationChildBinding?.metadata?.vizij?.pipelineV1?.links ?? {},
      ),
    ).toContainEqual(
      expect.objectContaining({
        parentInputId: created.id,
        childInputId: destinationChild.id,
        scale: 0.8,
        offset: -0.2,
      }),
    );
    expect(
      createdBinding?.metadata?.vizij?.pipelineV1?.directInput?.enabled,
    ).toBe(true);
    expect(createdBinding?.metadata?.vizij?.pipelineV1?.override?.enabled).toBe(
      false,
    );
    expect(createdBinding?.metadata?.vizij?.pipelineV1?.clamp?.enabled).toBe(
      true,
    );
    expect(createdBinding?.metadata?.vizij?.pipelineV1?.migration?.status).toBe(
      "migrated",
    );
    expect(onSelectRig).toHaveBeenCalledWith(created.id);
  });

  it("allows choosing current destination default value when copying a variable", () => {
    const source = makeInput("ref_brow", "/standard/brow/up", {
      label: "Brow Up",
      defaultValue: 0.35,
      range: { min: 0, max: 1 },
    });
    const destination = makeInput("main_brow", "/standard/brow/up", {
      label: "Main Brow Up",
      defaultValue: 0.88,
      range: { min: -0.2, max: 0.9 },
    });

    referenceFaceState.standardInputs = [source];
    referenceFaceState.standardInputsById = new Map([[source.id, source]]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([source]);

    bindingState.managedStandardInputs = [
      { input: destination, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([[destination.id, destination]]);
    bindingState.standardInputsByPath = new Map([
      [destination.path, destination],
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/brow/up" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use current default/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(bindingState.handleCreateCustomStandardInput).not.toHaveBeenCalled();
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      destination.id,
      expect.objectContaining({
        defaultValue: destination.defaultValue,
      }),
    );
  });

  it("bulk copies selected reference drivers and queues unresolved items for modal confirmation", () => {
    const sourceA = makeInput("ref_a", "/standard/a", {
      label: "Ref A",
      defaultValue: 0.2,
    });
    const sourceB = makeInput("ref_b", "/standard/b", {
      label: "Ref B",
      defaultValue: 0.3,
    });
    const sourceC = makeInput("ref_c", "/standard/c", {
      label: "Ref C",
      defaultValue: 0.4,
    });
    const destinationA = makeInput("main_a", "/standard/a", {
      label: "Main A",
      defaultValue: 0.9,
    });
    const createdB = makeInput("main_b", "/standard/b", {
      label: "Ref B",
      defaultValue: 0.3,
    });
    const createdC = makeInput("main_c", "/standard/c", {
      label: "Ref C",
      defaultValue: 0.4,
    });

    referenceFaceState.standardInputs = [sourceA, sourceB, sourceC];
    referenceFaceState.standardInputsById = new Map([
      [sourceA.id, sourceA],
      [sourceB.id, sourceB],
      [sourceC.id, sourceC],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      sourceA,
      sourceB,
      sourceC,
    ]);

    bindingState.managedStandardInputs = [
      { input: destinationA, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [destinationA.id, destinationA],
    ]);
    bindingState.standardInputsByPath = new Map([
      [destinationA.path, destinationA],
    ]);
    bindingState.handleCreateCustomStandardInput
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => createdB)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => createdC);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/" },
      },
    );
    screen
      .getAllByRole("checkbox", { name: "Bulk" })
      .forEach((checkbox) => fireEvent.click(checkbox));

    fireEvent.click(screen.getByRole("button", { name: "Copy Ref (3)" }));
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      destinationA.id,
      expect.objectContaining({
        defaultValue: sourceA.defaultValue,
      }),
    );
    expect(screen.getAllByText("Variable Copy Mapping").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));
    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledTimes(
      3,
    );
    expect(screen.getAllByText("Variable Copy Mapping").length).toBeGreaterThan(
      0,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));
    expect(screen.queryByText("Variable Copy Mapping")).toBeNull();
    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledTimes(
      4,
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdB.id,
      expect.objectContaining({
        defaultValue: sourceB.defaultValue,
      }),
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdC.id,
      expect.objectContaining({
        defaultValue: sourceC.defaultValue,
      }),
    );
  });

  it("allows bulk-selecting an entire driver folder for reference copy", () => {
    const sourceA = makeInput("ref_folder_a", "/standard/folder/a", {
      label: "Ref Folder A",
    });
    const sourceB = makeInput("ref_folder_b", "/standard/folder/b", {
      label: "Ref Folder B",
    });
    referenceFaceState.standardInputs = [sourceA, sourceB];
    referenceFaceState.standardInputsById = new Map([
      [sourceA.id, sourceA],
      [sourceB.id, sourceB],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      sourceA,
      sourceB,
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/folder/" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle(
        "Select all reference/shared drivers in this folder for bulk copy",
      ),
    );

    expect(screen.getByRole("button", { name: "Copy Ref (2)" })).toBeTruthy();
  });

  it("bulk copy processes the final selected driver against fresh state", () => {
    const sourceFirst = makeInput("ref_shared_first", "/standard/shared", {
      label: "Ref Shared First",
      defaultValue: 0.2,
    });
    const sourceSecond = makeInput("ref_shared_second", "/standard/shared", {
      label: "Ref Shared Second",
      defaultValue: 0.7,
    });
    const createdShared = makeInput("main_shared", "/standard/shared", {
      label: "Ref Shared First",
      defaultValue: 0.2,
    });

    referenceFaceState.standardInputs = [sourceFirst, sourceSecond];
    referenceFaceState.standardInputsById = new Map([
      [sourceFirst.id, sourceFirst],
      [sourceSecond.id, sourceSecond],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      sourceFirst,
      sourceSecond,
    ]);

    bindingState.managedStandardInputs = [];
    bindingState.standardInputsById = new Map();
    bindingState.standardInputsByPath = new Map();
    bindingState.handleCreateCustomStandardInput.mockImplementation((path) => {
      if (path !== createdShared.path) {
        return undefined;
      }
      if (bindingState.standardInputsByPath.has(path)) {
        return undefined;
      }
      bindingState.managedStandardInputs = [
        ...bindingState.managedStandardInputs,
        { input: createdShared, source: "custom" },
      ];
      bindingState.standardInputsById.set(createdShared.id, createdShared);
      bindingState.standardInputsByPath.set(createdShared.path, createdShared);
      return createdShared;
    });

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/" },
      },
    );
    screen
      .getAllByRole("checkbox", { name: "Bulk" })
      .forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "Copy Ref (2)" }));

    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledTimes(
      1,
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdShared.id,
      expect.objectContaining({
        defaultValue: sourceFirst.defaultValue,
      }),
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdShared.id,
      expect.objectContaining({
        defaultValue: sourceSecond.defaultValue,
      }),
    );
    expect(screen.queryByText("Variable Copy Mapping")).toBeNull();
  });

  it("bulk copy reuses a destination created earlier in the same queue run", () => {
    const sourceFirst = makeInput("ref_shared_first", "/standard/shared", {
      label: "Ref Shared First",
      defaultValue: 0.2,
    });
    const sourceSecond = makeInput("ref_shared_second", "/standard/shared", {
      label: "Ref Shared Second",
      defaultValue: 0.7,
    });
    const createdShared = makeInput("main_shared", "/standard/shared", {
      label: "Ref Shared First",
      defaultValue: 0.2,
    });

    referenceFaceState.standardInputs = [sourceFirst, sourceSecond];
    referenceFaceState.standardInputsById = new Map([
      [sourceFirst.id, sourceFirst],
      [sourceSecond.id, sourceSecond],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      sourceFirst,
      sourceSecond,
    ]);

    bindingState.managedStandardInputs = [];
    bindingState.standardInputsById = new Map();
    bindingState.standardInputsByPath = new Map();
    bindingState.handleCreateCustomStandardInput.mockImplementation((path) => {
      if (path !== createdShared.path) {
        return undefined;
      }
      if (bindingState.standardInputsByPath.has(path)) {
        return undefined;
      }
      // Simulate a lagging catalog snapshot: the path/index updates immediately,
      // but managedStandardInputs does not refresh before the next queued item.
      bindingState.standardInputsById.set(createdShared.id, createdShared);
      bindingState.standardInputsByPath.set(createdShared.path, createdShared);
      return createdShared;
    });

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/" },
      },
    );
    screen
      .getAllByRole("checkbox", { name: "Bulk" })
      .forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "Copy Ref (2)" }));

    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledTimes(
      1,
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdShared.id,
      expect.objectContaining({
        defaultValue: sourceFirst.defaultValue,
      }),
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      createdShared.id,
      expect.objectContaining({
        defaultValue: sourceSecond.defaultValue,
      }),
    );
    expect(screen.queryByText("Variable Copy Mapping")).toBeNull();
  });

  it("bulk copy re-resolves relationship mappings against current main-face state before confirm", () => {
    const sourceParent = makeInput("ref_brow_up", "/standard/brow/up", {
      label: "Ref Brow Up",
    });
    const sourceChild = makeInput("ref_blink", "/standard/eyes/blink", {
      label: "Ref Blink",
      defaultValue: 0.4,
    });
    const destinationParent = makeInput("main_brow_up", "/standard/brow/up", {
      label: "Main Brow Up",
    });
    const createdChild = makeInput("main_blink", "/standard/eyes/blink", {
      label: "Ref Blink",
      defaultValue: 0.4,
    });

    referenceFaceState.standardInputs = [sourceParent, sourceChild];
    referenceFaceState.standardInputsById = new Map([
      [sourceParent.id, sourceParent],
      [sourceChild.id, sourceChild],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceParent, sourceChild],
      [
        {
          parentInputId: sourceParent.id,
          childInputId: sourceChild.id,
        },
      ],
    );

    bindingState.handleCreateCustomStandardInput.mockImplementation((path) => {
      return path === createdChild.path ? createdChild : null;
    });

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/eyes/blink" },
      },
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Bulk" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Ref (1)" }));

    expect(screen.getByText("Variable Copy Mapping")).toBeTruthy();

    bindingState.standardInputsById.set(
      destinationParent.id,
      destinationParent,
    );
    bindingState.standardInputsByPath.set(
      destinationParent.path,
      destinationParent,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(screen.queryByText("Variable Copy Mapping")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(bindingState.handleLinkChildInput).toHaveBeenCalledWith(
      destinationParent.id,
      createdChild.id,
    );
  });

  it("bulk pose copy processes the final selected pose against fresh state", () => {
    const sourceSmile = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const destinationSmile = makeInput("main_smile", "/standard/mouth/smile", {
      label: "Main Smile",
    });
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceSmile],
      [],
      [
        {
          id: "ref_pose_shared_a",
          name: "Ref Shared",
          targets: [{ inputId: sourceSmile.id, value: 0.25 }],
        },
        {
          id: "ref_pose_shared_b",
          name: "Ref Shared",
          targets: [{ inputId: sourceSmile.id, value: 0.75 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationSmile, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [destinationSmile.id, destinationSmile],
    ]);
    bindingState.standardInputsByPath = new Map([
      [destinationSmile.path, destinationSmile],
    ]);

    let lastCreatedPoseName: string | null = null;
    poseRigState.createPose.mockImplementation((name?: string) => {
      lastCreatedPoseName = typeof name === "string" ? name : null;
    });
    poseRigState.updatePoseGroup.mockImplementation((poseId: string) => {
      poseRigState.poses = [
        ...poseRigState.poses,
        {
          id: poseId,
          name: lastCreatedPoseName ?? poseId,
          description: "",
          group: null,
          values: {},
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
    });

    render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );
    screen
      .getAllByRole("checkbox", { name: "Bulk" })
      .forEach((checkbox) => fireEvent.click(checkbox));
    fireEvent.click(screen.getByRole("button", { name: "Copy Ref Pose (2)" }));

    expect(screen.getAllByText("Pose Copy Mapping").length).toBeGreaterThan(0);
    expect(poseRigState.createPose).toHaveBeenCalledTimes(1);
    expect(poseRigState.createPose).toHaveBeenNthCalledWith(1, "Ref Shared");
    expect(poseRigState.updatePoseGroup).toHaveBeenCalledTimes(1);
    const firstCreatedPoseId = poseRigState.updatePoseGroup.mock.calls[0]?.[0];
    expect(poseRigState.updatePoseValue).toHaveBeenCalledWith(
      firstCreatedPoseId,
      destinationSmile.id,
      0.25,
    );
    fireEvent.click(screen.getByRole("button", { name: "Overwrite Pose" }));

    expect(poseRigState.replacePoseTargets).toHaveBeenCalledWith(
      firstCreatedPoseId,
      { [destinationSmile.id]: 0.75 },
    );
  });

  it("surfaces reference child mappings from runtime bindings when bundle links are missing", () => {
    const source = makeInput("ref_blink", "/standard/eyes/blink", {
      label: "Blink",
    });
    const sourcePropsChild = makeInput(
      "ref_props_child",
      "/propsrig/left_eye/lid_lower",
      {
        label: "Ref Child Prop",
        parentBinding: {
          inputId: source.id,
          slots: [
            {
              id: "slot_parent",
              alias: "parent",
              inputId: source.id,
            },
          ],
          expression: "parent",
        },
      },
    );
    const destinationSource = makeInput("main_blink", "/standard/eyes/blink", {
      label: "Main Blink",
    });
    const destinationPropsChild = makeInput(
      "main_props_child",
      "/propsrig/left_eye/lid_lower",
      {
        label: "Main Child Prop",
        defaultValue: 0.42,
      },
    );

    referenceFaceState.standardInputs = [source, sourcePropsChild];
    referenceFaceState.standardInputsById = new Map([
      [source.id, source],
      [sourcePropsChild.id, sourcePropsChild],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      source,
      sourcePropsChild,
    ]);

    bindingState.managedStandardInputs = [
      { input: destinationSource, source: "custom" },
      { input: destinationPropsChild, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [destinationSource.id, destinationSource],
      [destinationPropsChild.id, destinationPropsChild],
    ]);
    bindingState.standardInputsByPath = new Map([
      [destinationSource.path, destinationSource],
      [destinationPropsChild.path, destinationPropsChild],
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/eyes/blink" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );

    expect(screen.getAllByText("Variable Copy Mapping").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText(/Ref Child Prop/)).toBeTruthy();
  });

  it("uses pipeline config parent links to resolve destination child mappings", () => {
    const source = makeInput("ref_blink", "/standard/eyes/blink", {
      label: "Blink",
    });
    const sourcePropsChild = makeInput(
      "ref_props_child",
      "/propsrig/left_eye/lid_lower",
      {
        label: "Ref Child Prop",
        parentBinding: {
          inputId: source.id,
          slots: [
            {
              id: "slot_parent",
              alias: "parent",
              inputId: source.id,
            },
          ],
          expression: "parent",
        },
      },
    );
    const destinationSource = makeInput("main_blink", "/standard/eyes/blink", {
      label: "Main Blink",
    });
    const destinationPropsChild = makeInput(
      "main_props_child",
      "/propsrig/left_eye/lid_lower",
      {
        label: "Main Child Prop",
        defaultValue: 0.42,
      },
    );

    referenceFaceState.standardInputs = [source, sourcePropsChild];
    referenceFaceState.standardInputsById = new Map([
      [source.id, source],
      [sourcePropsChild.id, sourcePropsChild],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog([
      source,
      sourcePropsChild,
    ]);

    bindingState.managedStandardInputs = [
      { input: destinationSource, source: "custom" },
      { input: destinationPropsChild, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [destinationSource.id, destinationSource],
      [destinationPropsChild.id, destinationPropsChild],
    ]);
    bindingState.standardInputsByPath = new Map([
      [destinationSource.path, destinationSource],
      [destinationPropsChild.path, destinationPropsChild],
    ]);
    bindingState.inputBindings = {};
    bindingState.pipelineConfigByInputId = {
      [destinationPropsChild.id]: {
        inputId: destinationPropsChild.id,
        parents: [
          {
            linkId: `${destinationSource.id}->${destinationPropsChild.id}`,
            inputId: destinationSource.id,
          },
        ],
      },
    };

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/eyes/blink" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );

    expect(screen.getByText(/Ref Child Prop/)).toBeTruthy();
    expect(screen.getByText(/Use current scale \(1.000\)/)).toBeTruthy();
    expect(screen.getByText(/Use current offset \(0.420\)/)).toBeTruthy();
  });

  it("defaults mapping rows to apply and auto-maps unique fuzzy destination matches", () => {
    const source = makeInput("ref_source", "/standard/eyes/blink", {
      label: "Blink",
    });
    const sourceChild = makeInput("ref_child", "/propsrig/eye/lid_lower", {
      label: "Ref Child",
    });
    const destinationSource = makeInput("main_source", "/standard/eyes/blink", {
      label: "Main Blink",
    });
    const destinationChild = makeInput(
      "main_child",
      "/avatar/propsrig/eye/lid_lower",
      {
        label: "Main Child",
      },
    );

    referenceFaceState.standardInputs = [source, sourceChild];
    referenceFaceState.standardInputsById = new Map([
      [source.id, source],
      [sourceChild.id, sourceChild],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [source, sourceChild],
      [
        {
          parentInputId: source.id,
          childInputId: sourceChild.id,
        },
      ],
    );

    bindingState.managedStandardInputs = [
      { input: destinationSource, source: "custom" },
      { input: destinationChild, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [destinationSource.id, destinationSource],
      [destinationChild.id, destinationChild],
    ]);
    bindingState.standardInputsByPath = new Map([
      [destinationSource.path, destinationSource],
      [destinationChild.path, destinationChild],
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/eyes/blink" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );

    const applyCheckboxes = screen.getAllByRole("checkbox");
    expect(applyCheckboxes.length).toBeGreaterThan(0);
    applyCheckboxes.forEach((checkbox) => {
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Match Source Path" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(bindingState.handleLinkChildInput).toHaveBeenCalledWith(
      destinationSource.id,
      destinationChild.id,
    );
  });

  it("prefers the path-matched reference source with relationships when catalog ids differ", () => {
    const runtimeBlink = makeInput(
      "ref_runtime_blink",
      "/standard/eyes/blink",
      {
        label: "Blink",
      },
    );
    const catalogBlinkNoLinks = makeInput(
      "ref_catalog_blink_a",
      "/standard/eyes/blink",
      {
        label: "Blink (A)",
      },
    );
    const catalogBlinkWithLinks = makeInput(
      "ref_catalog_blink_b",
      "/standard/eyes/blink",
      {
        label: "Blink",
      },
    );
    const catalogChild = makeInput("ref_catalog_child", "/propsrig/eye/lid", {
      label: "Reference Child",
    });
    const destinationBlink = makeInput("main_blink", "/standard/eyes/blink", {
      label: "Main Blink",
    });
    const destinationChild = makeInput("main_child", "/propsrig/eye/lid", {
      label: "Main Child",
    });

    referenceFaceState.standardInputs = [runtimeBlink];
    referenceFaceState.standardInputsById = new Map([
      [runtimeBlink.id, runtimeBlink],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [catalogBlinkNoLinks, catalogBlinkWithLinks, catalogChild],
      [
        {
          parentInputId: catalogBlinkWithLinks.id,
          childInputId: catalogChild.id,
        },
      ],
    );

    bindingState.managedStandardInputs = [
      { input: destinationBlink, source: "custom" },
      { input: destinationChild, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [destinationBlink.id, destinationBlink],
      [destinationChild.id, destinationChild],
    ]);
    bindingState.standardInputsByPath = new Map([
      [destinationBlink.path, destinationBlink],
      [destinationChild.path, destinationChild],
    ]);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/eyes/blink" },
      },
    );
    fireEvent.click(
      within(view.container).getByTitle("Copy driver to main face"),
    );

    expect(screen.getByText(/Reference Child/)).toBeTruthy();
  });

  it("surfaces reference poses and opens the pose copy modal from row copy action", () => {
    const sourceInput = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const destinationInput = makeInput("main_smile", "/standard/mouth/smile", {
      label: "Main Smile",
    });
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceInput],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          targets: [{ inputId: sourceInput.id, value: 0.7 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationInput, source: "custom" },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Smile" },
      },
    );
    fireEvent.click(
      within(view.container).getAllByTitle("Copy pose to main face")[0]!,
    );

    expect(screen.getAllByText("Pose Copy Mapping").length).toBeGreaterThan(0);
  });

  it("groups reference poses by folder metadata and supports folder bulk-select", () => {
    const sourceInput = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceInput],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          group: "emotion/upper",
          targets: [{ inputId: sourceInput.id, value: 0.7 }],
        },
        {
          id: "ref_pose_frown",
          name: "Ref Frown",
          group: "emotion/upper",
          targets: [{ inputId: sourceInput.id, value: 0.2 }],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(
      within(view.container).getByTitle(
        "Select all reference poses in this folder for bulk copy",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Copy Ref Pose (2)" }),
    ).toBeTruthy();
  });

  it("renders shared poses as a single row in the poses tree", () => {
    poseRigState.poses = [
      {
        id: "pose_shared_smile",
        name: "Shared Smile",
        group: "emotion/upper",
        values: {},
        createdAt: "now",
        updatedAt: "now",
      },
    ];
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [],
      [],
      [
        {
          id: "pose_shared_smile",
          name: "Shared Smile",
          group: "emotion/upper",
          targets: [],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Shared Smile" },
      },
    );

    expect(within(view.container).getAllByTitle("Shared Smile")).toHaveLength(
      1,
    );
  });

  it("selects reference poses for inspector routing", () => {
    const sourceInput = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceInput],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          targets: [{ inputId: sourceInput.id, value: 0.7 }],
        },
      ],
    );
    const onSelectPose = vi.fn();

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
        onSelectPose={onSelectPose}
      />,
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Smile" },
      },
    );

    fireEvent.click(within(view.container).getByTitle("Ref Smile"));
    expect(onSelectPose).toHaveBeenCalledWith("ref_pose_smile");
  });

  it("plays and resets reference poses on the reference face runtime", () => {
    const referenceInput = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Ref Smile",
      defaultValue: 0.12,
      range: { min: 0, max: 1 },
    });
    referenceFaceState.standardInputs = [referenceInput];
    referenceFaceState.standardInputsById = new Map([
      [referenceInput.id, referenceInput],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [referenceInput],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile Pose",
          targets: [{ inputId: referenceInput.id, value: 0.76 }],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Smile Pose" },
      },
    );

    fireEvent.click(screen.getByTitle("Apply Pose"));
    fireEvent.click(screen.getByTitle("Reset pose targets to defaults"));

    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(1, "/poses/ref_pose_smile.weight", 1);
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(2, "/poses/ref_pose_smile.weight", 0);
    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
    expect(poseRigState.applyPose).not.toHaveBeenCalled();
  });

  it("routes reference pose play and reset through canonical pose-weight inputs when available", () => {
    const smileWeightInput = makeInput(
      "ref_pose_smile_weight",
      "/poses/ref_pose_smile.weight",
      {
        sourceId: "pose-weight:ref_pose_smile",
        defaultValue: 0.25,
        range: { min: 0, max: 1 },
      },
    );
    const frownWeightInput = makeInput(
      "ref_pose_frown_weight",
      "/poses/ref_pose_frown.weight",
      {
        sourceId: "pose-weight:ref_pose_frown",
        defaultValue: 0.1,
        range: { min: 0, max: 1 },
      },
    );
    referenceFaceState.standardInputs = [smileWeightInput, frownWeightInput];
    referenceFaceState.standardInputsById = new Map([
      [smileWeightInput.id, smileWeightInput],
      [frownWeightInput.id, frownWeightInput],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [smileWeightInput, frownWeightInput],
      [],
      [
        {
          id: "ref_pose_frown",
          name: "Ref Frown Pose",
          targets: [{ inputId: "legacy_missing_frown_target", value: 0.42 }],
        },
        {
          id: "ref_pose_smile",
          name: "Ref Smile Pose",
          targets: [{ inputId: "legacy_missing_smile_target", value: 0.76 }],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Smile Pose" },
      },
    );

    fireEvent.click(screen.getByTitle("Apply Pose"));
    fireEvent.click(screen.getByTitle("Reset pose targets to defaults"));

    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(1, frownWeightInput.path, 0);
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(2, smileWeightInput.path, 1);
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).toHaveBeenNthCalledWith(
      3,
      smileWeightInput.path,
      smileWeightInput.defaultValue,
    );
    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
    expect(poseRigState.applyPose).not.toHaveBeenCalled();
  });

  it("routes reference pose play through canonical pose-weight paths when runtime pose-weight ids are unavailable", () => {
    const smileWeightCatalogInput = makeInput(
      "poses_ref_pose_smile.weight",
      "/poses/ref_pose_smile.weight",
      {
        sourceId: "pose-weight:ref_pose_smile",
        defaultValue: 0,
        range: { min: 0, max: 1 },
      },
    );
    const angryWeightCatalogInput = makeInput(
      "poses_ref_pose_angry.weight",
      "/poses/ref_pose_angry.weight",
      {
        sourceId: "pose-weight:ref_pose_angry",
        defaultValue: 0,
        range: { min: 0, max: 1 },
      },
    );
    referenceFaceState.standardInputs = [];
    referenceFaceState.standardInputsById = new Map();
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [smileWeightCatalogInput, angryWeightCatalogInput],
      [],
      [
        {
          id: "ref_pose_angry",
          name: "Ref Angry Pose",
          targets: [{ inputId: "legacy_missing_lid_target", value: 0.42 }],
        },
        {
          id: "ref_pose_smile",
          name: "Ref Smile Pose",
          targets: [{ inputId: "legacy_missing_smile_target", value: 0.76 }],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Angry Pose" },
      },
    );

    fireEvent.click(screen.getByTitle("Apply Pose"));
    fireEvent.click(screen.getByTitle("Reset pose targets to defaults"));

    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      angryWeightCatalogInput.path,
      1,
    );
    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      smileWeightCatalogInput.path,
      0,
    );
    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      angryWeightCatalogInput.path,
      0,
    );
    expect(
      referenceFaceState.handleInputPathValueChange,
    ).not.toHaveBeenCalledWith("legacy_missing_lid_target", expect.any(Number));
    expect(poseRigState.applyPose).not.toHaveBeenCalled();
  });

  it("resets reference pose weights to runtime defaults when available", () => {
    const smileWeightInput = makeInput(
      "ref_pose_smile_weight",
      "/poses/ref_pose_smile.weight",
      {
        sourceId: "pose-weight:ref_pose_smile",
        defaultValue: 0.35,
        range: { min: 0, max: 1 },
      },
    );
    referenceFaceState.standardInputs = [smileWeightInput];
    referenceFaceState.standardInputsById = new Map([
      [smileWeightInput.id, smileWeightInput],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [smileWeightInput],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile Pose",
          targets: [{ inputId: "legacy_missing_smile_target", value: 0.76 }],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Smile Pose" },
      },
    );

    fireEvent.click(screen.getByTitle("Reset pose targets to defaults"));

    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      smileWeightInput.path,
      0.35,
    );
    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
    expect(poseRigState.applyPose).not.toHaveBeenCalled();
  });

  it("uses canonical pose-weight staging even when target metadata points elsewhere", () => {
    const runtimeLidInput = makeInput(
      "runtime_lid_close",
      "/standard/lid/close",
      {
        label: "Runtime Lid Close",
        defaultValue: 0.12,
        range: { min: 0, max: 1 },
      },
    );
    const smileWeightInput = makeInput(
      "ref_pose_smile_weight",
      "/poses/ref_pose_smile.weight",
      {
        sourceId: "pose-weight:ref_pose_smile",
        defaultValue: 0,
        range: { min: 0, max: 1 },
      },
    );
    referenceFaceState.standardInputs = [runtimeLidInput, smileWeightInput];
    referenceFaceState.standardInputsById = new Map([
      [runtimeLidInput.id, runtimeLidInput],
      [smileWeightInput.id, smileWeightInput],
    ]);
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [runtimeLidInput, smileWeightInput],
      [],
      [
        {
          id: "ref_pose_angry",
          name: "Ref Angry Pose",
          targets: [{ inputId: runtimeLidInput.id, value: 0.86 }],
        },
        {
          id: "ref_pose_smile",
          name: "Ref Smile Pose",
          targets: [{ inputId: runtimeLidInput.id, value: 0.24 }],
        },
      ],
    );

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search poses..."),
      {
        target: { value: "Ref Angry Pose" },
      },
    );

    fireEvent.click(screen.getByTitle("Apply Pose"));
    fireEvent.click(screen.getByTitle("Reset pose targets to defaults"));

    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      "/poses/ref_pose_angry.weight",
      1,
    );
    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      "/poses/ref_pose_smile.weight",
      0,
    );
    expect(referenceFaceState.handleInputPathValueChange).toHaveBeenCalledWith(
      "/poses/ref_pose_angry.weight",
      0,
    );
    expect(referenceFaceState.handleInputValueChange).not.toHaveBeenCalled();
    expect(poseRigState.applyPose).not.toHaveBeenCalled();
  });

  it("does not write when pose copy modal is cancelled", () => {
    const sourceInput = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const destinationInput = makeInput("main_smile", "/standard/mouth/smile", {
      label: "Main Smile",
    });
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceInput],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          targets: [{ inputId: sourceInput.id, value: 0.7 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationInput, source: "custom" },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(
      within(view.container).getByTitle("Copy pose to main face"),
    );
    expect(screen.getAllByText("Pose Copy Mapping").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(poseRigState.createPose).not.toHaveBeenCalled();
    expect(poseRigState.updatePoseGroup).not.toHaveBeenCalled();
    expect(poseRigState.updatePoseValue).not.toHaveBeenCalled();
    expect(poseRigState.deletePose).not.toHaveBeenCalled();
  });

  it("commits pose copy writes only after confirm", () => {
    const sourceSmile = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const sourceJaw = makeInput("ref_jaw", "/standard/jaw/open", {
      label: "Jaw Open",
    });
    const destinationSmile = makeInput("main_smile", "/standard/mouth/smile", {
      label: "Main Smile",
    });
    const destinationJaw = makeInput("main_jaw", "/standard/jaw/open", {
      label: "Main Jaw Open",
    });

    poseRigState.poses = [
      {
        id: "pose_existing",
        name: "Existing",
        description: "",
        group: null,
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceSmile, sourceJaw],
      [],
      [
        {
          id: "ref_pose_happy",
          name: "Ref Happy",
          targets: [
            { inputId: sourceSmile.id, value: 0.8 },
            { inputId: sourceJaw.id, value: 0.25 },
          ],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationSmile, source: "custom" },
      { input: destinationJaw, source: "custom" },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(
      within(view.container).getByTitle("Copy pose to main face"),
    );

    expect(poseRigState.createPose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(poseRigState.createPose).toHaveBeenCalledWith("Ref Happy");
    expect(poseRigState.updatePoseGroup).toHaveBeenCalledTimes(1);
    const createdPoseId = poseRigState.updatePoseGroup.mock.calls[0]?.[0];
    expect(poseRigState.updatePoseGroup).toHaveBeenCalledWith(
      createdPoseId,
      null,
    );
    expect(poseRigState.updatePoseValue).toHaveBeenCalledWith(
      createdPoseId,
      destinationSmile.id,
      0.8,
    );
    expect(poseRigState.updatePoseValue).toHaveBeenCalledWith(
      createdPoseId,
      destinationJaw.id,
      0.25,
    );
    expect(poseRigState.deletePose).not.toHaveBeenCalled();
  });

  it("opens the modal for same-name toolbar copies and can overwrite the existing pose", () => {
    const sourceSmile = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const destinationSmile = makeInput("main_smile", "/standard/mouth/smile", {
      label: "Main Smile",
    });
    poseRigState.poses = [
      {
        id: "pose_existing",
        name: "Ref Smile",
        description: "",
        group: "emotion/main",
        values: {
          stale_target: 0.15,
          [destinationSmile.id]: 0.21,
        },
        composeModes: {
          [destinationSmile.id]: "average",
        },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceSmile],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          targets: [{ inputId: sourceSmile.id, value: 0.73 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationSmile, source: "custom" },
    ];

    render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Ref Pose (1)" }));

    expect(screen.getAllByText("Pose Copy Mapping").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Overwrite Pose" })).toBeTruthy();
    expect(poseRigState.createPose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Overwrite Pose" }));

    expect(poseRigState.replacePoseTargets).toHaveBeenCalledWith(
      "pose_existing",
      { [destinationSmile.id]: 0.73 },
    );
    expect(poseRigState.createPose).not.toHaveBeenCalled();
    expect(poseRigState.updatePoseGroup).not.toHaveBeenCalled();
    expect(poseRigState.updatePoseValue).not.toHaveBeenCalled();
  });

  it("allows pose copy mappings to propsrig destinations", () => {
    const sourceProps = makeInput("ref_prop_target", "/propsrig/jaw/open", {
      label: "Ref Prop Target",
    });
    const destinationProps = makeInput(
      "main_prop_target",
      "/propsrig/jaw/open",
      {
        label: "Main Prop Target",
      },
    );
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceProps],
      [],
      [
        {
          id: "ref_pose_props",
          name: "Ref Props Pose",
          targets: [{ inputId: sourceProps.id, value: 0.66 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationProps, source: "custom" },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(
      within(view.container).getByTitle("Copy pose to main face"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(poseRigState.createPose).toHaveBeenCalledWith("Ref Props Pose");
    const createdPoseId = poseRigState.updatePoseGroup.mock.calls[0]?.[0];
    expect(poseRigState.updatePoseValue).toHaveBeenCalledWith(
      createdPoseId,
      destinationProps.id,
      0.66,
    );
  });

  it("auto-matches pose targets by source path when one fuzzy destination match exists", () => {
    const sourceSmile = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const destinationSmile = makeInput(
      "main_smile",
      "/avatar/standard/mouth/smile",
      {
        label: "Main Smile",
      },
    );
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceSmile],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          targets: [{ inputId: sourceSmile.id, value: 0.73 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationSmile, source: "custom" },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(
      within(view.container).getByTitle("Copy pose to main face"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Match Source Path" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    const createdPoseId = poseRigState.updatePoseGroup.mock.calls[0]?.[0];
    expect(poseRigState.updatePoseValue).toHaveBeenCalledWith(
      createdPoseId,
      destinationSmile.id,
      0.73,
    );
  });

  it("allows choosing current pose target value instead of reference value", () => {
    const sourceSmile = makeInput("ref_smile", "/standard/mouth/smile", {
      label: "Smile",
    });
    const destinationSmile = makeInput("main_smile", "/standard/mouth/smile", {
      label: "Main Smile",
    });
    poseRigState.poses = [
      {
        id: "pose_existing",
        name: "Ref Smile",
        description: "",
        group: null,
        values: {
          [destinationSmile.id]: 0.21,
        },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceSmile],
      [],
      [
        {
          id: "ref_pose_smile",
          name: "Ref Smile",
          targets: [{ inputId: sourceSmile.id, value: 0.73 }],
        },
        {
          id: "ref_pose_smile_alt",
          name: "Ref Smile",
          targets: [{ inputId: sourceSmile.id, value: 0.12 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [
      { input: destinationSmile, source: "custom" },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(
      within(view.container).getAllByTitle("Copy pose to main face")[0]!,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Use current pose value/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Overwrite Pose" }));

    expect(poseRigState.replacePoseTargets).toHaveBeenCalledWith(
      "pose_existing",
      { [destinationSmile.id]: 0.21 },
    );
  });

  it("blocks pose copy confirm when unresolved mappings remain", () => {
    const sourceOnly = makeInput("ref_missing", "/standard/mouth/missing", {
      label: "Missing",
    });
    referenceFaceState.referenceCatalog = makeReferenceCatalog(
      [sourceOnly],
      [],
      [
        {
          id: "ref_pose_unresolved",
          name: "Ref Unresolved",
          targets: [{ inputId: sourceOnly.id, value: 0.42 }],
        },
      ],
    );
    bindingState.managedStandardInputs = [];

    render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Ref Pose (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Copy" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Blocking unresolved mapping",
    );
    expect(poseRigState.createPose).not.toHaveBeenCalled();
    expect(poseRigState.updatePoseGroup).not.toHaveBeenCalled();
    expect(poseRigState.updatePoseValue).not.toHaveBeenCalled();
  });

  it("creates a new variable from toolbar action with a generated path", () => {
    const existing = makeInput("custom_new_driver", "/custom/new_driver");
    const created = makeInput("custom_new_driver_2", "/custom/new_driver_2");
    bindingState.standardInputsByPath = new Map([[existing.path, existing]]);
    bindingState.handleCreateCustomStandardInput.mockReturnValue(created);

    const onSelectRig = vi.fn();
    const view = render(<VariablesPanel onSelectRig={onSelectRig} />);

    fireEvent.click(
      within(view.container).getAllByRole("button", {
        name: "New Driver",
      })[0]!,
    );

    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledWith(
      "/custom/new_driver_2",
    );
    expect(onSelectRig).toHaveBeenCalledWith(created.id);
  });

  it("duplicates selected variable and preserves parent/child links", () => {
    const parent = makeInput("parent", "/custom/parent");
    const source = makeInput("source", "/custom/source");
    const child = makeInput("child", "/custom/child");
    bindingState.managedStandardInputs = [
      { input: parent, source: "custom" },
      { input: source, source: "custom" },
      { input: child, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [parent.id, parent],
      [source.id, source],
      [child.id, child],
    ]);
    bindingState.inputBindings = {
      [source.id]: {
        inputId: parent.id,
        slots: [{ inputId: parent.id }],
      },
      [child.id]: {
        inputId: source.id,
        slots: [{ inputId: source.id }],
      },
    };
    bindingState.pipelineConfigByInputId = {
      [source.id]: {
        inputId: source.id,
        parents: [
          {
            inputId: parent.id,
            linkId: "link/parent->source",
            scale: 0.25,
            offset: 0.4,
          },
        ],
      },
      [child.id]: {
        inputId: child.id,
        parents: [
          {
            inputId: source.id,
            linkId: "link/source->child",
            scale: 0.8,
            offset: -0.2,
          },
        ],
      },
    };
    bindingState.handleCloneStandardInputs.mockReturnValue(
      new Map([[source.id, "source_copy"]]),
    );

    const onSelectRig = vi.fn();
    const view = render(
      <VariablesPanel onSelectRig={onSelectRig} selectedRigId={source.id} />,
    );

    fireEvent.click(
      within(view.container).getByRole("button", {
        name: "Duplicate Driver",
      }),
    );

    expect(bindingState.handleCloneStandardInputs).toHaveBeenCalledWith(
      [source.id],
      {
        labelSuffix: " Copy",
        pathSuffix: "_copy",
        cloneRelationships: true,
      },
    );
    expect(bindingState.handleLinkChildInput).not.toHaveBeenCalled();
    expect(onSelectRig).toHaveBeenCalledWith("source_copy");
  });

  it("renders variable rows as full path leaves without terminal folders", () => {
    referenceFaceState.file = null;
    const rootLevel = makeInput("blink", "/blink", { label: "Blink" });
    const nested = makeInput("mouth_tx", "/mouth/translation/x", {
      label: "Mouth X",
    });
    bindingState.managedStandardInputs = [
      { input: rootLevel, source: "custom" },
      { input: nested, source: "custom" },
    ];

    const view = render(<VariablesPanel />);
    const search = within(view.container).getByPlaceholderText(
      "Search drivers...",
    );

    fireEvent.change(search, { target: { value: "blink" } });
    expect(screen.getAllByTitle("blink").length).toBeGreaterThan(0);

    fireEvent.change(search, { target: { value: "mouth/translation/x" } });
    expect(screen.getAllByTitle("mouth/translation/x").length).toBeGreaterThan(
      0,
    );
    expect(screen.queryAllByTitle("x").length).toBe(0);
    expect(screen.queryAllByTitle("Blink").length).toBe(0);
  });

  it("routes reference variable selection to linked main variable", () => {
    const linkedMain = makeInput("main_brow", "/standard/brow/up", {
      label: "Main Brow Up",
    });
    const referenceLinked = makeInput("ref_brow", "/standard/brow/up", {
      label: "Ref Brow Up",
    });
    bindingState.managedStandardInputs = [
      {
        input: linkedMain,
        source: "custom",
      },
    ];
    referenceFaceState.standardInputs = [referenceLinked];
    referenceFaceState.standardInputsById = new Map([
      [referenceLinked.id, referenceLinked],
    ]);

    const onSelectRig = vi.fn();
    const view = render(<VariablesPanel onSelectRig={onSelectRig} />);

    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/brow/up" },
      },
    );
    fireEvent.click(
      within(view.container).getAllByTitle("standard/brow/up")[0]!,
    );

    expect(onSelectRig).toHaveBeenCalledWith(linkedMain.id);
  });

  it("selects the reference driver id when selecting an unlinked reference variable", () => {
    const referenceOnly = makeInput("ref_brow", "/standard/brow/up", {
      label: "Ref Brow Up",
    });
    referenceFaceState.standardInputs = [referenceOnly];
    referenceFaceState.standardInputsById = new Map([
      [referenceOnly.id, referenceOnly],
    ]);

    const onSelectRig = vi.fn();
    const view = render(<VariablesPanel onSelectRig={onSelectRig} />);

    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "standard/brow/up" },
      },
    );
    fireEvent.click(
      within(view.container).getAllByTitle("standard/brow/up")[0]!,
    );

    expect(onSelectRig).toHaveBeenCalledWith(referenceOnly.id);
  });

  it("shows all standard and propsrig inputs on the Inputs surface", () => {
    const abstractInput = makeInput("abstract_jaw", "/mouth/open", {
      label: "Jaw Open",
    });
    const propsrigInput = makeInput("propsrig_eye", "/propsrig/eye/open", {
      label: "Eye Open",
    });
    bindingState.managedStandardInputs = [
      { input: abstractInput, source: "preset" },
      { input: propsrigInput, source: "auto" },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/mouth/open", abstractInput],
      ["/propsrig/eye/open", propsrigInput],
    ]);

    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );

    const scoped = within(view.container);
    const search = scoped.getByPlaceholderText("Search inputs...");

    fireEvent.change(search, { target: { value: "Jaw Open" } });
    expect(scoped.getByTitle("Jaw Open")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Eye Open" } });
    expect(scoped.getByTitle("Eye Open")).toBeTruthy();
  });

  it("renders input rows as path leaves without a terminal folder node", () => {
    const nestedInput = makeInput("jaw_open", "/face/jaw/open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [
      { input: nestedInput, source: "preset" },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/face/jaw/open", nestedInput],
    ]);

    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );
    const scoped = within(view.container);
    const search = scoped.getByPlaceholderText("Search inputs...");

    fireEvent.change(search, { target: { value: "Jaw Open" } });
    expect(scoped.getByTitle("Jaw Open")).toBeTruthy();
    expect(scoped.queryByTitle("open")).toBeNull();
  });

  it("excludes propsrig inputs for fully locked face elements on the Inputs surface", () => {
    const lockedX = makeInput("propsrig_eye_x", "/propsrig/eye/open_x", {
      label: "Eye Open X",
    });
    const lockedY = makeInput("propsrig_eye_y", "/propsrig/eye/open_y", {
      label: "Eye Open Y",
    });
    const unlockedOther = makeInput("propsrig_jaw", "/propsrig/jaw/open", {
      label: "Jaw Open",
    });

    bindingState.managedStandardInputs = [
      {
        input: lockedX,
        source: "auto",
        metadata: { elementId: "eye_l", componentId: "eye_l:x" },
      },
      {
        input: lockedY,
        source: "auto",
        metadata: { elementId: "eye_l", componentId: "eye_l:y" },
      },
      {
        input: unlockedOther,
        source: "auto",
        metadata: { elementId: "jaw", componentId: "jaw:value" },
      },
    ];
    bindingState.lockedInspectorTargetIds = new Set(["eye_l:x", "eye_l:y"]);

    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );
    const scoped = within(view.container);
    const search = scoped.getByPlaceholderText("Search inputs...");

    fireEvent.change(search, { target: { value: "Eye Open X" } });
    expect(scoped.queryByTitle("Eye Open X")).toBeNull();

    fireEvent.change(search, { target: { value: "Jaw Open" } });
    expect(scoped.getByTitle("Jaw Open")).toBeTruthy();
  });

  it("hides individually locked propsrig components when only part of a face element is locked", () => {
    const partialX = makeInput("propsrig_eye_x", "/propsrig/eye/open_x", {
      label: "Eye Open X",
    });
    const partialY = makeInput("propsrig_eye_y", "/propsrig/eye/open_y", {
      label: "Eye Open Y",
    });

    bindingState.managedStandardInputs = [
      {
        input: partialX,
        source: "auto",
        metadata: { elementId: "eye_l", componentId: "eye_l:x" },
      },
      {
        input: partialY,
        source: "auto",
        metadata: { elementId: "eye_l", componentId: "eye_l:y" },
      },
    ];
    bindingState.lockedInspectorTargetIds = new Set(["eye_l:x"]);

    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );
    const scoped = within(view.container);
    const search = scoped.getByPlaceholderText("Search inputs...");

    fireEvent.change(search, { target: { value: "Eye Open X" } });
    expect(scoped.queryByTitle("Eye Open X")).toBeNull();

    fireEvent.change(search, { target: { value: "Eye Open Y" } });
    expect(scoped.getByTitle("Eye Open Y")).toBeTruthy();
  });

  it("hides internal pose-control channels on the Inputs surface", () => {
    const directInput = makeInput("jaw_open", "/standard/jaw/open", {
      label: "Jaw Open",
    });
    const poseControlInternal = makeInput(
      "pose_control_jaw_open",
      "/pose/control/jaw_open",
      {
        label: "Pose Control Jaw Open",
      },
    );
    bindingState.managedStandardInputs = [
      { input: directInput, source: "preset" },
      { input: poseControlInternal, source: "auto" },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/standard/jaw/open", directInput],
      ["/pose/control/jaw_open", poseControlInternal],
    ]);

    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
      />,
    );
    const scoped = within(view.container);
    const search = scoped.getByPlaceholderText("Search inputs...");

    fireEvent.change(search, { target: { value: "Jaw Open" } });
    expect(scoped.getByTitle("Jaw Open")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Pose Control Jaw Open" } });
    expect(scoped.queryByTitle("Pose Control Jaw Open")).toBeNull();
  });

  it("distinguishes pose-weight inputs from group/stage derived controls", () => {
    const regularInput = makeInput("jaw_open", "/standard/jaw/open", {
      label: "Jaw Open",
    });
    const poseWeightInput = makeInput(
      "pose_smile_weight",
      "/poses/pose_smile.weight",
      {
        label: "Pose Weight Smile",
        sourceId: "pose-weight:pose_smile",
      },
    );
    bindingState.managedStandardInputs = [
      { input: regularInput, source: "preset" },
      { input: poseWeightInput, source: "custom" },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/standard/jaw/open", regularInput],
      ["/poses/pose_smile.weight", poseWeightInput],
    ]);
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        values: {},
        createdAt: "now",
        updatedAt: "now",
      } as PoseDefinition,
    ];
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: poseRigState.poses,
      poseGroups: [{ id: "emotion", name: "Emotion", path: "emotion" }],
      blendStages: [
        {
          id: "stage_base",
          name: "Base",
          mode: "add",
          sources: [{ kind: "group", id: "emotion" }],
        },
      ],
    };
    const onSelectRig = vi.fn();
    const view = render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        onSelectRig={onSelectRig}
      />,
    );
    const scoped = within(view.container);
    const search = scoped.getByPlaceholderText("Search inputs...");

    fireEvent.change(search, { target: { value: "Pose Weight Smile" } });
    expect(scoped.getByTitle("Pose Weight Smile")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Group Output · emotion" } });
    expect(scoped.queryByTitle("Group Output · emotion")).toBeNull();
    expect(scoped.getByText("No results")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Stage Output · Base" } });
    expect(scoped.getByTitle("Stage Output · Base")).toBeTruthy();
    expect(scoped.getByText("Derived control (read-only)")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Pose Weight Smile" } });
    fireEvent.click(scoped.getByTitle("Pose Weight Smile"));
    expect(onSelectRig).toHaveBeenCalledWith("pose_smile_weight");
  });

  it("requires confirmation before deleting a custom variable", () => {
    referenceFaceState.file = null;
    const customInput = makeInput("custom_smile", "/custom/smile", {
      label: "Smile",
    });
    bindingState.managedStandardInputs = [
      {
        input: customInput,
        source: "custom",
      },
    ];

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    const view = render(<VariablesPanel />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "custom/smile" },
      },
    );

    fireEvent.click(within(view.container).getAllByTitle("Delete driver")[0]!);

    expect(confirmSpy).toHaveBeenCalledWith(
      `Delete custom driver "${customInput.label}"?\n\nThis removes the driver and cleans linked parent/child bindings.`,
    );
    expect(bindingState.handleDeleteCustomStandardInput).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("deletes confirmed custom variables and clears selection", () => {
    referenceFaceState.file = null;
    const customInput = makeInput("custom_brow", "/custom/brow", {
      label: "Brow Raise",
    });
    bindingState.managedStandardInputs = [
      {
        input: customInput,
        source: "custom",
      },
    ];

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSelectRig = vi.fn();
    const view = render(<VariablesPanel onSelectRig={onSelectRig} />);
    fireEvent.change(
      within(view.container).getByPlaceholderText("Search drivers..."),
      {
        target: { value: "custom/brow" },
      },
    );

    fireEvent.click(within(view.container).getAllByTitle("Delete driver")[0]!);

    expect(bindingState.handleDeleteCustomStandardInput).toHaveBeenCalledWith(
      customInput.id,
    );
    expect(onSelectRig).toHaveBeenCalledWith(null);
    confirmSpy.mockRestore();
  });

  it("deletes all custom drivers in a folder from the folder action", () => {
    referenceFaceState.file = null;
    const customUp = makeInput("custom_brow_up", "/custom/brow/up", {
      label: "Brow Up",
    });
    const customDown = makeInput("custom_brow_down", "/custom/brow/down", {
      label: "Brow Down",
    });
    bindingState.managedStandardInputs = [
      {
        input: customUp,
        source: "custom",
      },
      {
        input: customDown,
        source: "custom",
      },
    ];

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onSelectRig = vi.fn();
    const view = render(
      <VariablesPanel onSelectRig={onSelectRig} selectedRigId={customUp.id} />,
    );

    fireEvent.click(
      within(view.container).getByTitle("Delete folder drivers (2)"),
    );

    const confirmationMessage = confirmSpy.mock.calls[0]?.[0] ?? "";
    expect(confirmationMessage).toContain('Delete folder "custom / brow"?');
    expect(confirmationMessage).toContain("This deletes 2 custom drivers");
    expect(bindingState.handleDeleteCustomStandardInput).toHaveBeenCalledTimes(
      2,
    );
    expect(bindingState.handleDeleteCustomStandardInput).toHaveBeenCalledWith(
      customUp.id,
    );
    expect(bindingState.handleDeleteCustomStandardInput).toHaveBeenCalledWith(
      customDown.id,
    );
    expect(onSelectRig).toHaveBeenCalledWith(null);
    confirmSpy.mockRestore();
  });

  it("hides folder delete when a folder includes non-custom drivers", () => {
    referenceFaceState.file = null;
    const customInput = makeInput("custom_brow_up", "/custom/brow/up", {
      label: "Brow Up",
    });
    const presetInput = makeInput("preset_brow_down", "/custom/brow/down", {
      label: "Brow Down Preset",
    });
    bindingState.managedStandardInputs = [
      { input: customInput, source: "custom" },
      { input: presetInput, source: "preset" },
    ];

    const view = render(<VariablesPanel />);
    expect(
      within(view.container).queryByTitle(/Delete folder drivers/),
    ).toBeNull();
  });

  it("keeps pose CRUD actions wired on the poses surface", () => {
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        description: "",
        group: null,
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    const onSelectPose = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
        onSelectPose={onSelectPose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "New Pose" }));
    expect(poseRigState.createPose).toHaveBeenCalledTimes(1);

    fireEvent.click(within(view.container).getByTitle("Duplicate this pose"));
    expect(poseRigState.duplicatePose).toHaveBeenCalledWith("pose_smile");

    fireEvent.click(within(view.container).getByTitle("Smile"));
    expect(onSelectPose).toHaveBeenCalledWith("pose_smile");
    expect(poseRigState.applyPose).not.toHaveBeenCalled();

    fireEvent.click(within(view.container).getByTitle("Delete Pose"));
    expect(confirmSpy).toHaveBeenCalledWith('Delete pose "Smile"?');
    expect(poseRigState.deletePose).toHaveBeenCalledWith("pose_smile");
    confirmSpy.mockRestore();
  });

  it("toggles pose folders without opening the pose-group inspector", () => {
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        description: "",
        group: "emotion",
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    const onSelectPoseGroup = vi.fn();
    const onSelectPose = vi.fn();
    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
        onSelectPose={onSelectPose}
        onSelectPoseGroup={onSelectPoseGroup}
      />,
    );

    expect(within(view.container).queryByTitle("Smile")).toBeNull();

    fireEvent.click(within(view.container).getByTitle("emotion"));

    expect(onSelectPoseGroup).not.toHaveBeenCalled();
    expect(onSelectPose).not.toHaveBeenCalled();
    expect(within(view.container).getByTitle("Smile")).toBeTruthy();
  });

  it("routes pose play action through canonical pose-weight inputs when available", () => {
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        description: "",
        group: null,
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "pose_frown",
        name: "Frown",
        description: "",
        group: null,
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];
    bindingState.managedStandardInputs = [
      {
        input: makeInput("w_smile", "/poses/pose_smile.weight", {
          sourceId: "pose-weight:pose_smile",
        }),
        source: "custom",
      },
      {
        input: makeInput("w_frown", "/poses/pose_frown.weight", {
          sourceId: "pose-weight:pose_frown",
        }),
        source: "custom",
      },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
      />,
    );

    fireEvent.click(within(view.container).getAllByTitle("Apply Pose")[0]!);

    const updates = bindingState.applyStandardInputBatch.mock.calls[0]?.[0] as
      | Record<string, number>
      | undefined;
    expect(updates).toBeDefined();
    expect(Object.keys(updates ?? {}).sort()).toEqual(["w_frown", "w_smile"]);
    expect(Object.values(updates ?? {}).sort()).toEqual([0, 1]);
    expect(poseRigState.applyPose).not.toHaveBeenCalled();
  });

  it("shows configured pose groups even when they have zero members", () => {
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [],
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
        },
      ],
    };

    const onSelectPoseGroup = vi.fn();
    const onSelectBlendStage = vi.fn();
    const view = render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
        onSelectPoseGroup={onSelectPoseGroup}
        onSelectBlendStage={onSelectBlendStage}
      />,
    );

    fireEvent.click(within(view.container).getByTitle("emotion"));

    expect(onSelectBlendStage).toHaveBeenCalledWith(null);
    expect(onSelectPoseGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "emotion",
        groupPath: "emotion",
        poseIds: [],
      }),
    );
  });

  it("treats pose folders on the poses surface as folders instead of opening the pose-group inspector", () => {
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        description: "",
        group: "emotion",
        groupId: "emotion",
        groupIds: ["emotion"],
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const onSelectPoseGroup = vi.fn();
    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
        onSelectPoseGroup={onSelectPoseGroup}
      />,
    );

    fireEvent.click(within(view.container).getByTitle("emotion"));

    expect(onSelectPoseGroup).not.toHaveBeenCalled();
    expect(within(view.container).getByTitle("Smile")).toBeTruthy();
  });

  it("assigns and unassigns selected pose membership deterministically", () => {
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [],
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
        },
      ],
    };
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        description: "",
        group: "viseme",
        groupId: "viseme",
        groupIds: ["viseme"],
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const assignView = render(
      <VariablesPanel
        selectedPoseId="pose_smile"
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
      />,
    );
    fireEvent.click(
      within(assignView.container).getByRole("button", { name: "Assign" }),
    );
    expect(poseRigState.addPoseToGroup).toHaveBeenCalledWith(
      "pose_smile",
      "emotion",
    );

    poseRigState.addPoseToGroup.mockReset();
    poseRigState.poses = [
      {
        ...poseRigState.poses[0]!,
        group: "emotion",
        groupId: "emotion",
        groupIds: ["emotion"],
      },
    ];

    const unassignView = render(
      <VariablesPanel
        selectedPoseId="pose_smile"
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
      />,
    );
    fireEvent.click(
      within(unassignView.container).getByRole("button", { name: "Unassign" }),
    );
    expect(poseRigState.removePoseFromGroup).toHaveBeenCalledWith(
      "pose_smile",
      "emotion",
    );
  });

  it("shows full selected-pose membership list on pose-groups surface", () => {
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [],
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
        },
      ],
    };
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        description: "",
        group: "emotion",
        groupId: "emotion",
        groupIds: ["emotion", "viseme"],
        values: {},
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    ];

    const view = render(
      <VariablesPanel
        selectedPoseId="pose_smile"
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
      />,
    );

    expect(
      within(view.container).getByText("Selected pose: Smile"),
    ).toBeTruthy();
    expect(
      within(view.container).getAllByText("emotion").length,
    ).toBeGreaterThan(0);
    expect(
      within(view.container).getAllByText("viseme").length,
    ).toBeGreaterThan(0);
    expect(
      within(view.container).getAllByRole("button", { name: "Unassign" }),
    ).toHaveLength(2);
  });

  it("wires multi-stage blend authoring management controls on pose-groups surface", () => {
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [],
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
    };
    poseRigState.blendStages = [
      {
        id: "stage_base",
        name: "Base",
        mode: "add",
        sources: [
          { kind: "group", id: "emotion" },
          { kind: "group", id: "viseme" },
        ],
      },
      {
        id: "stage_final",
        name: "Final",
        mode: "average",
        sources: [{ kind: "group", id: "viseme" }],
      },
    ];

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Base Layer");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
      />,
    );
    expect(
      within(view.container).queryByTitle("Inspect blend stage"),
    ).toBeNull();

    fireEvent.click(
      within(view.container).getByRole("button", { name: "New Stage" }),
    );
    expect(poseRigState.createBlendStage).toHaveBeenCalledWith();

    fireEvent.click(
      within(view.container).getAllByTitle("Rename blend stage")[0]!,
    );
    expect(promptSpy).toHaveBeenCalledWith("Rename blend stage", "Base");
    expect(poseRigState.renameBlendStage).toHaveBeenCalledWith(
      "stage_base",
      "Base Layer",
    );

    fireEvent.click(within(view.container).getAllByTitle("Move stage up")[1]!);
    expect(poseRigState.reorderBlendStage).toHaveBeenCalledWith(1, 0);

    fireEvent.click(
      within(view.container).getAllByTitle("Delete blend stage")[0]!,
    );
    expect(confirmSpy).toHaveBeenCalledWith('Delete blend stage "Base"?');
    expect(poseRigState.deleteBlendStage).toHaveBeenCalledWith("stage_base");

    promptSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it("emits stable stage inspector selection payloads from inspect actions", () => {
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [],
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
    };
    poseRigState.blendStages = [
      {
        id: "stage_base",
        name: "Base",
        mode: "add",
        sources: [{ kind: "group", id: "emotion" }],
      },
      {
        id: "stage_final",
        name: "Final",
        mode: "average",
        sources: [
          { kind: "stage", id: "stage_base" },
          { kind: "group", id: "viseme" },
        ],
      },
    ];

    const onSelectPoseGroup = vi.fn();
    const onSelectBlendStage = vi.fn();
    const view = render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
        onSelectPoseGroup={onSelectPoseGroup}
        onSelectBlendStage={onSelectBlendStage}
      />,
    );

    fireEvent.click(
      within(view.container).getByRole("button", {
        name: "Inspect blend stage Final",
      }),
    );

    expect(onSelectPoseGroup).toHaveBeenCalledWith(null);
    expect(onSelectBlendStage).toHaveBeenCalledWith({
      id: "stage_final",
      label: "Final",
      mode: "average",
      sourceSummary: "stage:Base, group:viseme",
      sourceIds: ["stage:stage_base", "group:viseme"],
    });
  });

  it("blocks invalid stage topology interactions before dispatching actions", () => {
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: "face",
      neutralInputs: {},
      poses: [],
      poseGroups: [{ id: "emotion", name: "Emotion", path: "emotion" }],
    };
    poseRigState.blendStages = [
      {
        id: "stage_a",
        name: "Stage A",
        mode: "add",
        sources: [{ kind: "group", id: "emotion" }],
      },
      {
        id: "stage_b",
        name: "Stage B",
        mode: "add",
        sources: [{ kind: "stage", id: "stage_a" }],
      },
    ];

    const view = render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
      />,
    );

    expect(
      within(view.container).queryByText(/No stages \(compatibility mode\)/),
    ).toBeNull();
    expect(
      within(view.container).getByTitle(
        "Delete blocked while later stages reference this stage",
      ),
    ).toHaveProperty("disabled", true);
    const blockedMoveButtons = within(view.container).getAllByTitle(
      'Stage "Stage B" must reference earlier stages only (invalid source "stage_a").',
    );
    expect(blockedMoveButtons).toHaveLength(2);
    blockedMoveButtons.forEach((button) => {
      expect(button).toHaveProperty("disabled", true);
    });

    expect(poseRigState.setBlendStageSources).not.toHaveBeenCalled();
    expect(poseRigState.reorderBlendStage).not.toHaveBeenCalled();
    expect(poseRigState.deleteBlendStage).not.toHaveBeenCalled();
  });

  it("clears stale pose-group selection when the backing group no longer exists", () => {
    const onSelectPoseGroup = vi.fn();
    render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
        selectedPoseGroup={{
          groupId: "missing_group",
          groupPath: "emotion",
          label: "emotion",
          nodeId: "missing_group",
          poseIds: ["pose_smile"],
        }}
        onSelectPoseGroup={onSelectPoseGroup}
      />,
    );

    expect(onSelectPoseGroup).toHaveBeenCalledWith(null);
  });

  it("scopes motiongraph output eligibility to the visible Input Controls rows", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    const brow = makeInput("brow_up", "/face/brow/inner_up", {
      label: "Brow Up",
    });
    bindingState.managedStandardInputs = [
      { input: jaw, source: "custom" },
      { input: brow, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [jaw.id, jaw],
      [brow.id, brow],
    ]);
    bindingState.standardInputsByPath = new Map([
      [jaw.path, jaw],
      [brow.path, brow],
    ]);
    bindingState.inputValues = {
      [jaw.id]: 0.2,
      [brow.id]: 0.4,
    };
    poseRigState.poseConfigDraft = {
      version: 1,
      faceId: null,
      neutralInputs: {},
      poses: [],
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          blendMode: "average",
        },
      ],
      blendStages: [
        {
          id: "stage_a",
          name: "Stage A",
          mode: "add",
          sources: [{ kind: "group", id: "emotion" }],
        },
      ],
    };

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        motionGraphActive
        runtimeFaceId="face"
      />,
    );

    expect(screen.getByText("Outputs 0/3")).toBeTruthy();

    const search = screen.getByPlaceholderText("Search inputs...");
    fireEvent.change(search, {
      target: { value: "jaw open" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Add PAP Output" })[0]!,
    );
    const beforeSearchEnabledOutputs = new Set(
      useEditorStore.getState().enabledOutputs,
    );
    expect(beforeSearchEnabledOutputs.size).toBe(1);

    fireEvent.change(search, {
      target: { value: "stage output" },
    });

    expect(
      screen.getAllByText("Stage Output · Stage A").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Jaw Open")).toBeNull();
    expect(screen.getByText("Outputs 0/1")).toBeTruthy();
    expect(useEditorStore.getState().enabledOutputs).toEqual(
      beforeSearchEnabledOutputs,
    );
  });

  it("toggles procedural animation programming input/output from input rows", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [{ input: jaw, source: "custom" }];
    bindingState.standardInputsById = new Map([[jaw.id, jaw]]);
    bindingState.standardInputsByPath = new Map([[jaw.path, jaw]]);
    bindingState.inputValues = {
      [jaw.id]: 0.2,
    };

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        motionGraphActive
        runtimeFaceId="face"
      />,
    );

    expect(useEditorStore.getState().enabledInputs.size).toBe(0);
    expect(useEditorStore.getState().enabledOutputs.size).toBe(0);

    fireEvent.change(screen.getByPlaceholderText("Search inputs..."), {
      target: { value: "jaw open" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add PAP Input" }));
    fireEvent.click(screen.getByRole("button", { name: "Add PAP Output" }));

    expect(useEditorStore.getState().enabledInputs.size).toBe(1);
    expect(useEditorStore.getState().enabledOutputs.size).toBe(1);
    expect(
      screen.getByRole("button", { name: "Remove PAP Input" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove PAP Output" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove PAP Input" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove PAP Output" }));

    expect(useEditorStore.getState().enabledInputs.size).toBe(0);
    expect(useEditorStore.getState().enabledOutputs.size).toBe(0);
  });

  it("locks active procedural graph outputs while graph playback is running", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [{ input: jaw, source: "custom" }];
    bindingState.standardInputsById = new Map([[jaw.id, jaw]]);
    bindingState.standardInputsByPath = new Map([[jaw.path, jaw]]);
    bindingState.inputValues = {
      [jaw.id]: 0.2,
    };
    graphRuntimeState.graphPlaybackState = "playing";

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        motionGraphActive
        runtimeFaceId="face"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search inputs..."), {
      target: { value: "jaw open" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add PAP Output" }));

    const outputRow = screen
      .getByRole("button", { name: "Remove PAP Output" })
      .closest('[role="button"]');
    expect(outputRow).toBeTruthy();
    // `Slider` is built on radix, whose `role="slider"` element is a <span>, so
    // there is no `disabled` DOM property to read. radix expresses the disabled
    // state as `data-disabled` and by withholding `tabindex`, which is the same
    // contract screen readers and keyboard users actually see. The behaviour
    // guarded here — a locked output cannot be edited — is unchanged.
    const outputSlider = within(outputRow as HTMLElement).getByRole("slider");
    expect(outputSlider.hasAttribute("data-disabled")).toBe(true);
    expect(outputSlider.getAttribute("tabindex")).toBeNull();
    expect(
      screen.getByText(
        "Procedural animation playback is currently driving this output.",
      ),
    ).toBeTruthy();
  });

  it("adds and removes animation tracks from input rows", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [{ input: jaw, source: "custom" }];
    bindingState.standardInputsById = new Map([[jaw.id, jaw]]);
    bindingState.standardInputsByPath = new Map([[jaw.path, jaw]]);
    bindingState.inputValues = {
      [jaw.id]: 0.2,
    };

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        animationActive
      />,
    );

    const search = screen.getByPlaceholderText("Search inputs...");
    fireEvent.change(search, {
      target: { value: "jaw open" },
    });

    expect(screen.getByText("Tracks 0/1")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Add Animation Track" }),
    );
    expect(useAnimationStore.getState().tracks).toHaveLength(1);
    expect(useAnimationStore.getState().tracks[0]?.variableId).toBe(jaw.id);
    expect(screen.getByText("Tracks 1/1")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove Animation Track" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Animation Track" }),
    );
    expect(useAnimationStore.getState().tracks).toHaveLength(0);
    expect(screen.getByText("Tracks 0/1")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add Animation Track" }),
    ).toBeTruthy();
  });

  it("writes input slider edits as animation keyframes at the current timeline time", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [{ input: jaw, source: "custom" }];
    bindingState.standardInputsById = new Map([[jaw.id, jaw]]);
    bindingState.standardInputsByPath = new Map([[jaw.path, jaw]]);
    bindingState.inputValues = {
      [jaw.id]: 0.2,
    };
    useAnimationStore.getState().seek(1.25);

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        animationActive
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search inputs..."), {
      target: { value: "jaw open" },
    });
    // Driven by keyboard rather than `fireEvent.change`: `Slider` is built on
    // radix, whose `role="slider"` element is a <span> with no value setter.
    // ArrowRight advances by one `step` (0.01) from the seeded 0.2, giving 0.21.
    // That stays clear of snap-to-default — the fixture's defaultValue is 0 and
    // the snap window is max(step*4, range*0.01) = 0.04.
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });

    const animationState = useAnimationStore.getState();
    expect(animationState.tracks).toHaveLength(1);
    expect(animationState.tracks[0]?.variableId).toBe("jaw_open");
    expect(animationState.tracks[0]?.keyframes).toHaveLength(1);
    expect(animationState.tracks[0]?.keyframes[0]?.time).toBe(1.25);
    expect(animationState.tracks[0]?.keyframes[0]?.value).toBe(0.21);
    expect(bindingState.handleInputValueChange).toHaveBeenCalledWith(
      "jaw_open",
      0.21,
    );
  });

  it("adds all pose channels as animation tracks at the current timeline time", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    const brow = makeInput("brow_raise", "/face/brow/raise", {
      label: "Brow Raise",
    });
    bindingState.managedStandardInputs = [
      { input: jaw, source: "custom" },
      { input: brow, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [jaw.id, jaw],
      [brow.id, brow],
    ]);
    bindingState.standardInputsByPath = new Map([
      [jaw.path, jaw],
      [brow.path, brow],
    ]);
    bindingState.inputValues = {
      [jaw.id]: 0,
      [brow.id]: 0,
    };
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        values: {
          jaw_open: 0.7,
          brow_raise: 0.35,
        },
        createdAt: "now",
        updatedAt: "now",
      },
    ];
    useAnimationStore.getState().seek(2.5);

    const view = render(
      <VariablesPanel
        availableSurfaces={["poses"]}
        activeSurfaceOverride="poses"
        animationActive
      />,
    );

    fireEvent.click(
      within(view.container).getByTitle(
        "Add pose channels as animation tracks at current time",
      ),
    );

    const animationState = useAnimationStore.getState();
    expect(animationState.tracks).toHaveLength(2);
    const trackById = new Map(
      animationState.tracks.map((track) => [track.variableId, track]),
    );
    expect(trackById.get("jaw_open")?.keyframes[0]).toMatchObject({
      time: 2.5,
      value: 0.7,
    });
    expect(trackById.get("brow_raise")?.keyframes[0]).toMatchObject({
      time: 2.5,
      value: 0.35,
    });
    expect(bindingState.applyStandardInputBatch).toHaveBeenCalledWith({
      jaw_open: 0.7,
      brow_raise: 0.35,
    });
  });

  it("adds pose target tracks from animation inputs when selecting a pose-weight row action", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    const brow = makeInput("brow_raise", "/face/brow/raise", {
      label: "Brow Raise",
    });
    const poseWeight = makeInput(
      "pose_smile_weight",
      "/poses/pose_smile.weight",
      {
        label: "Pose Weight Smile",
        sourceId: "pose-weight:pose_smile",
      },
    );
    bindingState.managedStandardInputs = [
      { input: jaw, source: "custom" },
      { input: brow, source: "custom" },
      { input: poseWeight, source: "custom" },
    ];
    bindingState.standardInputsById = new Map([
      [jaw.id, jaw],
      [brow.id, brow],
      [poseWeight.id, poseWeight],
    ]);
    bindingState.standardInputsByPath = new Map([
      [jaw.path, jaw],
      [brow.path, brow],
      [poseWeight.path, poseWeight],
    ]);
    bindingState.inputValues = {
      [jaw.id]: 0,
      [brow.id]: 0,
      [poseWeight.id]: 0,
    };
    poseRigState.poses = [
      {
        id: "pose_smile",
        name: "Smile",
        values: {
          jaw_open: 0.7,
          brow_raise: 0.35,
        },
        createdAt: "now",
        updatedAt: "now",
      },
    ];
    useAnimationStore.getState().seek(2.5);

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        animationActive
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search inputs..."), {
      target: { value: "Pose Weight Smile" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Pose Targets" }));

    const animationState = useAnimationStore.getState();
    expect(animationState.tracks).toHaveLength(2);
    const trackById = new Map(
      animationState.tracks.map((track) => [track.variableId, track]),
    );
    expect(trackById.get("jaw_open")?.keyframes[0]).toMatchObject({
      time: 2.5,
      value: 0.7,
    });
    expect(trackById.get("brow_raise")?.keyframes[0]).toMatchObject({
      time: 2.5,
      value: 0.35,
    });
    expect(bindingState.applyStandardInputBatch).toHaveBeenCalledWith({
      jaw_open: 0.7,
      brow_raise: 0.35,
    });
  });

  it("honors center authoring mode when contextual actions overlap", () => {
    const jaw = makeInput("jaw_open", "/face/mouth/jaw_open", {
      label: "Jaw Open",
    });
    bindingState.managedStandardInputs = [{ input: jaw, source: "custom" }];
    bindingState.standardInputsById = new Map([[jaw.id, jaw]]);
    bindingState.standardInputsByPath = new Map([[jaw.path, jaw]]);
    bindingState.inputValues = {
      [jaw.id]: 0.2,
    };

    render(
      <VariablesPanel
        availableSurfaces={["inputs"]}
        activeSurfaceOverride="inputs"
        motionGraphActive
        animationActive
        centerAuthoringMode="animation"
        runtimeFaceId="face"
      />,
    );

    const search = screen.getByPlaceholderText("Search inputs...");
    fireEvent.change(search, {
      target: { value: "jaw open" },
    });

    expect(
      screen.getByRole("button", { name: "Add Animation Track" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add PAP Input" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add PAP Output" })).toBeNull();
  });

  it("renders wrapped authoring tabs for animations and programs", () => {
    const view = render(
      <VariablesPanel
        availableSurfaces={[
          "variables",
          "poses",
          "pose-groups",
          "animations",
          "programs",
        ]}
        animationTargets={[
          {
            id: "animation:wave",
            label: "Wave",
            source: "authored",
          },
        ]}
        onDuplicateAnimationTarget={vi.fn()}
        onDeleteAnimationTarget={vi.fn()}
        programTargets={[
          {
            id: "program:blink",
            label: "Blink",
            source: "authored",
          },
        ]}
        onDuplicateProgramTarget={vi.fn()}
        onDeleteProgramTarget={vi.fn()}
      />,
    );

    expect(screen.getByTestId("control-authoring-tab-animations")).toBeTruthy();
    expect(screen.getByTestId("control-authoring-tab-programs")).toBeTruthy();
    fireEvent.click(screen.getByTestId("control-authoring-tab-animations"));
    expect(screen.getByRole("button", { name: "New Animation" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Copy" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("button", { name: "Delete" }).length,
    ).toBeGreaterThan(0);

    const tablist = view.container.querySelector('[role="tablist"]');
    expect(tablist?.className).toContain("flex-wrap");
    expect(tablist?.className).toContain("overflow-visible");
  });

  it("routes animation and program list actions through the provided callbacks", () => {
    const onSelectAnimationTarget = vi.fn();
    const onCreateAnimationTarget = vi.fn();
    const onPlayAnimationTarget = vi.fn();
    const onPauseAnimationTarget = vi.fn();
    const onStopAnimationTarget = vi.fn();
    const onDeleteAnimationTarget = vi.fn();
    const onSelectProgramTarget = vi.fn();
    const onCreateProgramTarget = vi.fn();
    const onPlayProgramTarget = vi.fn();
    const onPauseProgramTarget = vi.fn();
    const onStopProgramTarget = vi.fn();
    const onDeleteProgramTarget = vi.fn();

    render(
      <VariablesPanel
        availableSurfaces={["animations", "programs"]}
        animationTargets={[
          {
            id: "animation:wave",
            label: "Wave Clip",
            source: "authored",
            selected: true,
            runtimeState: "stopped",
            meta: "2 tracks",
          },
          {
            id: "animation:live",
            label: "Live Clip",
            source: "imported",
            selected: false,
            runtimeState: "playing",
            meta: "1 track",
          },
        ]}
        onSelectAnimationTarget={onSelectAnimationTarget}
        onCreateAnimationTarget={onCreateAnimationTarget}
        onPlayAnimationTarget={onPlayAnimationTarget}
        onPauseAnimationTarget={onPauseAnimationTarget}
        onStopAnimationTarget={onStopAnimationTarget}
        onDeleteAnimationTarget={onDeleteAnimationTarget}
        programTargets={[
          {
            id: "program:blink",
            label: "Blink Graph",
            source: "authored",
            selected: true,
            runtimeState: "stopped",
            meta: "3 nodes",
          },
          {
            id: "program:live",
            label: "Live Graph",
            source: "imported",
            selected: false,
            runtimeState: "playing",
            meta: "1 node",
          },
        ]}
        onSelectProgramTarget={onSelectProgramTarget}
        onCreateProgramTarget={onCreateProgramTarget}
        onPlayProgramTarget={onPlayProgramTarget}
        onPauseProgramTarget={onPauseProgramTarget}
        onStopProgramTarget={onStopProgramTarget}
        onDeleteProgramTarget={onDeleteProgramTarget}
      />,
    );

    expect(screen.getByPlaceholderText("Search animations...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Authored" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Imported" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New Animation" }));
    fireEvent.click(screen.getByText("Wave Clip"));
    fireEvent.click(screen.getByTitle("Play animation"));
    fireEvent.click(screen.getByTitle("Pause animation"));
    fireEvent.click(screen.getByTitle("Stop animation"));
    fireEvent.click(screen.getAllByTitle("Delete animation")[0]!);

    expect(onCreateAnimationTarget).toHaveBeenCalledTimes(1);
    expect(onSelectAnimationTarget).toHaveBeenCalledWith("animation:wave");
    expect(onPlayAnimationTarget).toHaveBeenCalledWith("animation:wave");
    expect(onPauseAnimationTarget).toHaveBeenCalledWith("animation:live");
    expect(onStopAnimationTarget).toHaveBeenCalledWith("animation:live");
    expect(onDeleteAnimationTarget).toHaveBeenCalledWith("animation:wave");

    fireEvent.click(screen.getByRole("tab", { name: "Programs (2)" }));

    expect(screen.getByPlaceholderText("Search programs...")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New Program" }));
    fireEvent.click(screen.getByText("Blink Graph"));
    fireEvent.click(screen.getByTitle("Play program"));
    fireEvent.click(screen.getByTitle("Pause program"));
    fireEvent.click(screen.getByTitle("Stop program"));
    fireEvent.click(screen.getAllByTitle("Delete program")[0]!);

    expect(onCreateProgramTarget).toHaveBeenCalledTimes(1);
    expect(onSelectProgramTarget).toHaveBeenCalledWith("program:blink");
    expect(onPlayProgramTarget).toHaveBeenCalledWith("program:blink");
    expect(onPauseProgramTarget).toHaveBeenCalledWith("program:live");
    expect(onStopProgramTarget).toHaveBeenCalledWith("program:live");
    expect(onDeleteProgramTarget).toHaveBeenCalledWith("program:blink");
  });

  it("clears stale blend-stage selection when the backing stage no longer exists", () => {
    const onSelectBlendStage = vi.fn();
    const selectedBlendStage: BlendStageInspectorSelection = {
      id: "missing_stage",
      label: "Missing",
      mode: "add",
      sourceSummary: "group:emotion",
      sourceIds: ["group:emotion"],
    };

    render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
        selectedBlendStage={selectedBlendStage}
        onSelectBlendStage={onSelectBlendStage}
      />,
    );

    expect(onSelectBlendStage).toHaveBeenCalledWith(null);
  });
});

describe("formatSurfaceLabelWithCount", () => {
  it("keeps count formatting stable for zero and non-zero values", () => {
    expect(formatSurfaceLabelWithCount("Poses", 0)).toBe("Poses (0)");
    expect(formatSurfaceLabelWithCount("Poses", 7)).toBe("Poses (7)");
  });
});

describe("filterTreeForActiveSurface", () => {
  it("skips filter work for inactive surfaces", () => {
    const rootNode = { id: "root" };
    const filterTree = vi.fn(() => ({ id: "filtered" }));

    const result = filterTreeForActiveSurface({
      activeSurface: "poses",
      targetSurface: "variables",
      rootNode,
      query: "jaw",
      filterTree,
    });

    expect(result).toBe(rootNode);
    expect(filterTree).not.toHaveBeenCalled();
  });

  it("runs filter work for the active surface", () => {
    const rootNode = { id: "root" };
    const filteredNode = { id: "filtered" };
    const filterTree = vi.fn(() => filteredNode);

    const result = filterTreeForActiveSurface({
      activeSurface: "inputs",
      targetSurface: "inputs",
      rootNode,
      query: "brow",
      filterTree,
    });

    expect(filterTree).toHaveBeenCalledWith(rootNode, "brow");
    expect(result).toBe(filteredNode);
  });
});

describe("resolveVisibleRootForActiveSurface", () => {
  it("only filters the active surface tree", () => {
    const variablesRoot = { id: "variables" };
    const posesRoot = { id: "poses" };
    const inputRoot = { id: "inputs" };
    const filterTree = vi.fn((root: { id: string }) => ({
      id: `${root.id}:filtered`,
    }));

    const result = resolveVisibleRootForActiveSurface({
      activeSurface: "variables",
      query: "jaw",
      variablesRootNode: variablesRoot,
      posesRootNode: posesRoot,
      inputRootNode: inputRoot,
      filterTree,
    });

    expect(result).toEqual({ id: "variables:filtered" });
    expect(filterTree).toHaveBeenCalledTimes(1);
    expect(filterTree).toHaveBeenCalledWith(variablesRoot, "jaw");
  });
});
