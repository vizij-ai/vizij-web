import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import {
  useSharedVariableSync,
  type SharedVariableSyncPassMetrics,
  type SharedVariableSyncPolicy,
} from "../useSharedVariableSync";

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

interface HookState {
  policy?: SharedVariableSyncPolicy;
  mainValue: number;
  referenceValue: number;
  onSyncPassMetrics?: (metrics: SharedVariableSyncPassMetrics) => void;
}

function setupHook(initial?: Partial<HookState>) {
  const mainInput = makeInput("main_jaw", "/standard/jaw/open");
  const referenceInput = makeInput("ref_jaw", "/standard/jaw/open");
  const mainInputsById = new Map([[mainInput.id, mainInput]]);
  const referenceInputs = [referenceInput];
  const onMainInputValueChange = vi.fn();
  const onReferenceInputValueChange = vi.fn();

  const useHookState = (state: HookState) =>
    useSharedVariableSync({
      initialPolicy: state.policy,
      mainInputsById,
      mainInputValues: { [mainInput.id]: state.mainValue },
      referenceInputs,
      referenceInputValues: { [referenceInput.id]: state.referenceValue },
      onMainInputValueChange,
      onReferenceInputValueChange,
      onSyncPassMetrics: state.onSyncPassMetrics,
    });

  const initialState: HookState = {
    policy: initial?.policy ?? "bidirectional",
    mainValue: initial?.mainValue ?? 0,
    referenceValue: initial?.referenceValue ?? 0,
    onSyncPassMetrics: initial?.onSyncPassMetrics,
  };

  const hook = renderHook((state: HookState) => useHookState(state), {
    initialProps: initialState,
  });

  return {
    ...hook,
    mainInput,
    referenceInput,
    onMainInputValueChange,
    onReferenceInputValueChange,
  };
}

describe("useSharedVariableSync", () => {
  it("mirrors main edits into reference when policy allows main-to-reference", () => {
    const {
      rerender,
      referenceInput,
      onReferenceInputValueChange,
      onMainInputValueChange,
    } = setupHook();

    rerender({
      policy: "bidirectional",
      mainValue: 0.65,
      referenceValue: 0,
    });

    expect(onReferenceInputValueChange).toHaveBeenCalledWith(
      referenceInput.id,
      0.65,
    );
    expect(onMainInputValueChange).not.toHaveBeenCalled();
  });

  it("mirrors reference edits into main when policy allows reference-to-main", () => {
    const { rerender, mainInput, onMainInputValueChange } = setupHook();

    rerender({
      policy: "bidirectional",
      mainValue: 0,
      referenceValue: 0.4,
    });

    expect(onMainInputValueChange).toHaveBeenCalledWith(mainInput.id, 0.4);
  });

  it("blocks reference-to-main mirroring when policy is main-to-reference", () => {
    const { rerender, result, onMainInputValueChange } = setupHook();

    act(() => {
      result.current.setPolicy("main-to-reference");
    });

    rerender({
      policy: "bidirectional",
      mainValue: 0,
      referenceValue: 0.8,
    });

    expect(onMainInputValueChange).not.toHaveBeenCalled();
  });

  it("tracks and resolves shared conflicts", () => {
    const {
      rerender,
      result,
      mainInput,
      onReferenceInputValueChange,
      onMainInputValueChange,
      referenceInput,
    } = setupHook();

    rerender({
      policy: "bidirectional",
      mainValue: 0.6,
      referenceValue: 0,
    });
    expect(onReferenceInputValueChange).toHaveBeenCalledWith(
      referenceInput.id,
      0.6,
    );

    rerender({
      policy: "bidirectional",
      mainValue: 0.6,
      referenceValue: 0.2,
    });

    expect(result.current.conflicts.length).toBe(1);
    const conflict = result.current.conflicts[0];
    expect(conflict.path).toBe("/standard/jaw/open");

    act(() => {
      result.current.resolveConflict(conflict.path, "main");
    });

    expect(onReferenceInputValueChange).toHaveBeenLastCalledWith(
      referenceInput.id,
      0.6,
    );
    expect(onMainInputValueChange).toHaveBeenCalledTimes(1);
    expect(onMainInputValueChange).toHaveBeenCalledWith(mainInput.id, 0.2);
  });

  it("runs a single shared-sync pass per cycle while preserving mirroring", () => {
    const onSyncPassMetrics = vi.fn();
    const { rerender, referenceInput, onReferenceInputValueChange } = setupHook(
      {
        onSyncPassMetrics,
      },
    );

    onSyncPassMetrics.mockClear();
    onReferenceInputValueChange.mockClear();

    rerender({
      policy: "bidirectional",
      mainValue: 0.35,
      referenceValue: 0,
      onSyncPassMetrics,
    });

    expect(onReferenceInputValueChange).toHaveBeenCalledWith(
      referenceInput.id,
      0.35,
    );
    expect(onSyncPassMetrics).toHaveBeenCalled();
    onSyncPassMetrics.mock.calls.forEach(([metrics]) => {
      expect(metrics.passCount).toBe(1);
      expect(metrics.pairCount).toBe(1);
      expect(metrics.pairEvaluations).toBe(1);
    });
  });

  it("keeps result identity stable across unrelated rerenders", () => {
    const mainInput = makeInput("main_jaw", "/standard/jaw/open");
    const referenceInput = makeInput("ref_jaw", "/standard/jaw/open");
    const mainInputsById = new Map([[mainInput.id, mainInput]]);
    const mainInputValues = { [mainInput.id]: 0 };
    const referenceInputs = [referenceInput];
    const referenceInputValues = { [referenceInput.id]: 0 };
    const onMainInputValueChange = vi.fn();
    const onReferenceInputValueChange = vi.fn();

    const hook = renderHook(() =>
      useSharedVariableSync({
        initialPolicy: "bidirectional",
        mainInputsById,
        mainInputValues,
        referenceInputs,
        referenceInputValues,
        onMainInputValueChange,
        onReferenceInputValueChange,
      }),
    );

    const first = hook.result.current;
    hook.rerender();
    expect(hook.result.current).toBe(first);
  });
});
