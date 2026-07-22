import { act, useCallback, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createRoot } from "react-dom/client";
import type { GraphSpec } from "@vizij/node-graph";
import type { StandardRigInput } from "@vizij/utils";
import {
  createGraphRuntimeStore,
  GraphRuntimeStoreProvider,
} from "../state/graphRuntimeStore";
import {
  createBindingAuthoringStore,
  BindingAuthoringStoreProvider,
} from "../state/bindingAuthoringStore";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
} from "./types";
import {
  usePoseRigAuthoring,
  type UsePoseRigAuthoringResult,
} from "./usePoseRigAuthoring";
import { PoseRigStoreProvider, createPoseRigStore } from "./store";

// Silence React's act environment warning for the custom hook harness.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface RenderOptions {
  faceId: string | null;
  rootId: string | null;
  standardInputs: StandardRigInput[];
  inputValues: Record<string, number>;
}

interface RenderedHook {
  result: { current: UsePoseRigAuthoringResult | null };
  rerender: (next: RenderOptions) => void;
  unmount: () => void;
}

function createStandardInput(
  id: string,
  options?: Partial<StandardRigInput>,
): StandardRigInput {
  return {
    id,
    label: options?.label ?? id,
    path: options?.path ?? `/${id}`,
    group: options?.group ?? "/",
    defaultValue: options?.defaultValue ?? 0,
    range: options?.range ?? { min: -1, max: 1 },
  };
}

function buildRecordValue(values: Record<string, number>) {
  return {
    record: {
      values: {
        record: Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, { float: value }]),
        ),
      },
    },
  };
}

function createPoseGraphSpec(
  poses: Record<string, Record<string, number>>,
  neutralOverrides?: Record<string, number>,
): GraphSpec {
  const neutralFields: Record<string, number> = {
    smile: 0,
    brow_raise: 0,
    ...(neutralOverrides ?? {}),
  };
  const poseNodes = Object.entries(poses).map(([slug, values]) => ({
    id: `pose_record_${slug}`,
    type: "constant" as const,
    params: {
      value: buildRecordValue(values),
    },
  }));
  const poseInputs = Object.keys(poses).map((slug) => ({
    id: `pose_${slug}`,
    type: "input" as const,
    params: {
      path: `rig/face/poses/${slug}.weight`,
    },
  }));
  return {
    nodes: [
      {
        id: "pose_neutral_record",
        type: "constant",
        params: {
          value: buildRecordValue(neutralFields),
        },
      },
      ...poseNodes,
      ...poseInputs,
    ],
  };
}

