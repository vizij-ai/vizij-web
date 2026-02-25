import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseDefinition, PoseRigConfigFile } from "../../poseRig/types";
import {
  VariablesPanel,
  filterTreeForActiveSurface,
  formatSurfaceLabelWithCount,
  resolveVisibleRootForActiveSurface,
} from "./VariablesPanel";

const poseRigState = {
  poses: [] as PoseDefinition[],
  applyPose: vi.fn(),
  selectPose: vi.fn(),
  selectedPoseId: null as string | null,
  createPose: vi.fn(),
  duplicatePose: vi.fn(),
  createPoseGroup: vi.fn(),
  renamePoseGroup: vi.fn(),
  deletePoseGroup: vi.fn(),
  deletePose: vi.fn(),
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
  inputValues: {} as Record<string, number>,
  handleInputValueChange: vi.fn(),
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
  inputValues: {} as Record<string, number>,
  bindings: {} as Record<string, unknown>,
  inputBindings: {} as Record<string, unknown>,
  handleInputValueChange: vi.fn(),
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
  setStoreState: vi.fn(),
};

vi.mock("../../state/PoseRigProvider", () => ({
  usePoseRig: () => poseRigState,
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
    poseRigState.selectedPoseId = null;
    poseRigState.applyPose.mockReset();
    poseRigState.selectPose.mockReset();
    poseRigState.createPose.mockReset();
    poseRigState.duplicatePose.mockReset();
    poseRigState.createPoseGroup.mockReset();
    poseRigState.renamePoseGroup.mockReset();
    poseRigState.deletePoseGroup.mockReset();
    poseRigState.deletePose.mockReset();
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
    referenceFaceState.inputValues = {};

    bindingState.managedStandardInputs = [];
    bindingState.lockedInspectorTargetIds = new Set();
    bindingState.standardInputsByPath = new Map();
    bindingState.standardInputsById = new Map();
    bindingState.inputValues = {};
    bindingState.bindings = {};
    bindingState.inputBindings = {};
    bindingState.handleInputValueChange.mockReset();
    bindingState.applyStandardInputBatch.mockReset();
    bindingState.handleCreateCustomStandardInput.mockReset();
    bindingState.handleUpdateStandardInput.mockReset();
    bindingState.handleDeleteCustomStandardInput.mockReset();
    bindingState.handleCloneStandardInputs.mockReset();
    bindingState.handleLinkChildInput.mockReset();
    bindingState.handleCloneStandardInputs.mockImplementation(
      () => new Map<string, string>(),
    );
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

  it("copies a reference variable into main-face variables from toolbar action", () => {
    const referenceOnly = makeInput("ref_brow", "/standard/brow/up", {
      label: "Brow Up",
      defaultValue: 0.25,
      range: { min: 0, max: 1 },
      sourceId: "legacy_ref_brow",
    });
    const created = makeInput("standard_brow_up", "/standard/brow/up", {
      label: "Brow Up",
      defaultValue: 0.25,
      range: { min: 0, max: 1 },
      sourceId: "legacy_ref_brow",
    });

    referenceFaceState.standardInputs = [referenceOnly];
    referenceFaceState.standardInputsById = new Map([
      [referenceOnly.id, referenceOnly],
    ]);
    bindingState.handleCreateCustomStandardInput.mockReturnValue(created);

    const onSelectRig = vi.fn();
    render(<VariablesPanel onSelectRig={onSelectRig} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy Ref (1)" }));

    expect(bindingState.handleCreateCustomStandardInput).toHaveBeenCalledWith(
      "/standard/brow/up",
    );
    expect(bindingState.handleUpdateStandardInput).toHaveBeenCalledWith(
      created.id,
      {
        label: referenceOnly.label,
        defaultValue: referenceOnly.defaultValue,
        range: referenceOnly.range,
        sourceId: referenceOnly.sourceId,
      },
    );
    expect(onSelectRig).toHaveBeenCalledWith(created.id);
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
      },
    );
    expect(bindingState.handleLinkChildInput).toHaveBeenCalledWith(
      parent.id,
      "source_copy",
    );
    expect(bindingState.handleLinkChildInput).toHaveBeenCalledWith(
      "source_copy",
      child.id,
    );
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

  it("clears rig selection when selecting unlinked reference variable", () => {
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

    expect(onSelectRig).toHaveBeenCalledWith(null);
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
    expect(scoped.getByText("pose-weight")).toBeTruthy();
    expect(scoped.getByText("pose:Smile")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Group Output · emotion" } });
    expect(scoped.getByTitle("Group Output · emotion")).toBeTruthy();
    expect(scoped.getByText("group-output")).toBeTruthy();
    expect(
      scoped.getByText("group:emotion; mode:average; poses:0"),
    ).toBeTruthy();
    expect(scoped.getByText("Derived control (read-only)")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Stage Output · Base" } });
    expect(scoped.getByTitle("Stage Output · Base")).toBeTruthy();
    expect(scoped.getByText("stage-output")).toBeTruthy();
    expect(
      scoped.getByText("stage:stage_base; mode:add; sources:group:emotion"),
    ).toBeTruthy();
    expect(scoped.getByText("Derived control (read-only)")).toBeTruthy();

    fireEvent.change(search, { target: { value: "Group Output · emotion" } });
    fireEvent.click(scoped.getByTitle("Group Output · emotion"));
    expect(onSelectRig).not.toHaveBeenCalled();

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
    const view = render(
      <VariablesPanel
        availableSurfaces={["pose-groups"]}
        activeSurfaceOverride="pose-groups"
        onSelectPoseGroup={onSelectPoseGroup}
      />,
    );

    fireEvent.click(within(view.container).getByTitle("emotion"));

    expect(onSelectPoseGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "emotion",
        groupPath: "emotion",
        poseIds: [],
      }),
    );
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

  it("wires multi-stage blend authoring controls on pose-groups surface", () => {
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

    fireEvent.click(
      within(view.container).getAllByRole("button", { name: "Add" })[0]!,
    );
    expect(poseRigState.setBlendStageMode).toHaveBeenCalledWith(
      "stage_base",
      "add",
    );

    fireEvent.click(
      within(view.container).getAllByTitle("Toggle group source viseme")[0]!,
    );
    expect(poseRigState.setBlendStageSources).toHaveBeenCalledWith(
      "stage_base",
      [{ kind: "group", id: "emotion" }],
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

    fireEvent.click(
      within(view.container).getAllByTitle("Toggle group source emotion")[0]!,
    );

    expect(within(view.container).getByRole("alert").textContent).toContain(
      "requires at least one source",
    );
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
