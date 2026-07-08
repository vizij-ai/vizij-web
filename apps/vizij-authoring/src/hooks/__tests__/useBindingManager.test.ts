import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStandardRigInput, type StandardRigInput } from "@vizij/utils";
import { linkChildInput } from "../standardInputLinks";
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
      "propsrig_target_openness",
      "/propsrig/target/openness",
    );
    const source = makeInput(
      "propsrig_source_openness",
      "/propsrig/source/openness",
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
    const target = makeInput("propsrig_cheek_raise", "/propsrig/cheek/raise");
    const source = makeInput("propsrig_eye_squint", "/propsrig/eye/squint");
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
        "propsrig_cheek_raise",
        "/rig/element/eye/squint",
      );
    });

    const updated = hook.result.current.inputBindings[target.id];
    expect(updated).toBeDefined();
    expect(updated?.slots?.some((slot) => slot.inputId === source.id)).toBe(
      true,
    );
    expect(
      hook.result.current.inputBindings["propsrig/cheek/raise"],
    ).toBeUndefined();
  });

  it("propagates parent bindings across equivalent /standard and canonical target paths", () => {
    const canonicalTarget = makeInput(
      "propsrig_scene_rotation_z",
      "/propsrig/scene/rotation/z",
    );
    const standardPrefixedTarget = makeInput(
      "standard_propsrig_scene_rotation_z",
      "/standard/propsrig/scene/rotation/z",
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
      "propsrig_scene_rotation_z",
      "/propsrig/scene/rotation/z",
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

  it("canonicalizes custom expressions when child-link creation adds a new parent", () => {
    const target = makeInput(
      "propsrig_scene_rotation_z",
      "/propsrig/scene/rotation/z",
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
        "self * 0.5 + s2",
      );
    });

    act(() => {
      linkChildInput({
        parentId: sourceB.id,
        childId: target.id,
        updateInputBinding: hook.result.current.updateInputBinding,
        standardInputsByIdRef,
        allStandardInputsRef,
      });
    });

    const updated = hook.result.current.inputBindings[target.id];
    const sourceBSlot = updated?.slots.find(
      (slot) => slot.inputId === sourceB.id,
    );
    expect(sourceBSlot).toBeDefined();
    expect((updated?.expression ?? "").trim()).toContain(
      sourceBSlot?.alias ?? "",
    );
    expect((updated?.expression ?? "").trim()).not.toBe("self * 0.5 + s2");
  });
});
