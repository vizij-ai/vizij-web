import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStandardRigInput, type StandardRigInput } from "@vizij/utils";
import { useBindingManager } from "../useBindingManager";

function makeInput(
  id: string,
  path: string,
  overrides?: Partial<StandardRigInput>,
): StandardRigInput {
  return createStandardRigInput({
    id,
    path,
    label: id,
    group: "test",
    defaultValue: 0,
    range: { min: -1, max: 1 },
    ...overrides,
  });
}

describe("useBindingManager", () => {
  it("resolves upstream and target ids before creating parent driver bindings", () => {
    const target = makeInput(
      "autorig_target_openness",
      "/autorig/target/openness",
    );
    const source = makeInput(
      "autorig_source_openness",
      "/autorig/source/openness",
    );
    const standardInputsByIdRef = {
      current: new Map<string, StandardRigInput>([
        [target.id, target],
        [source.id, source],
      ]),
    };
    const allStandardInputsRef = {
      current: new Map<string, StandardRigInput>([
        [target.id, target],
        [source.id, source],
      ]),
    };
    const maybeAutoAliasSlot = vi.fn((binding) => binding);

    const hook = renderHook(() =>
      useBindingManager({
        componentsById: new Map(),
        standardInputsByIdRef,
        allStandardInputsRef,
        maybeAutoAliasSlot,
        debugLog: vi.fn(),
      }),
    );

    act(() => {
      hook.result.current.handleCreateParentDriverBinding(
        "/rig/element/target/openness",
        "/pose/control/source/openness",
      );
    });

    const updated = hook.result.current.inputBindings[target.id];
    expect(updated).toBeDefined();
    expect(updated?.slots?.some((slot) => slot.inputId === source.id)).toBe(
      true,
    );
    expect(maybeAutoAliasSlot).toHaveBeenCalled();
  });

  it("writes parent bindings to canonical target id when target id is alias-like", () => {
    const target = makeInput("autorig_cheek_raise", "/autorig/cheek/raise");
    const source = makeInput("autorig_eye_squint", "/autorig/eye/squint");
    const standardInputsByIdRef = {
      current: new Map<string, StandardRigInput>([
        [target.id, target],
        [source.id, source],
      ]),
    };
    const allStandardInputsRef = {
      current: new Map<string, StandardRigInput>([
        [target.id, target],
        [source.id, source],
      ]),
    };

    const hook = renderHook(() =>
      useBindingManager({
        componentsById: new Map(),
        standardInputsByIdRef,
        allStandardInputsRef,
        maybeAutoAliasSlot: (binding) => binding,
        debugLog: vi.fn(),
      }),
    );

    act(() => {
      hook.result.current.handleCreateParentDriverBinding(
        "autorig_cheek_raise",
        "/rig/element/eye/squint",
      );
    });

    const updated = hook.result.current.inputBindings[target.id];
    expect(updated).toBeDefined();
    expect(updated?.slots?.some((slot) => slot.inputId === source.id)).toBe(
      true,
    );
    expect(
      hook.result.current.inputBindings["autorig/cheek/raise"],
    ).toBeUndefined();
  });

  it("propagates parent bindings across equivalent /standard and canonical target paths", () => {
    const canonicalTarget = makeInput(
      "autorig_scene_rotation_z",
      "/autorig/scene/rotation/z",
    );
    const standardPrefixedTarget = makeInput(
      "standard_autorig_scene_rotation_z",
      "/standard/autorig/scene/rotation/z",
    );
    const source = makeInput("testing_example", "/testing/example");
    const standardInputsByIdRef = {
      current: new Map<string, StandardRigInput>([
        [canonicalTarget.id, canonicalTarget],
        [standardPrefixedTarget.id, standardPrefixedTarget],
        [source.id, source],
      ]),
    };
    const allStandardInputsRef = {
      current: new Map<string, StandardRigInput>([
        [canonicalTarget.id, canonicalTarget],
        [standardPrefixedTarget.id, standardPrefixedTarget],
        [source.id, source],
      ]),
    };

    const hook = renderHook(() =>
      useBindingManager({
        componentsById: new Map(),
        standardInputsByIdRef,
        allStandardInputsRef,
        maybeAutoAliasSlot: (binding) => binding,
        debugLog: vi.fn(),
      }),
    );

    act(() => {
      hook.result.current.handleCreateParentDriverBinding(
        canonicalTarget.id,
        source.id,
      );
    });

    const canonicalBinding =
      hook.result.current.inputBindings[canonicalTarget.id];
    const standardBinding =
      hook.result.current.inputBindings[standardPrefixedTarget.id];
    expect(canonicalBinding).toBeDefined();
    expect(
      canonicalBinding?.slots.some((slot) => slot.inputId === source.id),
    ).toBe(true);
    expect(standardBinding).toBeDefined();
    expect(
      standardBinding?.slots.some((slot) => slot.inputId === source.id),
    ).toBe(true);
  });

  it("updates expression when adding a new parent that is not referenced yet", () => {
    const target = makeInput(
      "autorig_scene_rotation_z",
      "/autorig/scene/rotation/z",
    );
    const sourceA = makeInput("testing_source_a", "/testing/source/a");
    const sourceB = makeInput("testing_source_b", "/testing/source/b");
    const standardInputsByIdRef = {
      current: new Map<string, StandardRigInput>([
        [target.id, target],
        [sourceA.id, sourceA],
        [sourceB.id, sourceB],
      ]),
    };
    const allStandardInputsRef = {
      current: new Map<string, StandardRigInput>([
        [target.id, target],
        [sourceA.id, sourceA],
        [sourceB.id, sourceB],
      ]),
    };

    const hook = renderHook(() =>
      useBindingManager({
        componentsById: new Map(),
        standardInputsByIdRef,
        allStandardInputsRef,
        maybeAutoAliasSlot: (binding) => binding,
        debugLog: vi.fn(),
      }),
    );

    act(() => {
      hook.result.current.handleCreateParentDriverBinding(
        target.id,
        sourceA.id,
      );
    });

    act(() => {
      hook.result.current.handleParentBindingExpressionChange(
        target.id,
        "self + s2",
      );
    });

    act(() => {
      hook.result.current.handleCreateParentDriverBinding(
        target.id,
        sourceB.id,
      );
    });

    const updated = hook.result.current.inputBindings[target.id];
    const sourceBSlot = updated?.slots.find(
      (slot) => slot.inputId === sourceB.id,
    );
    expect(sourceBSlot).toBeDefined();
    expect((updated?.expression ?? "").trim()).toContain(
      sourceBSlot?.alias ?? "",
    );
    expect((updated?.expression ?? "").trim()).not.toBe("self + s2");
  });
});
