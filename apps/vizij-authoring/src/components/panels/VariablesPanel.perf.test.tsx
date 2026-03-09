import { Profiler } from "react";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseDefinition,
  PoseIrStageSource,
  PoseRigConfigFile,
} from "../../poseRig/types";
import { VariablesPanel } from "./VariablesPanel";

const RIG_INPUT_COUNT = 640;
const POSE_WEIGHT_COUNT = 160;
const POSE_GROUP_COUNT = 20;
const BLEND_STAGE_COUNT = 10;
const PERF_TIMESTAMP = "2026-02-19T00:00:00.000Z";
const RUN_PERF_CAPTURE = process.env.VIZIJ_CAPTURE_PERF === "1";

type ManagedInputEntry = {
  input: StandardRigInput;
  source: "auto" | "preset" | "custom";
  metadata?: { elementType?: string };
  disabled?: boolean;
};

type ProfilerSample = {
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
};

const poseRigState = {
  poses: [] as PoseDefinition[],
  applyPose: vi.fn(),
  selectPose: vi.fn(),
  selectedPoseId: null as string | null,
  createPose: vi.fn(),
  addPoseInput: vi.fn(),
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
  setCrossGroupBlendMode: vi.fn(),
  crossGroupBlendMode: "additive" as const,
  blendMode: "average" as const,
  poseConfigDraft: null as PoseRigConfigFile | null,
};

const referenceFaceState = {
  file: null as File | null,
  isLoaded: false,
  isLoading: false,
  standardInputs: [] as StandardRigInput[],
  standardInputsById: new Map<string, StandardRigInput>(),
  handleInputPathValueChange: vi.fn(),
};

const bindingState = {
  managedStandardInputs: [] as ManagedInputEntry[],
  standardInputsByPath: new Map<string, StandardRigInput>(),
  standardInputsById: new Map<string, StandardRigInput>(),
  inputValues: {} as Record<string, number>,
  handleInputValueChange: vi.fn(),
  handleCreateCustomStandardInput: vi.fn(),
  handleUpdateStandardInput: vi.fn(),
  handleDeleteCustomStandardInput: vi.fn(),
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
}));

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function makeInput(
  id: string,
  path: string,
  label: string,
  overrides?: Partial<StandardRigInput>,
): StandardRigInput {
  return {
    id,
    path,
    label,
    group: "perf",
    defaultValue: 0,
    range: { min: 0, max: 1 },
    ...overrides,
  };
}

