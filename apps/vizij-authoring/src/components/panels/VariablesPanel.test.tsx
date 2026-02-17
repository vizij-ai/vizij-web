import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { VariablesPanel } from "./VariablesPanel";

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
  bindings: {} as Record<string, unknown>,
  inputBindings: {} as Record<string, unknown>,
  handleCreateCustomStandardInput: vi.fn(),
  handleUpdateStandardInput: vi.fn(),
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
    bindingState.bindings = {};
    bindingState.inputBindings = {};
    bindingState.handleCreateCustomStandardInput.mockReset();
    bindingState.handleUpdateStandardInput.mockReset();
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

  it("filters /rig/element rows from Drivers incoming for a selected rig", () => {
    const selectedRig = makeInput("rig_jaw", "/rig/jaw/open", {
      label: "Jaw Open",
    });
    const incomingTarget = makeInput("rig_incoming", "/standard/cheek/open", {
      label: "Cheek Open",
    });
    const metadataTarget = makeInput(
      "rig_incoming_meta",
      "/rig/element/nose/open",
      {
        label: "Nose Open",
      },
    );

    bindingState.managedStandardInputs = [
      {
        input: incomingTarget,
        source: "custom",
      },
      {
        input: metadataTarget,
        source: "custom",
      },
      {
        input: selectedRig,
        source: "custom",
      },
    ];
    bindingState.standardInputsById = new Map([
      [incomingTarget.id, incomingTarget],
      [metadataTarget.id, metadataTarget],
      [selectedRig.id, selectedRig],
    ]);
    bindingState.inputBindings = {
      [incomingTarget.id]: { inputId: selectedRig.id },
      [metadataTarget.id]: { inputId: selectedRig.id },
    };

    render(
      <VariablesPanel
        selectedRigId={selectedRig.id}
        availableSurfaces={["drivers"]}
        activeSurfaceOverride="drivers"
      />,
    );

    expect(screen.getByText("Incoming")).toBeTruthy();
    expect(screen.getByText(incomingTarget.label)).toBeTruthy();
    expect(screen.queryByText(metadataTarget.label)).toBeNull();
  });

  it("hides all Drivers rows when the selected rig id is /rig/element", () => {
    const selectedRig = makeInput("rig_jaw", "/rig/element/jaw/open", {
      label: "Jaw Open",
    });
    const incomingTarget = makeInput("rig_incoming", "/standard/cheek/open", {
      label: "Cheek Open",
    });

    bindingState.managedStandardInputs = [
      {
        input: incomingTarget,
        source: "custom",
      },
      {
        input: selectedRig,
        source: "custom",
      },
    ];
    bindingState.standardInputsById = new Map([
      [incomingTarget.id, incomingTarget],
      [selectedRig.id, selectedRig],
    ]);
    bindingState.inputBindings = {
      [incomingTarget.id]: { inputId: selectedRig.id },
    };
    bindingState.bindings = {
      [incomingTarget.id]: {
        slots: [{ inputId: selectedRig.id, alias: "jaw" }],
      },
    };

    render(
      <VariablesPanel
        selectedRigId={selectedRig.id}
        availableSurfaces={["drivers"]}
        activeSurfaceOverride="drivers"
      />,
    );

    expect(screen.getByText("No driver relationships")).toBeTruthy();
    expect(screen.queryByText(incomingTarget.label)).toBeNull();
  });

  it("filters /rig/element outputs from Drivers outgoing pose rows", () => {
    const poseInput = makeInput("pose_jaw", "/standard/jaw/open", {
      label: "Jaw Open",
    });
    const poseMetadataInput = makeInput("pose_meta", "/rig/element/eye/open", {
      label: "Eye Open",
    });

    poseRigState.poses = [
      {
        id: "pose-1",
        name: "Smile",
        values: {
          [poseInput.id]: 0.4,
          [poseMetadataInput.id]: 0.7,
        },
        group: null,
      },
    ];
    poseRigState.selectedPoseId = "pose-1";
    bindingState.standardInputsById = new Map([
      [poseInput.id, poseInput],
      [poseMetadataInput.id, poseMetadataInput],
    ]);

    render(
      <VariablesPanel
        selectedPoseId="pose-1"
        availableSurfaces={["drivers"]}
        activeSurfaceOverride="drivers"
      />,
    );

    expect(screen.getByText("Outgoing")).toBeTruthy();
    expect(screen.getByText(poseInput.label)).toBeTruthy();
    expect(screen.queryByText(poseMetadataInput.label)).toBeNull();
  });
});
