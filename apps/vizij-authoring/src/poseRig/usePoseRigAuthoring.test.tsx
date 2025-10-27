import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import type { StandardRigInput } from "@vizij/utils";
import {
  usePoseRigAuthoring,
  type UsePoseRigAuthoringResult,
} from "./usePoseRigAuthoring";

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

function renderPoseRigHook(options: RenderOptions): RenderedHook {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const result = { current: null as UsePoseRigAuthoringResult | null };

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
    root.render(<Harness opts={options} />);
  });

  return {
    result,
    rerender(next) {
      act(() => {
        root.render(<Harness opts={next} />);
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
});