function buildDenseScenario() {
  const managedStandardInputs: ManagedInputEntry[] = [];
  const standardInputsByPath = new Map<string, StandardRigInput>();
  const standardInputsById = new Map<string, StandardRigInput>();
  const inputValues: Record<string, number> = {};
  const poses: PoseDefinition[] = [];

  for (let index = 0; index < RIG_INPUT_COUNT; index += 1) {
    const id = `rig_${pad(index, 4)}`;
    const label = `Rig Control ${pad(index, 4)}`;
    const channel = pad(Math.floor(index / 16), 2);
    const track = pad(index % 16, 2);
    const path = `/standard/semio/channel_${channel}/track_${track}/x`;
    const input = makeInput(id, path, label);
    const source: ManagedInputEntry["source"] =
      index % 3 === 0 ? "preset" : index % 3 === 1 ? "custom" : "auto";
    managedStandardInputs.push({ input, source });
    standardInputsByPath.set(path, input);
    standardInputsById.set(id, input);
    inputValues[id] = (index % 10) / 10;
  }

  const poseGroups = Array.from({ length: POSE_GROUP_COUNT }, (_, index) => {
    const id = `group_${pad(index, 2)}`;
    return {
      id,
      name: `Group ${pad(index, 2)}`,
      path: id,
      blendMode: index % 2 === 0 ? "average" : "additive",
    } as const;
  });

  for (let index = 0; index < POSE_WEIGHT_COUNT; index += 1) {
    const poseId = `pose_${pad(index, 3)}`;
    const inputId = `pose_weight_${pad(index, 3)}`;
    const label = `Pose Weight ${pad(index, 3)}`;
    const path = `/poses/${poseId}.weight`;
    const poseInput = makeInput(inputId, path, label, {
      sourceId: `pose-weight:${poseId}`,
    });
    managedStandardInputs.push({ input: poseInput, source: "custom" });
    standardInputsByPath.set(path, poseInput);
    standardInputsById.set(inputId, poseInput);
    inputValues[inputId] = (index % 5) / 5;
    poses.push({
      id: poseId,
      name: `Pose ${pad(index, 3)}`,
      description: "",
      groupIds: [poseGroups[index % poseGroups.length]!.id],
      values: {},
      createdAt: PERF_TIMESTAMP,
      updatedAt: PERF_TIMESTAMP,
    });
  }

  const blendStages: NonNullable<PoseRigConfigFile["blendStages"]> = Array.from(
    { length: BLEND_STAGE_COUNT },
    (_, index) => {
      const stageId = `stage_${pad(index, 2)}`;
      const sources: PoseIrStageSource[] = [
        {
          kind: "group",
          id: poseGroups[index % poseGroups.length]!.id,
        },
      ];
      if (index > 0) {
        sources.push({
          kind: "stage",
          id: `stage_${pad(index - 1, 2)}`,
        });
      }
      return {
        id: stageId,
        name: `Stage ${pad(index, 2)}`,
        mode: index % 2 === 0 ? "average" : "add",
        sources,
      };
    },
  );

  const poseConfigDraft: PoseRigConfigFile = {
    version: 1,
    faceId: "perf-face",
    neutralInputs: {},
    poses,
    poseGroups,
    blendStages,
  };

  return {
    managedStandardInputs,
    standardInputsByPath,
    standardInputsById,
    inputValues,
    poses,
    poseConfigDraft,
    blendStages,
    expectedRowCount:
      managedStandardInputs.length + poseGroups.length + blendStages.length,
  };
}

function roundMetric(value: number): number {
  return Number(value.toFixed(3));
}

function summarizeLatency(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = values.length > 0 ? total / values.length : 0;
  const p95Index =
    values.length > 0
      ? Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1)
      : 0;
  const p95 = sorted[p95Index] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  return {
    average: roundMetric(average),
    p95: roundMetric(p95),
    max: roundMetric(max),
  };
}

