import { describe, expect, it } from "vitest";
import type {
  BindingMap,
  InputBindingMap,
  StandardInputValues,
} from "@vizij/node-graph-authoring";
import {
  buildRigPipelineV1LinkId,
  createStandardRigInput,
  normalizeStandardRigInputPath,
  type AnimatableComponent,
  type RigBindingDefinition,
  type StandardRigInput,
} from "@vizij/utils";
import { planShapeInputRename } from "../index";

describe("shape input rename planning", () => {
  it("renames standard input state and remaps binding surfaces for a shape slug change", () => {
    const parent = createStandardRigInput({
      path: "/drivers/parent",
      label: "Parent",
      group: "drivers",
      defaultValue: 0,
      range: { min: -1, max: 1 },
      sourceId: "source-parent",
    });
    const autoInput: StandardRigInput = createStandardRigInput({
      path: "/foo/blink",
      label: "Blink",
      group: "foo",
      defaultValue: 0,
      range: { min: -1, max: 1 },
      sourceId: "source-foo",
    });
    const customInput = createStandardRigInput({
      path: "/foo/custom",
      label: "Foo Shape Custom",
      group: "foo",
      defaultValue: 0.25,
      range: { min: 0, max: 1 },
      sourceId: "source-custom",
    });
    const autoState = {
      input: autoInput,
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
    const bindingDefinition: RigBindingDefinition = {
      inputId: autoInput.id,
      expression: "s1",
      slots: [
        { id: "s1", alias: "s1", inputId: autoInput.id, valueType: "scalar" },
      ],
    };
    const disabledCacheDefinition: RigBindingDefinition = {
      inputId: parent.id,
      expression: "s1",
      slots: [
        { id: "s1", alias: "s1", inputId: parent.id, valueType: "scalar" },
      ],
    };
    const componentsById = new Map<string, AnimatableComponent>([
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
    ]);
    const bindings: BindingMap = {
      "anim-1:x": {
        targetId: "anim-1:x",
        expression: "s1",
        inputId: autoInput.id,
        slots: [
          { id: "s1", alias: "s1", inputId: autoInput.id, valueType: "scalar" },
        ],
      },
    };
    const inputBindings: InputBindingMap = {
      [autoInput.id]: {
        targetId: autoInput.id,
        expression: "s1",
        inputId: parent.id,
        slots: [
          { id: "s1", alias: "s1", inputId: parent.id, valueType: "scalar" },
        ],
        metadata: {
          vizij: {
            pipelineV1: {
              links: {
                [buildRigPipelineV1LinkId(parent.id, autoInput.id)]: {
                  linkId: buildRigPipelineV1LinkId(parent.id, autoInput.id),
                  parentInputId: parent.id,
                  childInputId: autoInput.id,
                  scale: 0.5,
                  offset: 0.2,
                },
              },
            },
          },
        },
      },
    };
    const inputValues: StandardInputValues = {
      [autoInput.id]: 0.4,
      [parent.id]: 0.1,
    };
    const plan = planShapeInputRename({
      shapeId: "shape1",
      oldSlug: "foo",
      newSlug: "bar",
      shapeName: "Bar Shape",
      previousName: "Foo Shape",
      autoInputs: new Map([["/foo/blink", autoState]]),
      customInputs: [customInput],
      allStandardInputs: new Map([
        [parent.id, parent],
        [autoInput.id, autoInput],
        [customInput.id, customInput],
      ]),
      disabledInputIds: [autoInput.id],
      disabledInputBindingCache: new Map([
        [autoInput.id, disabledCacheDefinition],
      ]),
      inputValues,
      bindings,
      componentsById,
      inputBindings,
      pendingInputBindingDefinitions: {
        [autoInput.id]: bindingDefinition,
      },
      persistedAutoInputs: new Map([
        [
          normalizeStandardRigInputPath("/foo/blink"),
          {
            id: autoInput.id,
            path: autoInput.path,
            sourceId: autoState.sourceId ?? undefined,
            sourcePath: autoState.sourcePath,
          },
        ],
      ]),
      selectedStandardInputRoots: ["foo"],
      selectedStandardInputSubgroups: ["foo/eyes"],
      featureLabelOverrides: { "shape1:blink": "Foo Shape Blink" },
      resolvePersistedAutoKey: (_sourceId, sourcePath) =>
        sourcePath ? normalizeStandardRigInputPath(sourcePath) : null,
    });

    expect(plan.inputIdMap).toEqual(
      new Map([
        [autoInput.id, "bar_blink"],
        [customInput.id, "bar_custom"],
      ]),
    );
    expect(plan.autoInputUpdates[0]?.state.metadata.root).toBe("bar");
    expect(plan.autoInputs.has("/bar/blink")).toBe(true);
    expect(plan.customInputs[0]?.path).toBe("/bar/custom");
    expect(plan.allStandardInputs.has(autoInput.id)).toBe(false);
    expect(plan.allStandardInputs.get("bar_blink")?.path).toBe("/bar/blink");
    expect(plan.disabledInputIds).toEqual(["bar_blink"]);
    expect(plan.disabledInputBindingCache.has(autoInput.id)).toBe(false);
    expect(plan.disabledInputBindingCache.get("bar_blink")).toBe(
      disabledCacheDefinition,
    );
    expect(plan.inputValues).toMatchObject({
      [parent.id]: 0.1,
      bar_blink: 0.4,
      bar_custom: 0.25,
    });
    expect(plan.bindings["anim-1:x"]?.inputId).toBe("bar_blink");
    expect(plan.bindings["anim-1:x"]?.slots[0]?.inputId).toBe("bar_blink");
    expect(plan.inputBindings.bar_blink?.targetId).toBe("bar_blink");
    expect(plan.inputBindings.bar_blink?.inputId).toBe(parent.id);
    expect(plan.pendingInputBindingDefinitions?.bar_blink?.inputId).toBe(
      "bar_blink",
    );
    expect(plan.persistedAutoInputs.has("/foo/blink")).toBe(false);
    expect(plan.persistedAutoInputs.get("/bar/blink")).toMatchObject({
      id: "bar_blink",
      path: "/bar/blink",
      sourcePath: "/bar/blink",
    });
    expect(plan.selectedStandardInputRoots).toEqual(["bar"]);
    expect(plan.selectedStandardInputSubgroups).toEqual(["bar/eyes"]);
    expect(plan.featureLabelOverrides["shape1:blink"]).toBe("Bar Shape Blink");
  });
});
