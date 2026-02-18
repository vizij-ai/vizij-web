import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { VariablesPanel, filterTreeForActiveSurface } from "./VariablesPanel";

const poseRigState = {
  poses: [],
  applyPose: vi.fn(),
  selectPose: vi.fn(),
  selectedPoseId: null as string | null,
  createPose: vi.fn(),
};

const referenceFaceState = {
  file: { name: "ref.glb" } as File,
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
    metadata?: { elementType?: string };
    disabled?: boolean;
  }>,
  standardInputsByPath: new Map<string, StandardRigInput>(),
  standardInputsById: new Map<string, StandardRigInput>(),
  inputValues: {} as Record<string, number>,
  bindings: {} as Record<string, unknown>,
  inputBindings: {} as Record<string, unknown>,
  handleInputValueChange: vi.fn(),
  handleCreateCustomStandardInput: vi.fn(),
  handleUpdateStandardInput: vi.fn(),
  handleDeleteCustomStandardInput: vi.fn(),
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

    referenceFaceState.file = { name: "ref.glb" } as File;
    referenceFaceState.isLoaded = true;
    referenceFaceState.isLoading = false;
    referenceFaceState.standardInputs = [];
    referenceFaceState.standardInputsById = new Map();
    referenceFaceState.inputValues = {};

    bindingState.managedStandardInputs = [];
    bindingState.standardInputsByPath = new Map();
    bindingState.standardInputsById = new Map();
    bindingState.inputValues = {};
    bindingState.bindings = {};
    bindingState.inputBindings = {};
    bindingState.handleInputValueChange.mockReset();
    bindingState.handleCreateCustomStandardInput.mockReset();
    bindingState.handleUpdateStandardInput.mockReset();
    bindingState.handleDeleteCustomStandardInput.mockReset();
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
      within(view.container).getByPlaceholderText(
        "Search or create variable...",
      ),
      {
        target: { value: "Ref Brow Up" },
      },
    );
    fireEvent.click(within(view.container).getByTitle("Ref Brow Up"));

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
      within(view.container).getByPlaceholderText(
        "Search or create variable...",
      ),
      {
        target: { value: "Ref Brow Up" },
      },
    );
    fireEvent.click(within(view.container).getByTitle("Ref Brow Up"));

    expect(onSelectRig).toHaveBeenCalledWith(null);
  });

  it("shows all standard and autorig inputs on the Inputs surface", () => {
    const abstractInput = makeInput("abstract_jaw", "/mouth/open", {
      label: "Jaw Open",
    });
    const autorigInput = makeInput("autorig_eye", "/autorig/eye/open", {
      label: "Eye Open",
    });
    bindingState.managedStandardInputs = [
      { input: abstractInput, source: "preset" },
      { input: autorigInput, source: "auto" },
    ];
    bindingState.standardInputsByPath = new Map([
      ["/mouth/open", abstractInput],
      ["/autorig/eye/open", autorigInput],
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

  it("requires confirmation before deleting a custom variable", () => {
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
      within(view.container).getByPlaceholderText(
        "Search or create variable...",
      ),
      {
        target: { value: customInput.label },
      },
    );

    fireEvent.click(
      within(view.container).getAllByTitle("Delete variable")[0]!,
    );

    expect(confirmSpy).toHaveBeenCalledWith(
      `Delete custom variable "${customInput.label}"?\n\nThis removes the variable plus linked pose targets and binding routes.`,
    );
    expect(bindingState.handleDeleteCustomStandardInput).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("deletes confirmed custom variables and clears selection", () => {
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
      within(view.container).getByPlaceholderText(
        "Search or create variable...",
      ),
      {
        target: { value: customInput.label },
      },
    );

    fireEvent.click(
      within(view.container).getAllByTitle("Delete variable")[0]!,
    );

    expect(bindingState.handleDeleteCustomStandardInput).toHaveBeenCalledWith(
      customInput.id,
    );
    expect(onSelectRig).toHaveBeenCalledWith(null);
    confirmSpy.mockRestore();
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