function renderPoseRigHook(options: RenderOptions): RenderedHook {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = { current: null as UsePoseRigAuthoringResult | null };
  const graphStore = createGraphRuntimeStore({
    faceId: options.faceId ?? "face",
    faceSegment: options.faceId ?? "face",
  });
  const bindingStore = createBindingAuthoringStore({
    standardInputs: options.standardInputs,
    standardInputsById: new Map(
      options.standardInputs.map((input) => [input.id, input]),
    ),
    inputValues: options.inputValues,
  });
  const graphStoreRef = { current: graphStore };
  const bindingStoreRef = { current: bindingStore };
  const poseRigStore = createPoseRigStore({
    faceId: options.faceId,
    standardInputs: options.standardInputs,
    isReady: Boolean(options.rootId && options.standardInputs.length > 0),
  });
  const poseRigStoreRef = { current: poseRigStore };

  function Harness({ opts }: { opts: RenderOptions }): ReactElement | null {
    const [inputValues, setInputValues] = useState(opts.inputValues);
    useEffect(() => {
      setInputValues(opts.inputValues);
    }, [opts.inputValues]);

    const handleInputValueChange = useCallback(
      (inputId: string, value: number) => {
        setInputValues((prev) => ({
          ...prev,
          [inputId]: value,
        }));
      },
      [],
    );

    const applyBatch = useCallback(
      (
        updates: Record<string, number>,
        applyOptions?: { replace?: boolean },
      ) => {
        setInputValues((prev) => {
          if (applyOptions?.replace) {
            return { ...updates };
          }
          return { ...prev, ...updates };
        });
      },
      [],
    );

    useEffect(() => {
      graphStoreRef.current.setState({
        faceId: opts.faceId ?? "face",
        faceSegment: opts.faceId ?? "face",
      });
      bindingStoreRef.current.setState({
        standardInputs: opts.standardInputs,
        standardInputsById: new Map(
          opts.standardInputs.map((input) => [input.id, input]),
        ),
        inputValues,
      });
    }, [opts.faceId, opts.standardInputs, inputValues]);

    const poseRig = usePoseRigAuthoring({
      faceId: opts.faceId,
      rootId: opts.rootId,
      standardInputs: opts.standardInputs,
      inputValues,
      onInputValueChange: handleInputValueChange,
      applyInputBatch: applyBatch,
    });

    result.current = poseRig;
    return null;
  }

  act(() => {
    root.render(
      <GraphRuntimeStoreProvider store={graphStore}>
        <BindingAuthoringStoreProvider store={bindingStore}>
          <PoseRigStoreProvider store={poseRigStore}>
            <Harness opts={options} />
          </PoseRigStoreProvider>
        </BindingAuthoringStoreProvider>
      </GraphRuntimeStoreProvider>,
    );
  });

  return {
    result,
    rerender(next) {
      act(() => {
        root.render(
          <GraphRuntimeStoreProvider store={graphStoreRef.current}>
            <BindingAuthoringStoreProvider store={bindingStoreRef.current}>
              <PoseRigStoreProvider store={poseRigStoreRef.current}>
                <Harness opts={next} />
              </PoseRigStoreProvider>
            </BindingAuthoringStoreProvider>
          </GraphRuntimeStoreProvider>,
        );
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

const baseInputs: StandardRigInput[] = [
  createStandardInput("smile", {
    label: "Smile",
    path: "/face/smile",
  }),
  createStandardInput("brow_raise", {
    label: "Brow Raise",
    path: "/face/brow_raise",
  }),
];

describe("usePoseRigAuthoring", () => {
  let hook: RenderedHook | null = null;

  beforeEach(() => {
    hook = renderPoseRigHook({
      faceId: "face",
      rootId: "root",
      standardInputs: baseInputs,
      inputValues: {
        smile: 0,
        brow_raise: 0,
      },
    });
  });

  afterEach(() => {
    hook?.unmount();
    hook = null;
  });

  it("captures current values into a pose and duplicates it", () => {
    const { result } = hook!;
    expect(result.current?.ready).toBe(true);
    expect(result.current?.poses).toHaveLength(0);

    act(() => {
      result.current?.createPose();
    });

    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_1");

    act(() => {
      result.current?.updateCurrentValue("smile", 0.7);
      result.current?.updateCurrentValue("brow_raise", -0.25);
    });

    act(() => {
      if (poseId) {
        result.current?.capturePose(poseId);
      }
    });

    const capturedPose = result.current?.poses.find(
      (pose) => pose.id === poseId,
    );
    expect(capturedPose?.values).toEqual({
      smile: 0.7,
      brow_raise: -0.25,
    });

    act(() => {
      if (poseId) {
        result.current?.duplicatePose(poseId);
      }
    });

    expect(result.current?.poses).toHaveLength(2);
    const [original, duplicate] = result.current?.poses ?? [];
    expect(duplicate?.id).toBe("pose_1_copy");
    expect(duplicate?.id).not.toEqual(original?.id);
    expect(duplicate?.name).toContain("Copy");
    expect(duplicate?.values).toEqual(original?.values);
  });

  it("reflects target edits in pose state and preview application", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Editable Pose");
    });
    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_editable_pose");

    act(() => {
      if (poseId) {
        result.current?.updatePoseValue(poseId, "smile", 0.42);
      }
    });

    const updatedPose = result.current?.poses.find(
      (pose) => pose.id === poseId,
    );
    expect(updatedPose?.values.smile).toBeCloseTo(0.42, 6);

    act(() => {
      if (poseId) {
        result.current?.applyPose(poseId);
      }
    });

    expect(result.current?.currentValues.smile).toBeCloseTo(0.42, 6);
  });

  it("can replace a pose target set in place for overwrite flows", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Overwrite Pose");
    });
    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_overwrite_pose");
    if (!poseId) {
      return;
    }

    act(() => {
      result.current?.addPoseInput(poseId, "smile");
      result.current?.setPoseInputComposeMode(poseId, "smile", "average");
      result.current?.updatePoseValue(poseId, "smile", 0.42);
    });

    act(() => {
      result.current?.replacePoseTargets(poseId, { brow_raise: -0.3 });
    });

    const updatedPose = result.current?.poses.find(
      (pose) => pose.id === poseId,
    );
    expect(updatedPose?.values).toEqual({ brow_raise: -0.3 });
    expect(updatedPose?.composeModes).toBeUndefined();
    expect(updatedPose?.group).toBe("default");
  });

  it("covers MVP pose authoring lifecycle with group assignment and preview", () => {
    const { result } = hook!;

    act(() => {
      result.current?.createPose("Smoke Pose");
    });

    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_smoke_pose");

    act(() => {
      if (poseId) {
        result.current?.addPoseInput(poseId, "smile");
        result.current?.updatePoseValue(poseId, "smile", 0.55);
        result.current?.updatePoseGroup(poseId, "emotion/primary");
      }
    });

    act(() => {
      if (poseId) {
        result.current?.duplicatePose(poseId);
      }
    });

    const duplicateId = result.current?.poses[1]?.id;
    expect(duplicateId).toBe("pose_smoke_pose_copy");

    act(() => {
      if (duplicateId) {
        result.current?.updatePoseValue(duplicateId, "smile", 0.9);
        result.current?.applyPose(duplicateId);
      }
    });

    expect(result.current?.poses).toHaveLength(2);
    expect(
      result.current?.poses.find((pose) => pose.id === poseId)?.values.smile,
    ).toBeCloseTo(0.55, 6);
    expect(
      result.current?.poses.find((pose) => pose.id === duplicateId)?.values
        .smile,
    ).toBeCloseTo(0.9, 6);
    expect(
      result.current?.poses.find((pose) => pose.id === poseId)?.group,
    ).toBe("emotion/primary");
    expect(result.current?.currentValues.smile).toBeCloseTo(0.9, 6);

    const poseInputPaths = (result.current?.poseGraphSpec?.nodes ?? [])
      .filter((node: unknown) => (node as { type?: string }).type === "input")
      .map(
        (node: unknown) =>
          (node as { params?: { path?: string } }).params?.path,
      );
    expect(poseInputPaths).toEqual(
      expect.arrayContaining([
        "rig/face/poses/pose_smoke_pose.weight",
        "rig/face/poses/pose_smoke_pose_copy.weight",
      ]),
    );
    expect(result.current?.poseConfigDraft?.poses).toHaveLength(2);
    expect(result.current?.poseIrDraft?.poses).toHaveLength(2);
  });

  it("does not create ghost pose targets for unknown input ids", () => {
    const { result } = hook!;

    act(() => {
      result.current?.createPose("Ghost Guard");
    });

    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_ghost_guard");

    act(() => {
      if (poseId) {
        result.current?.addPoseInput(poseId, "ghost_input");
      }
    });

    const pose = result.current?.poses.find((entry) => entry.id === poseId);
    expect(pose?.values).toEqual({});
    expect(result.current?.standardInputs.map((input) => input.id)).toEqual([
      "smile",
      "brow_raise",
    ]);
    expect(result.current?.poseConfigDraft?.poses[0]?.values).toEqual({});
  });

  it("defaults compose mode to add for added channels and supports per-channel updates", () => {
    const { result } = hook!;

    act(() => {
      result.current?.createPose("Compose Mode Pose");
    });
    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_compose_mode_pose");
    if (!poseId) {
      return;
    }

    act(() => {
      result.current?.addPoseInput(poseId, "smile");
    });
    expect(result.current?.poses[0]?.composeModes).toEqual({ smile: "add" });
    expect(result.current?.poseConfigDraft?.poses[0]?.composeModes).toEqual({
      smile: "add",
    });
    expect(result.current?.poseIrDraft?.poses[0]?.composeModes).toEqual({
      smile: "add",
    });

    act(() => {
      result.current?.setPoseInputComposeMode(poseId, "smile", "average");
    });
    expect(result.current?.poses[0]?.composeModes).toEqual({
      smile: "average",
    });

    act(() => {
      result.current?.removePoseInput(poseId, "smile");
    });
    expect(result.current?.poses[0]?.values).toEqual({});
    expect(result.current?.poses[0]?.composeModes).toBeUndefined();
  });

  it("imports pose config and reports warnings for missing inputs", async () => {
    const { result } = hook!;

    const payload = {
      version: 1 as const,
      faceId: "archived_face",
      title: "legacy rig",
      neutralInputs: {
        smile: 0.35,
        missing_input: 1,
      },
      poses: [
        {
          id: "pose_a",
          name: "Legacy Pose",
          description: "",
          values: {
            smile: 0.8,
            missing_input: 0.9,
          },
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    };

    const file = {
      text: async () => JSON.stringify(payload),
    } as unknown as File;

    await act(async () => {
      await result.current?.importPoseConfig(file);
    });

    expect(result.current?.poseConfigWarnings).toEqual([
      'Imported pose rig targets face "archived_face", current face "face".',
      'Neutral value for missing input "missing_input" was ignored.',
      'Pose "Legacy Pose" references missing input "missing_input" and was pruned.',
    ]);
    expect(
      result.current?.poseDiagnostics.every(
        (diagnostic) => diagnostic.severity === "warning",
      ),
    ).toBe(true);
    expect(
      result.current?.poseDiagnostics.some(
        (diagnostic) => diagnostic.code === "legacy-config-warning",
      ),
    ).toBe(true);

    expect(result.current?.savedNeutral).toEqual({
      smile: 0.35,
      brow_raise: 0,
    });

    expect(result.current?.currentValues.smile).toBeCloseTo(0.35, 5);

    expect(result.current?.poses).toHaveLength(1);
    const importedPose = result.current?.poses[0];
    expect(importedPose?.values).toEqual({
      smile: 0.8,
    });
  });

  it("propagates pose config import errors", async () => {
    const { result } = hook!;
    const invalidFile = {
      text: async () => "{invalid_json",
    } as unknown as File;

    await act(async () => {
      const importPromise = result.current?.importPoseConfig(invalidFile);
      expect(importPromise).toBeTruthy();
      await expect(importPromise).rejects.toThrow(/Pose config import failed/);
    });
    expect(result.current?.poseDiagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        source: "pose-config",
        code: "import-failed",
      }),
    ]);
  });

  it("exposes pose IR draft and supports IR file naming", () => {
    const { result } = hook!;
    expect(result.current?.poseIrDraft).toBeTruthy();
    expect(result.current?.poseIrFileName).toBe("");

    act(() => {
      result.current?.setPoseIrFileName("pose_ir.json");
    });

    expect(result.current?.poseIrFileName).toBe("pose_ir.json");
  });

  it("imports pose IR payloads through poseRig layer", () => {
    const { result } = hook!;

    act(() => {
      result.current?.importPoseIrFromData({
        version: 1,
        faceId: "face",
        rigKind: "face-specific",
        title: "IR Import",
        contracts: {
          targetIds: POSE_IR_TARGETING_CONTRACT,
          syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
        },
        neutral: {
          mode: "explicit",
          values: { smile: 0.1 },
        },
        crossGroupPolicy: { mode: "average" },
        groups: [
          {
            id: "emotion",
            name: "Emotion",
            path: "emotion",
            intraGroupBlendMode: "average",
            poseIds: ["pose_smile"],
          },
        ],
        poses: [
          {
            id: "pose_smile",
            name: "Smile",
            groupIds: ["emotion"],
            targets: { smile: 0.8 },
            createdAt: "now",
            updatedAt: "now",
          },
        ],
      });
    });

    expect(result.current?.rigName).toBe("IR Import");
    expect(result.current?.poses[0]).toMatchObject({
      id: "pose_smile",
      values: { smile: 0.8 },
      groupIds: ["emotion"],
    });
    expect(result.current?.poseIrDraft?.poses[0]?.targets).toEqual({
      smile: 0.8,
    });
  });

  it("propagates pose IR import errors", async () => {
    const { result } = hook!;
    const invalidFile = {
      text: async () => "{invalid_json",
    } as unknown as File;

    await act(async () => {
      const importPromise = result.current?.importPoseIr(invalidFile);
      expect(importPromise).toBeTruthy();
      await expect(importPromise).rejects.toThrow(/Pose IR import failed/);
    });
    expect(result.current?.poseDiagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        source: "pose-ir",
        code: "import-failed",
      }),
    ]);
  });

  it("allows assigning pose groups that persist into the config draft", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Joy");
    });
    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBeTruthy();
    act(() => {
      if (poseId) {
        result.current?.updatePoseGroup(poseId, "Emotions");
      }
    });
    const pose = result.current?.poses[0];
    expect(pose?.group).toBe("Emotions");
    expect(result.current?.poseConfigDraft?.poses[0]?.group).toBe("Emotions");
  });

  it("uses the default group instead of inheriting the selected pose group", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Grouped Pose");
    });
    const groupedPoseId = result.current?.poses[0]?.id;
    expect(groupedPoseId).toBeTruthy();

    act(() => {
      if (!groupedPoseId) {
        return;
      }
      result.current?.updatePoseGroup(groupedPoseId, "emotion/primary");
      result.current?.selectPose(groupedPoseId);
    });

    act(() => {
      result.current?.createPose("Fresh Pose");
    });

    const freshPose = result.current?.poses.find(
      (pose) => pose.name === "Fresh Pose",
    );
    expect(freshPose?.group).toBe("default");
    expect(freshPose?.groupIds).toEqual(["default"]);

    act(() => {
      if (!groupedPoseId) {
        return;
      }
      result.current?.selectPose(groupedPoseId);
      result.current?.createPoseFromSnapshot("Snapshot Pose");
    });

    const snapshotPose = result.current?.poses.find(
      (pose) => pose.name === "Snapshot Pose",
    );
    expect(snapshotPose?.group).toBe("default");
    expect(snapshotPose?.groupIds).toEqual(["default"]);
  });

  it("uses the configured default group for new poses instead of the selected pose group", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPoseGroup("default");
      result.current?.createPoseGroup("emotion/primary");
      result.current?.createPose("Grouped Pose");
    });

    const groupedPoseId = result.current?.poses.find(
      (pose) => pose.name === "Grouped Pose",
    )?.id;
    const defaultGroupId = result.current?.poseConfigDraft?.poseGroups?.find(
      (group) => group.path === "default",
    )?.id;
    expect(groupedPoseId).toBeTruthy();
    expect(defaultGroupId).toBeTruthy();

    act(() => {
      if (!groupedPoseId) {
        return;
      }
      result.current?.updatePoseGroup(groupedPoseId, "emotion/primary");
      result.current?.selectPose(groupedPoseId);
    });

    act(() => {
      result.current?.createPose("Default Group Pose");
    });

    const defaultGroupPose = result.current?.poses.find(
      (pose) => pose.name === "Default Group Pose",
    );
    expect(defaultGroupPose?.group).toBe("default");
    expect(defaultGroupPose?.groupId).toBe(defaultGroupId);
    expect(defaultGroupPose?.groupIds).toEqual([defaultGroupId]);

    act(() => {
      if (!groupedPoseId) {
        return;
      }
      result.current?.selectPose(groupedPoseId);
      result.current?.createPoseFromSnapshot("Default Group Snapshot");
    });

    const defaultGroupSnapshotPose = result.current?.poses.find(
      (pose) => pose.name === "Default Group Snapshot",
    );
    expect(defaultGroupSnapshotPose?.group).toBe("default");
    expect(defaultGroupSnapshotPose?.groupId).toBe(defaultGroupId);
    expect(defaultGroupSnapshotPose?.groupIds).toEqual([defaultGroupId]);
  });

  it("batch assigns pose groups across multiple poses", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Pose A");
      result.current?.createPose("Pose B");
    });
    const ids = result.current?.poses.map((pose) => pose.id) ?? [];
    expect(ids).toHaveLength(2);

    act(() => {
      result.current?.updatePoseGroupBatch(ids, "Phonemes");
    });

    result.current?.poses.forEach((pose) => {
      expect(pose.group).toBe("Phonemes");
    });
  });

  it("supports pose-group lifecycle with deterministic ids and persisted memberships", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Pose A");
      result.current?.createPose("Pose B");
      result.current?.createPoseGroup("emotion/primary");
    });

    const poseIds = result.current?.poses.map((pose) => pose.id) ?? [];
    expect(poseIds).toHaveLength(2);

    const createdGroup = result.current?.poseConfigDraft?.poseGroups?.find(
      (group) => group.path === "emotion/primary",
    );
    expect(createdGroup?.id).toBe("emotion_primary");

    act(() => {
      result.current?.updatePoseGroupBatch(poseIds, "emotion/primary");
    });

    result.current?.poses.forEach((pose) => {
      expect(pose.group).toBe("emotion/primary");
      expect(pose.groupId).toBe(createdGroup?.id);
      expect(pose.groupIds).toEqual([createdGroup?.id]);
    });
    result.current?.poseConfigDraft?.poses.forEach((pose) => {
      expect(pose.group).toBe("emotion/primary");
      expect(pose.groupId).toBe(createdGroup?.id);
      expect(pose.groupIds).toEqual([createdGroup?.id]);
    });

    act(() => {
      if (createdGroup?.id) {
        result.current?.renamePoseGroup(createdGroup.id, "emotion/lead");
      }
    });

    const renamedGroup = result.current?.poseConfigDraft?.poseGroups?.find(
      (group) => group.id === createdGroup?.id,
    );
    expect(renamedGroup?.path).toBe("emotion/lead");
    result.current?.poses.forEach((pose) => {
      expect(pose.group).toBe("emotion/lead");
      expect(pose.groupId).toBe(createdGroup?.id);
    });

    act(() => {
      if (createdGroup?.id) {
        result.current?.deletePoseGroup(createdGroup.id);
      }
    });

    expect(
      result.current?.poseConfigDraft?.poseGroups?.some(
        (group) => group.id === createdGroup?.id,
      ),
    ).toBe(false);
    result.current?.poses.forEach((pose) => {
      expect(pose.group).toBeNull();
      expect(pose.groupId).toBeNull();
    });
  });

  it("preserves many-to-many memberships when adding/removing groups in hook actions", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Pose A");
      result.current?.createPoseGroup("emotion/primary");
      result.current?.createPoseGroup("viseme/main");
    });

    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBeTruthy();

    act(() => {
      if (poseId) {
        result.current?.addPoseToGroup(poseId, "viseme/main");
        result.current?.addPoseToGroup(poseId, "emotion/primary");
        result.current?.addPoseToGroup(poseId, "emotion/primary");
      }
    });

    const assigned = result.current?.poses.find((pose) => pose.id === poseId);
    expect(assigned?.groupIds).toEqual(["emotion_primary", "viseme_main"]);
    expect(assigned?.groupId).toBe("emotion_primary");
    expect(assigned?.group).toBe("emotion/primary");
    expect(result.current?.poseConfigDraft?.poses[0]?.groupIds).toEqual([
      "emotion_primary",
      "viseme_main",
    ]);

    act(() => {
      if (poseId) {
        result.current?.removePoseFromGroup(poseId, "emotion/primary");
      }
    });

    const afterRemoval = result.current?.poses.find(
      (pose) => pose.id === poseId,
    );
    expect(afterRemoval?.groupIds).toEqual(["viseme_main"]);
    expect(afterRemoval?.groupId).toBe("viseme_main");
    expect(afterRemoval?.group).toBe("viseme/main");
    expect(result.current?.poseConfigDraft?.poses[0]?.groupIds).toEqual([
      "viseme_main",
    ]);
  });

  it("reuses the same configured group identity across assign/unassign cycles", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Pose A");
      result.current?.createPose("Pose B");
      result.current?.createPoseGroup("viseme/main");
    });

    const poseIds = result.current?.poses.map((pose) => pose.id) ?? [];
    const targetGroup = result.current?.poseConfigDraft?.poseGroups?.find(
      (group) => group.path === "viseme/main",
    );
    expect(targetGroup?.id).toBe("viseme_main");

    act(() => {
      result.current?.updatePoseGroupBatch(poseIds, "viseme/main");
    });

    const firstPoseId = poseIds[0];
    expect(firstPoseId).toBeTruthy();
    act(() => {
      if (firstPoseId) {
        result.current?.updatePoseGroup(firstPoseId, null);
      }
    });

    const unassignedPose = result.current?.poses.find(
      (pose) => pose.id === firstPoseId,
    );
    expect(unassignedPose?.group).toBeNull();
    expect(unassignedPose?.groupId).toBeNull();
    expect(unassignedPose?.groupIds).toEqual([]);

    act(() => {
      if (firstPoseId) {
        result.current?.updatePoseGroup(firstPoseId, "viseme/main");
      }
    });

    const reassignedPose = result.current?.poses.find(
      (pose) => pose.id === firstPoseId,
    );
    expect(reassignedPose?.group).toBe("viseme/main");
    expect(reassignedPose?.groupId).toBe(targetGroup?.id);
    expect(reassignedPose?.groupIds).toEqual([targetGroup?.id]);
    expect(
      result.current?.poseConfigDraft?.poseGroups?.filter(
        (group) => group.path === "viseme/main",
      ),
    ).toHaveLength(1);
  });

  it("reassigns imported grouped poses even when legacy groupId is present", () => {
    const { result } = hook!;
    act(() => {
      result.current?.importPoseConfigFromData({
        version: 1,
        faceId: "face",
        neutralInputs: { smile: 0, brow_raise: 0 },
        poseGroups: [
          { id: "emotion", name: "Emotion", path: "emotion" },
          { id: "viseme", name: "Viseme", path: "viseme" },
        ],
        poses: [
          {
            id: "pose_smile",
            name: "Smile",
            group: "emotion",
            groupId: "emotion",
            values: { smile: 0.5 },
            createdAt: "now",
            updatedAt: "now",
          },
        ],
      });
    });

    const poseId = result.current?.poses[0]?.id;
    expect(poseId).toBe("pose_smile");
    expect(result.current?.poseConfigDraft?.poses[0]?.group).toBe("emotion");

    act(() => {
      if (poseId) {
        result.current?.updatePoseGroup(poseId, "viseme");
      }
    });

    expect(result.current?.poses[0]?.group).toBe("viseme");
    expect(result.current?.poses[0]?.groupId).toBe("viseme");
    expect(result.current?.poses[0]?.groupIds).toEqual(["viseme"]);
    expect(result.current?.poseConfigDraft?.poses[0]?.group).toBe("viseme");
    expect(result.current?.poseConfigDraft?.poses[0]?.groupId).toBe("viseme");
    expect(result.current?.poseConfigDraft?.poses[0]?.groupIds).toEqual([
      "viseme",
    ]);
  });

  it("supports blend-stage authoring actions and projects updated graph output", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPoseGroup("emotion");
      result.current?.createPoseGroup("viseme");
      result.current?.createPose("Pose A");
      result.current?.createPose("Pose B");
    });

    const poseIds = result.current?.poses.map((pose) => pose.id) ?? [];
    expect(poseIds).toHaveLength(2);
    const firstPoseId = poseIds[0];
    const secondPoseId = poseIds[1];
    expect(firstPoseId).toBeTruthy();
    expect(secondPoseId).toBeTruthy();
    if (!firstPoseId || !secondPoseId) {
      return;
    }

    act(() => {
      result.current?.updatePoseGroup(firstPoseId, "emotion");
      result.current?.addPoseInput(firstPoseId, "smile");
      result.current?.updatePoseValue(firstPoseId, "smile", 0.8);

      result.current?.updatePoseGroup(secondPoseId, "viseme");
      result.current?.addPoseInput(secondPoseId, "smile");
      result.current?.updatePoseValue(secondPoseId, "smile", 0.4);
    });

    act(() => {
      result.current?.createBlendStage("stage_base");
      result.current?.setBlendStageSources("stage_base", [
        { kind: "group", id: "emotion" },
        { kind: "group", id: "viseme" },
      ]);
    });

    expect(
      result.current?.poseGraphSpec?.nodes.some(
        (node: { id: string }) =>
          node.id === "pose_stage_smile_1_stage_base_apply",
      ),
    ).toBe(true);

    act(() => {
      result.current?.setBlendStageMode("stage_base", "average");
    });

    expect(
      result.current?.poseGraphSpec?.nodes.some(
        (node: { id: string }) =>
          node.id === "pose_stage_smile_1_stage_base_overlay",
      ),
    ).toBe(true);
    expect(
      result.current?.poseGraphSpec?.nodes.some(
        (node: { id: string }) =>
          node.id === "pose_stage_smile_1_stage_base_apply",
      ),
    ).toBe(false);

    act(() => {
      result.current?.renameBlendStage("stage_base", "Base Layer");
      result.current?.createBlendStage("stage_final");
      result.current?.setBlendStageSources("stage_final", [
        { kind: "stage", id: "stage_base" },
        { kind: "group", id: "viseme" },
      ]);
      result.current?.createBlendStage("stage_cleanup");
      result.current?.reorderBlendStage(2, 1);
    });

    expect(result.current?.blendStages.map((stage) => stage.id)).toEqual([
      "stage_base",
      "stage_cleanup",
      "stage_final",
    ]);
    expect(result.current?.blendStages[0]?.name).toBe("Base Layer");

    act(() => {
      result.current?.deleteBlendStage("stage_cleanup");
    });
    expect(result.current?.blendStages.map((stage) => stage.id)).toEqual([
      "stage_base",
      "stage_final",
    ]);
  });

  it("exposes scoped neutral source actions and applies set/clear updates", () => {
    const { result } = hook!;

    expect(typeof result.current?.setPoseGroupNeutralSource).toBe("function");
    expect(typeof result.current?.clearPoseGroupNeutralSource).toBe("function");
    expect(typeof result.current?.setBlendStageNeutralSource).toBe("function");
    expect(typeof result.current?.clearBlendStageNeutralSource).toBe(
      "function",
    );

    act(() => {
      result.current?.createPoseGroup("emotion");
      result.current?.createBlendStage("stage_base");
      result.current?.setPoseGroupNeutralSource("emotion", {
        sourceType: "direct-values",
        values: { smile: 0.2 },
      });
      result.current?.setBlendStageNeutralSource("stage_base", {
        sourceType: "inherit",
      });
    });

    expect(
      result.current?.poseConfigDraft?.poseGroups?.find(
        (group) => group.id === "emotion",
      )?.neutral,
    ).toEqual({
      sourceType: "direct-values",
      values: { smile: 0.2 },
    });
    expect(
      result.current?.blendStages.find((stage) => stage.id === "stage_base")
        ?.neutral,
    ).toEqual({
      sourceType: "inherit",
    });

    act(() => {
      result.current?.clearPoseGroupNeutralSource("emotion");
      result.current?.clearBlendStageNeutralSource("stage_base");
    });

    expect(
      result.current?.poseConfigDraft?.poseGroups?.find(
        (group) => group.id === "emotion",
      )?.neutral,
    ).toBeUndefined();
    expect(
      result.current?.blendStages.find((stage) => stage.id === "stage_base")
        ?.neutral,
    ).toBeUndefined();
  });

  it("blocks invalid blend-stage topology edits from hook actions", () => {
    const { result } = hook!;

    act(() => {
      result.current?.createPoseGroup("emotion");
      result.current?.createPoseGroup("viseme");
      result.current?.createBlendStage("stage_a");
      result.current?.createBlendStage("stage_b");
      result.current?.setBlendStageSources("stage_b", [
        { kind: "stage", id: "stage_a" },
      ]);
    });

    const expected = [
      {
        id: "stage_a",
        name: "stage_a",
        mode: "add",
        sources: [{ kind: "group", id: "emotion" }],
      },
      {
        id: "stage_b",
        name: "stage_b",
        mode: "add",
        sources: [{ kind: "stage", id: "stage_a" }],
      },
    ];
    expect(result.current?.blendStages).toEqual(expected);

    act(() => {
      result.current?.setBlendStageSources("stage_a", [
        { kind: "stage", id: "stage_b" },
      ]);
      result.current?.setBlendStageSources("stage_b", [
        { kind: "stage", id: "stage_b" },
      ]);
      result.current?.setBlendStageSources("stage_b", [
        { kind: "stage", id: "missing_stage" },
      ]);
      result.current?.setBlendStageSources("stage_b", [
        { kind: "group", id: "missing_group" },
      ]);
      result.current?.setBlendStageSources("stage_b", [
        { kind: "stage", id: "stage_a" },
        { kind: "stage", id: "stage_a" },
      ]);
      result.current?.setBlendStageSources("stage_b", []);
      result.current?.deleteBlendStage("stage_a");
      result.current?.reorderBlendStage(1, 0);
    });

    expect(result.current?.blendStages).toEqual(expected);
  });

  it("appends imported poses instead of overwriting existing ones", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Base Pose");
    });
    const existingIds = result.current?.poses.map((pose) => pose.id) ?? [];
    const spec = createPoseGraphSpec({
      pose_imported: {
        smile: 0.5,
      },
    });

    act(() => {
      result.current?.importPoseGraphSpec(spec, { rigName: "imported" });
    });

    expect(result.current?.poses).toHaveLength(existingIds.length + 1);
    existingIds.forEach((id) => {
      expect(result.current?.poses?.some((pose) => pose.id === id)).toBe(true);
    });
    const imported = result.current?.poses?.find(
      (pose) => pose.id && !existingIds.includes(pose.id),
    );
    expect(imported?.id).toBe("pose_imported");
    expect(imported?.values).toEqual({
      smile: 0.5,
    });
  });

  it("renames imported poses when ids collide", () => {
    const { result } = hook!;
    act(() => {
      result.current?.createPose("Original");
    });
    const existingId = result.current?.poses[0]?.id;
    expect(existingId).toBeTruthy();
    const spec = createPoseGraphSpec({
      [existingId as string]: {
        brow_raise: -0.3,
      },
    });

    act(() => {
      result.current?.importPoseGraphSpec(spec);
    });

    const duplicates = result.current?.poses?.filter((pose) =>
      pose.id.startsWith(existingId as string),
    );
    expect(duplicates?.length ?? 0).toBe(2);
    const imported = duplicates?.find((pose) => pose.id !== existingId);
    expect(imported?.id).toBe(`${existingId}_2`);
    expect(imported?.values).toEqual({
      brow_raise: -0.3,
    });
  });

  it("applies imported neutral inputs by default", () => {
    const { result } = hook!;
    act(() => {
      result.current?.updateCurrentValue("smile", 0.4);
      result.current?.captureNeutral();
    });
    const spec = createPoseGraphSpec(
      {
        pose_new: { smile: 0.25 },
      },
      { smile: -0.35 },
    );

    act(() => {
      result.current?.importPoseGraphSpec(spec, {
        rigName: "im",
        groupName: "im",
      });
    });

    expect(result.current?.savedNeutral.smile).toBeCloseTo(-0.35);
  });

  it("keeps existing neutral inputs when applyNeutral is false", () => {
    const { result } = hook!;
    act(() => {
      result.current?.updateCurrentValue("smile", 0.55);
      result.current?.captureNeutral();
    });
    const before = result.current?.savedNeutral.smile;
    const spec = createPoseGraphSpec(
      {
        pose_new: { smile: 0.1 },
      },
      { smile: -0.5 },
    );

    act(() => {
      result.current?.importPoseGraphSpec(spec, {
        rigName: "im",
        groupName: "im",
        applyNeutral: false,
      });
    });

    expect(result.current?.savedNeutral.smile).toBe(before);
  });

  it("rebases imported pose values relative to the current neutral", () => {
    const { result } = hook!;
    act(() => {
      result.current?.updateCurrentValue("smile", 0.5);
      result.current?.captureNeutral();
    });
    const currentNeutral = result.current?.savedNeutral.smile ?? 0;
    const spec = createPoseGraphSpec(
      {
        pose_offset: { smile: 0.75 },
      },
      { smile: 0.25 },
    );

    act(() => {
      result.current?.importPoseGraphSpec(spec, {
        rigName: "im",
        groupName: "im",
        applyNeutral: false,
      });
    });

    const importedPose = result.current?.poses.find(
      (pose) => pose.name === "Pose Offset" || pose.id.includes("pose_offset"),
    );
    expect(importedPose?.values.smile).toBeCloseTo(currentNeutral + 0.5, 6);
  });

  it("drops rebased values that match the target neutral", () => {
    const { result } = hook!;
    act(() => {
      result.current?.updateCurrentValue("smile", 0.1);
      result.current?.captureNeutral();
    });
    const spec = createPoseGraphSpec(
      {
        pose_flat: { smile: 0.3 },
      },
      { smile: 0.3 },
    );

    act(() => {
      result.current?.importPoseGraphSpec(spec, {
        rigName: "flat",
        groupName: "flat",
        applyNeutral: false,
      });
    });

    const importedPose = result.current?.poses.find(
      (pose) => pose.name === "Pose Flat",
    );
    expect(importedPose?.values.smile).toBeUndefined();
  });

  it("surfaces structured pose-graph diagnostics when graph import fails", () => {
    const { result } = hook!;
    let thrown: unknown = null;
    act(() => {
      try {
        result.current?.importPoseGraphSpec({ nodes: [] } as GraphSpec);
      } catch (error) {
        thrown = error;
      }
    });
    expect(thrown).toBeTruthy();
    expect((thrown as Error).message).toContain("Pose graph import failed");
    expect(result.current?.poseDiagnostics).toEqual([
      expect.objectContaining({
        severity: "error",
        source: "pose-graph",
        code: "import-failed",
      }),
    ]);
  });
});
