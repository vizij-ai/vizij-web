import { describe, expect, it } from "vitest";
import {
  createStandardRigInput,
  normalizeStandardRigInputPath,
} from "@vizij/utils";
import type { StandardRigInput, AnimatableComponent } from "@vizij/utils";
import type { AutoInputState } from "../../types/autoInputs";
import type {
  BindingMap,
  InputBindingMap,
  StandardInputValues,
} from "@vizij/node-graph-authoring";
import { applyShapeInputRename } from "../shapeRenaming";

function createSetter<T>(
  initial: T,
): [() => T, (next: T | ((prev: T) => T)) => void] {
  let state = initial;
  const get = () => state;
  const set = (next: T | ((prev: T) => T)) => {
    state = typeof next === "function" ? (next as (prev: T) => T)(state) : next;
  };
  return [get, set];
}

describe("applyShapeInputRename", () => {
  it("renames standard inputs and remaps bindings when a shape slug changes", () => {
    const input: StandardRigInput = createStandardRigInput({
      path: "/foo/blink",
      label: "Blink",
      group: "foo",
      defaultValue: 0,
      range: { min: -1, max: 1 },
      sourceId: "source-foo",
    });
    const autoState: AutoInputState = {
      input,
      metadata: {
        elementId: "shape1",
        elementName: "Foo Shape",
        elementType: "shape",
        featureKey: "blink",
        featureLabel: "Blink",
        animatableId: "anim-1",
        componentId: "anim-1:x",
        componentKey: "x",
        propertyLabel: "X",
        root: "foo",
      },
      generatedLabel: "Blink",
      generatedDefaultValue: 0,
      generatedRange: { min: -1, max: 1 },
      sourcePath: "/foo/blink",
      sourceId: "source-foo",
    };

    const autoInputsRef = {
      current: new Map<string, AutoInputState>([["/foo/blink", autoState]]),
    };
    const customInputsRef = { current: [] as StandardRigInput[] };
    const [, setCustomInputs] = createSetter<StandardRigInput[]>([]);
    customInputsRef.current = [];
    const [, setAutoInputs] = createSetter(autoInputsRef.current);

    const allStandardInputsRef = {
      current: new Map<string, StandardRigInput>([[input.id, input]]),
    };
    const [, setDisabled] = createSetter<string[]>([]);
    const disabledInputBindingCacheRef = { current: new Map<string, any>() };
    const [, setInputValues] = createSetter<StandardInputValues>({
      [input.id]: 0,
    });
    const [getBindings, setBindings] = createSetter<BindingMap>({
      "anim-1:x": {
        targetId: "anim-1:x",
        expression: "s1",
        inputId: input.id,
        slots: [
          { id: "s1", alias: "s1", inputId: input.id, valueType: "scalar" },
        ],
      } as any,
    });
    const componentsByIdRef = {
      current: new Map<string, AnimatableComponent>([
        [
          "anim-1:x",
          {
            id: "anim-1:x",
            safeId: "anim-1:x",
            animatableId: "anim-1",
            animatableType: "vector3",
            component: "x",
            label: "Blink X",
            defaultValue: 0,
            range: { min: -1, max: 1 },
          },
        ],
      ]),
    };
    const [getInputBindings, setInputBindings] = createSetter<InputBindingMap>({
      [input.id]: {
        targetId: input.id,
        expression: "s1",
        slots: [
          { id: "s1", alias: "s1", inputId: input.id, valueType: "scalar" },
        ],
      } as any,
    });
    const pendingInputBindingDefinitionsRef = {
      current: null as Record<string, any> | null,
    };
    const persistedAutoInputsRef = { current: new Map<string, any>() };
    const updatesRoots: string[][] = [];
    const updatesSubgroups: string[][] = [];
    const setSelectedStandardInputRoots = (
      next: string[] | ((prev: string[]) => string[]),
    ) => {
      updatesRoots.push(typeof next === "function" ? next([]) : next);
    };
    const setSelectedStandardInputSubgroups = (
      next: string[] | ((prev: string[]) => string[]),
    ) => {
      updatesSubgroups.push(typeof next === "function" ? next([]) : next);
    };
    const featureOverrides: Record<string, string> = {};
    const setFeatureLabelOverrides = (
      next:
        | Record<string, string>
        | ((prev: Record<string, string>) => Record<string, string>),
    ) => {
      const resolved =
        typeof next === "function" ? next(featureOverrides) : next;
      Object.assign(featureOverrides, resolved);
    };

    applyShapeInputRename({
      shapeId: "shape1",
      oldSlug: "foo",
      newSlug: "bar",
      shapeName: "Bar Shape",
      previousName: "Foo Shape",
      autoInputsRef,
      customInputsRef,
      setCustomInputs,
      setAutoInputs,
      allStandardInputsRef,
      setDisabledStandardInputIds: setDisabled,
      disabledInputBindingCacheRef,
      updateInputValues: setInputValues,
      setBindings,
      componentsByIdRef,
      setInputBindings,
      pendingInputBindingDefinitionsRef,
      persistedAutoInputsRef,
      refreshAutoMetadataForShape: () => {},
      setSelectedStandardInputRoots,
      setSelectedStandardInputSubgroups,
      setFeatureLabelOverrides,
      resolvePersistedAutoKey: (_sourceId, sourcePath) =>
        sourcePath ? normalizeStandardRigInputPath(sourcePath) : null,
    });

    const updatedInputs = Array.from(allStandardInputsRef.current.values());
    expect(updatedInputs).toHaveLength(1);
    expect(updatedInputs[0].path).toBe("/bar/blink");
    expect(updatedInputs[0].id).toBe("bar_blink");

    const remappedBinding = getBindings()["anim-1:x"];
    expect(remappedBinding.inputId).toBe("bar_blink");
    expect(remappedBinding.slots[0]?.inputId).toBe("bar_blink");

    const remappedInputBinding = getInputBindings()["bar_blink"];
    expect(remappedInputBinding).toBeTruthy();
    expect(remappedInputBinding?.targetId).toBe("bar_blink");
  });
});