describe("VariablesPanel inputs perf baseline", () => {
  beforeEach(() => {
    poseRigState.poses = [];
    poseRigState.poseConfigDraft = null;
    poseRigState.blendStages = [];
    poseRigState.applyPose.mockReset();
    poseRigState.selectPose.mockReset();
    poseRigState.createPose.mockReset();
    poseRigState.addPoseInput.mockReset();
    poseRigState.duplicatePose.mockReset();
    poseRigState.createPoseGroup.mockReset();
    poseRigState.renamePoseGroup.mockReset();
    poseRigState.deletePoseGroup.mockReset();
    poseRigState.deletePose.mockReset();
    poseRigState.createBlendStage.mockReset();
    poseRigState.renameBlendStage.mockReset();
    poseRigState.setBlendStageMode.mockReset();
    poseRigState.deleteBlendStage.mockReset();
    poseRigState.reorderBlendStage.mockReset();
    poseRigState.setBlendStageSources.mockReset();
    poseRigState.addPoseToGroup.mockReset();
    poseRigState.removePoseFromGroup.mockReset();
    poseRigState.setCrossGroupBlendMode.mockReset();

    referenceFaceState.file = null;
    referenceFaceState.isLoaded = false;
    referenceFaceState.isLoading = false;
    referenceFaceState.standardInputs = [];
    referenceFaceState.standardInputsById = new Map();

    bindingState.managedStandardInputs = [];
    bindingState.standardInputsByPath = new Map();
    bindingState.standardInputsById = new Map();
    bindingState.inputValues = {};
    bindingState.handleInputValueChange.mockReset();
    bindingState.handleCreateCustomStandardInput.mockReset();
    bindingState.handleUpdateStandardInput.mockReset();
    bindingState.handleDeleteCustomStandardInput.mockReset();
    authoringUiState.activeEditFocus = "default";
  });

  const perfTest = RUN_PERF_CAPTURE ? it : it.skip;

  perfTest(
    "captures baseline metrics for dense Inputs-pane interactions",
    async () => {
      const scenario = buildDenseScenario();
      bindingState.managedStandardInputs = scenario.managedStandardInputs;
      bindingState.standardInputsByPath = scenario.standardInputsByPath;
      bindingState.standardInputsById = scenario.standardInputsById;
      bindingState.inputValues = scenario.inputValues;
      poseRigState.poses = scenario.poses;
      poseRigState.poseConfigDraft = scenario.poseConfigDraft;
      poseRigState.blendStages = scenario.blendStages;

      const profilerSamples: ProfilerSample[] = [];
      const interactionLatencyMs: number[] = [];
      const onSelectRig = vi.fn();

      const view = render(
        <Profiler
          id="variables-panel-inputs-dense"
          onRender={(_, phase, actualDuration, baseDuration) => {
            profilerSamples.push({
              phase: phase as ProfilerSample["phase"],
              actualDuration,
              baseDuration,
            });
          }}
        >
          <VariablesPanel
            availableSurfaces={["inputs"]}
            activeSurfaceOverride="inputs"
            onSelectRig={onSelectRig}
          />
        </Profiler>,
      );

      const scoped = within(view.container);
      const searchInput = scoped.getByPlaceholderText("Search inputs...");
      expect(
        scoped.getByText(`Inputs (${scenario.expectedRowCount})`),
      ).toBeTruthy();

      const measureSearch = async (query: string, expectedLabel: string) => {
        const start = performance.now();
        fireEvent.change(searchInput, { target: { value: query } });
        await waitFor(() => {
          expect(scoped.getByTitle(expectedLabel)).toBeTruthy();
        });
        interactionLatencyMs.push(performance.now() - start);
      };

      await measureSearch("Rig Control 0500", "Rig Control 0500");

      const clickStart = performance.now();
      fireEvent.click(scoped.getByTitle("Rig Control 0500"));
      await waitFor(() => {
        expect(onSelectRig).toHaveBeenCalledWith("rig_0500");
      });
      interactionLatencyMs.push(performance.now() - clickStart);

      await measureSearch("Pose Weight 075", "Pose Weight 075");
      await measureSearch("Group Output · group_03", "Group Output · group_03");
      await measureSearch("Stage Output · Stage 05", "Stage Output · Stage 05");
      await measureSearch("Rig Control 0007", "Rig Control 0007");

      const latency = summarizeLatency(interactionLatencyMs);
      const updateSamples = profilerSamples.filter(
        (sample) => sample.phase !== "mount",
      );
      const totalActualDuration = profilerSamples.reduce(
        (sum, sample) => sum + sample.actualDuration,
        0,
      );
      const totalUpdateDuration = updateSamples.reduce(
        (sum, sample) => sum + sample.actualDuration,
        0,
      );
      const maxUpdateDuration = updateSamples.reduce(
        (max, sample) => Math.max(max, sample.actualDuration),
        0,
      );
      const maxBaseDuration = profilerSamples.reduce(
        (max, sample) => Math.max(max, sample.baseDuration),
        0,
      );

      expect(interactionLatencyMs).toHaveLength(6);
      expect(updateSamples.length).toBeGreaterThan(0);

      const metrics = {
        timestamp: new Date().toISOString(),
        scenario: {
          rigInputs: RIG_INPUT_COUNT,
          poseWeights: POSE_WEIGHT_COUNT,
          groupOutputs: POSE_GROUP_COUNT,
          stageOutputs: BLEND_STAGE_COUNT,
          totalRows: scenario.expectedRowCount,
          interactions: interactionLatencyMs.length,
        },
        latencyMs: latency,
        profiler: {
          commitsTotal: profilerSamples.length,
          commitsUpdate: updateSamples.length,
          totalActualDurationMs: roundMetric(totalActualDuration),
          updateActualDurationMs: roundMetric(totalUpdateDuration),
          updateMaxDurationMs: roundMetric(maxUpdateDuration),
          maxBaseDurationMs: roundMetric(maxBaseDuration),
        },
      };

      console.log(`[perf][inputs-pane-baseline] ${JSON.stringify(metrics)}`);
    },
    120_000,
  );
});
