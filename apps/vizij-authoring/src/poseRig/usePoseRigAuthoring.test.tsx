import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import {
  usePoseRigAuthoring,
  type UsePoseRigAuthoringResult,
} from "./usePoseRigAuthoring";
import {
  createGraphRuntimeStore,
  GraphRuntimeStoreProvider,
} from "../state/graphRuntimeStore";
import {
  createBindingAuthoringStore,
  BindingAuthoringStoreProvider,
} from "../state/bindingAuthoringStore";
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
    console.log("Harness render");
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
    expect(poseId).toBeTruthy();

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
    expect(duplicate?.id).not.toEqual(original?.id);
    expect(duplicate?.name).toContain("Copy");
    expect(duplicate?.values).toEqual(original?.values);
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
    expect(duplicates?.length ?? 0).toBeGreaterThanOrEqual(2);
    const imported = duplicates?.find((pose) => pose.id !== existingId);
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
});
