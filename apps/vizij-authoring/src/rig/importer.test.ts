import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import type {
  AnimatableBinding,
  GraphBindingSummary,
} from "@vizij/node-graph-authoring";
import { bindingToDefinition } from "@vizij/node-graph-authoring";
import type { AnimatableComponent, StandardRigInput } from "@vizij/utils";
import { rehydrateRigDataFromGraph } from "./importer";

const JAW_COMPONENT_ID = "component_jaw_open";

function makeComponent(): AnimatableComponent {
  return {
    id: JAW_COMPONENT_ID,
    safeId: JAW_COMPONENT_ID,
    animatableId: "anim_jaw_open",
    animatableType: "number",
    label: "Jaw Open",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  };
}

function makeInput(
  overrides: Partial<StandardRigInput> & {
    id: string;
    path: string;
    label?: string;
    group?: string;
  },
) {
  return {
    id: overrides.id,
    path: overrides.path,
    sourceId: overrides.sourceId,
    label: overrides.label ?? overrides.id,
    group: overrides.group ?? "custom",
    defaultValue: overrides.defaultValue ?? 0,
    range: overrides.range ?? { min: -1, max: 1 },
  };
}

function makeBindingSummary(
  overrides: Partial<GraphBindingSummary>,
): GraphBindingSummary {
  return {
    targetId: overrides.targetId ?? JAW_COMPONENT_ID,
    animatableId: overrides.animatableId ?? "anim_jaw_open",
    component: overrides.component,
    slotId: overrides.slotId ?? "s1",
    slotAlias: overrides.slotAlias ?? "s1",
    inputId: overrides.inputId ?? null,
    expression: overrides.expression ?? "s1",
    valueType: overrides.valueType ?? "scalar",
    nodeId: overrides.nodeId ?? "node_1",
    expressionNodeId: overrides.expressionNodeId ?? "node_expr_1",
    issues: overrides.issues,
    metadata: overrides.metadata,
  };
}

function makeSpec(options: {
  faceId: string;
  inputs: Array<ReturnType<typeof makeInput>>;
  bindings: GraphBindingSummary[];
  pipelineV1?: {
    byInputId?: Record<
      string,
      {
        inputId?: string;
        parents?: Array<{
          linkId?: string;
          inputId?: string;
          alias?: string;
          scale?: number;
          offset?: number;
          enabled?: boolean;
          expression?: string;
        }>;
      }
    >;
    links?: Record<
      string,
      {
        linkId?: string;
        parentInputId?: string;
        childInputId?: string;
        scale?: number;
        offset?: number;
        enabled?: boolean;
        expression?: string;
      }
    >;
  };
}): GraphSpec {
  return {
    metadata: {
      vizij: {
        faceId: options.faceId,
        inputs: options.inputs,
        bindings: options.bindings,
        ...(options.pipelineV1 ? { pipelineV1: options.pipelineV1 } : {}),
      },
    },
    nodes: [],
    edges: [],
  } as unknown as GraphSpec;
}

function bindingDefinitions(bindings: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(bindings)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([targetId, binding]) => [
        targetId,
        bindingToDefinition(binding as AnimatableBinding),
      ]),
  );
}

describe("rehydrateRigDataFromGraph", () => {
  it("collects legacy /rig/element inputs for migration warnings", () => {
    const spec = {
      metadata: {
        vizij: {
          faceId: "legacy_face",
          inputs: [
            {
              id: "legacy_eye",
              path: "/rig/element/eye/open",
              label: "legacy_eye",
              group: "eyes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
            {
              id: "propsrig_eye",
              path: "/propsrig/eye/open",
              label: "propsrig_eye",
              group: "eyes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
          ],
          bindings: [],
        },
      },
      nodes: [],
      edges: [],
    } as unknown as GraphSpec;

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "legacy_face",
      animatables: {},
      components: [] as AnimatableComponent[],
    });

    expect(result.legacyPropsRigInputPaths).toEqual(["/rig/element/eye/open"]);
  });

  it("does not report /propsrig inputs as legacy", () => {
    const spec = {
      metadata: {
        vizij: {
          faceId: "legacy_face",
          inputs: [
            {
              id: "propsrig_eye",
              path: "/propsrig/eye/open",
              label: "propsrig_eye",
              group: "eyes",
              defaultValue: 0,
              range: { min: -1, max: 1 },
            },
          ],
          bindings: [],
        },
      },
      nodes: [],
      edges: [],
    } as unknown as GraphSpec;

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "legacy_face",
      animatables: {},
      components: [] as AnimatableComponent[],
    });

    expect(result.legacyPropsRigInputPaths).toEqual([]);
  });

  it("normalizes safe binding id mismatches for inputs and targets", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "propsrig_jaw_open",
          path: "/propsrig/mouth/open",
          group: "mouth",
          sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
        }),
        makeInput({
          id: "custom_smile",
          path: "/rig/control/smile",
          group: "custom",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "/rig/legacy_face/propsrig/mouth/open",
        }),
        makeBindingSummary({
          targetId: "/rig/legacy_face/propsrig/mouth/open",
          inputId: "custom_smile",
          slotId: "s2",
          slotAlias: "s2",
          nodeId: "node_2",
          expressionNodeId: "node_expr_2",
        }),
      ],
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    expect(result.normalizationDiagnostics.inputIdRemaps).toHaveLength(1);
    expect(result.normalizationDiagnostics.targetIdRemaps).toEqual([
      {
        fromTargetId: "/rig/legacy_face/propsrig/mouth/open",
        toTargetId: "propsrig_jaw_open",
      },
    ]);
    expect(result.inputBindings.propsrig_jaw_open).toBeDefined();
  });

  it("treats transitive rig ancestry into propsrig targets as boundary-valid", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "jaw_master",
          path: "/rig/control/jaw/master",
          group: "custom",
        }),
        makeInput({
          id: "jaw_control",
          path: "/rig/control/jaw/open",
          group: "custom",
        }),
        makeInput({
          id: "propsrig_jaw_open",
          path: "/propsrig/mouth/open",
          group: "mouth",
          sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: "jaw_control",
          inputId: "jaw_master",
          slotId: "s_parent",
          slotAlias: "parent",
          nodeId: "node_parent",
          expressionNodeId: "node_expr_parent",
        }),
        makeBindingSummary({
          targetId: "propsrig_jaw_open",
          inputId: "jaw_control",
          slotId: "s_propsrig",
          slotAlias: "propsrig",
          nodeId: "node_propsrig",
          expressionNodeId: "node_expr_propsrig",
        }),
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "jaw_master",
          slotId: "s_component",
          slotAlias: "component",
          nodeId: "node_component",
          expressionNodeId: "node_expr_component",
        }),
      ],
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    expect(result.normalizationDiagnostics.animatableRetargets).toEqual([]);
    expect(result.normalizationDiagnostics.animatableFallbacks).toEqual([]);
    expect(result.bindings[JAW_COMPONENT_ID]?.inputId).toBe("jaw_master");
    expect(result.inputBindings.propsrig_jaw_open?.inputId).toBe("jaw_control");
    expect(result.inputBindings.jaw_control?.inputId).toBe("jaw_master");
  });

  it("retargets invalid direct animatable bindings to propsrig targets", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "jaw_control",
          path: "/rig/control/jaw/open",
          group: "custom",
        }),
        makeInput({
          id: "propsrig_jaw_open",
          path: "/propsrig/mouth/open",
          group: "mouth",
          sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "jaw_control",
        }),
      ],
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    expect(result.normalizationDiagnostics.animatableRetargets).toEqual([
      {
        animatableTargetId: JAW_COMPONENT_ID,
        slotId: "s1",
        fromInputId: "jaw_control",
        toPropsRigInputId: "propsrig_jaw_open",
      },
    ]);
    expect(result.normalizationDiagnostics.animatableFallbacks).toEqual([]);
    expect(result.bindings[JAW_COMPONENT_ID]?.inputId).toBeNull();
    expect(result.inputBindings.propsrig_jaw_open?.inputId).toBe("jaw_control");
  });

  it("flags unresolved direct animatable bindings when no propsrig target exists", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "jaw_control",
          path: "/rig/control/jaw/open",
          group: "custom",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "jaw_control",
        }),
      ],
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    expect(result.normalizationDiagnostics.animatableRetargets).toEqual([]);
    expect(result.normalizationDiagnostics.animatableFallbacks).toEqual([
      {
        animatableTargetId: JAW_COMPONENT_ID,
        slotId: "s1",
        inputId: "jaw_control",
        reason: "missing-propsrig-target",
      },
    ]);
    expect(result.bindings[JAW_COMPONENT_ID]?.inputId).toBe("jaw_control");
  });

  it("provisions missing propsrig targets before retargeting direct animatable bindings", () => {
    const provisionedPropsRig = makeInput({
      id: "propsrig_jaw_open",
      path: "/propsrig/mouth/open",
      group: "mouth",
      sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "jaw_control",
          path: "/rig/control/jaw/open",
          group: "custom",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "jaw_control",
        }),
      ],
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
      provisionedPropsRigInputs: [provisionedPropsRig],
    });

    expect(result.normalizationDiagnostics.createdPropsRigInputs).toEqual([
      {
        inputId: "propsrig_jaw_open",
        path: "/propsrig/mouth/open",
        sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
      },
    ]);
    expect(result.normalizationDiagnostics.animatableRetargets).toEqual([
      {
        animatableTargetId: JAW_COMPONENT_ID,
        slotId: "s1",
        fromInputId: "jaw_control",
        toPropsRigInputId: "propsrig_jaw_open",
      },
    ]);
    expect(result.normalizationDiagnostics.animatableFallbacks).toEqual([]);
    expect(result.inputBindings.propsrig_jaw_open?.inputId).toBe("jaw_control");
  });

  it("remaps component target ids when propsrig source ids drift between exports", () => {
    const importedTargetId = "legacy_background_component:b";
    const currentTargetId = "current_background_component:b";
    const inputId = "propsrig_background_color_b";
    const inputPath = "/propsrig/background/color/b";
    const importedSourceId = `component:legacy:background:${encodeURIComponent(
      importedTargetId,
    )}`;
    const currentSourceId = `component:current:background:${encodeURIComponent(
      currentTargetId,
    )}`;

    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: inputId,
          path: inputPath,
          group: "background",
          sourceId: importedSourceId,
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: importedTargetId,
          animatableId: "legacy_background_component",
          component: "b",
          inputId,
        }),
      ],
    });

    const currentComponent: AnimatableComponent = {
      id: currentTargetId,
      safeId: "current_background_component_b",
      animatableId: "current_background_component",
      animatableType: "number",
      component: "b",
      label: "Background Color B",
      defaultValue: 0,
      range: { min: 0, max: 1 },
    };
    const provisionedPropsRigInput = makeInput({
      id: inputId,
      path: inputPath,
      group: "background",
      sourceId: currentSourceId,
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [currentComponent],
      provisionedPropsRigInputs: [provisionedPropsRigInput],
    });

    expect(result.normalizationDiagnostics.targetIdRemaps).toContainEqual({
      fromTargetId: importedTargetId,
      toTargetId: currentTargetId,
    });
    expect(result.bindings[currentTargetId]?.inputId).toBe(inputId);
    expect(result.bindings[importedTargetId]).toBeUndefined();
    const importedInput = result.standardInputs.find(
      (entry) => entry.id === inputId,
    );
    expect(importedInput?.sourceId).toBe(currentSourceId);
  });

  it("is deterministic and idempotent for repeated re-imports", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "jaw_control",
          path: "/rig/control/jaw/open",
          group: "custom",
        }),
        makeInput({
          id: "propsrig_jaw_open",
          path: "/propsrig/mouth/open",
          group: "mouth",
          sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "jaw_control",
        }),
        makeBindingSummary({
          targetId: "/rig/legacy_face/control/jaw/open",
          inputId: "/rig/legacy_face/propsrig/mouth/open",
          slotId: "s2",
          slotAlias: "s2",
          nodeId: "node_2",
          expressionNodeId: "node_expr_2",
        }),
      ],
    });

    const once = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });
    const twice = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    expect(twice.normalizationDiagnostics).toEqual(
      once.normalizationDiagnostics,
    );
    expect(bindingDefinitions(twice.bindings)).toEqual(
      bindingDefinitions(once.bindings),
    );
    expect(bindingDefinitions(twice.inputBindings)).toEqual(
      bindingDefinitions(once.inputBindings),
    );
    expect(twice.standardInputs).toEqual(once.standardInputs);
    expect(Array.from(twice.inputMetadata.entries())).toEqual(
      Array.from(once.inputMetadata.entries()),
    );
  });

  it("is deterministic for repeated imports with provisioned propsrig targets", () => {
    const provisionedPropsRig = makeInput({
      id: "propsrig_jaw_open",
      path: "/propsrig/mouth/open",
      group: "mouth",
      sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    });
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "jaw_control",
          path: "/rig/control/jaw/open",
          group: "custom",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "jaw_control",
        }),
      ],
    });

    const options = {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
      provisionedPropsRigInputs: [provisionedPropsRig],
    };

    const once = rehydrateRigDataFromGraph(spec, options);
    const twice = rehydrateRigDataFromGraph(spec, options);

    expect(twice.normalizationDiagnostics).toEqual(
      once.normalizationDiagnostics,
    );
    expect(bindingDefinitions(twice.bindings)).toEqual(
      bindingDefinitions(once.bindings),
    );
    expect(bindingDefinitions(twice.inputBindings)).toEqual(
      bindingDefinitions(once.inputBindings),
    );
    expect(twice.standardInputs).toEqual(once.standardInputs);
  });

  it("rehydrates input parent-child links from pipeline metadata when binding summaries omit input targets", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "blink",
          path: "/rig/control/eyes/blink",
          group: "custom",
        }),
        makeInput({
          id: "propsrig_ltlid_lidcurve_value",
          path: "/propsrig/ltlid/lidcurve/value",
          group: "eyes",
        }),
        makeInput({
          id: "propsrig_jaw_open",
          path: "/propsrig/mouth/open",
          group: "mouth",
          sourceId: "component:face:mouth:anim_jaw_open:component_jaw_open",
        }),
      ],
      bindings: [
        makeBindingSummary({
          targetId: JAW_COMPONENT_ID,
          inputId: "propsrig_jaw_open",
        }),
      ],
      pipelineV1: {
        links: {
          "link/blink->propsrig_ltlid_lidcurve_value": {
            linkId: "link/blink->propsrig_ltlid_lidcurve_value",
            parentInputId: "blink",
            childInputId: "propsrig_ltlid_lidcurve_value",
            scale: 1,
            offset: 0,
            enabled: true,
            expression: "s1 = sin(parent * scale) + offset",
          },
        },
      },
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    expect(result.inputBindings.propsrig_ltlid_lidcurve_value?.inputId).toBe(
      "blink",
    );
    const blink = result.standardInputs.find((input) => input.id === "blink");
    expect(blink?.derivedChildren).toContain("propsrig_ltlid_lidcurve_value");
    const child = result.standardInputs.find(
      (input) => input.id === "propsrig_ltlid_lidcurve_value",
    );
    expect(child?.parentBinding?.inputId).toBe("blink");
    expect(
      (
        result.inputBindings.propsrig_ltlid_lidcurve_value?.metadata as
          | {
              vizij?: {
                pipelineV1?: {
                  links?: Record<string, { expression?: string }>;
                };
              };
            }
          | undefined
      )?.vizij?.pipelineV1?.links?.["link/blink->propsrig_ltlid_lidcurve_value"]
        ?.expression,
    ).toBe("s1 = sin(parent * scale) + offset");
  });

  it("rehydrates input parent-child links from byInputId parent configs when links are absent", () => {
    const spec = makeSpec({
      faceId: "legacy_face",
      inputs: [
        makeInput({
          id: "gaze_left_right",
          path: "/rig/control/eyes/gaze_left_right",
          group: "custom",
        }),
        makeInput({
          id: "gaze_left_right_copy",
          path: "/rig/control/eyes/gaze_left_right_copy",
          group: "custom",
        }),
        makeInput({
          id: "propsrig_l_eye_translation_x",
          path: "/propsrig/l_eye/translation/x",
          group: "eyes",
        }),
      ],
      bindings: [],
      pipelineV1: {
        byInputId: {
          propsrig_l_eye_translation_x: {
            inputId: "propsrig_l_eye_translation_x",
            parents: [
              {
                linkId: "link/gaze_left_right->propsrig_l_eye_translation_x",
                inputId: "gaze_left_right",
                alias: "s1",
                expression: "left_right = parent * scale + offset",
              },
              {
                linkId:
                  "link/gaze_left_right_copy->propsrig_l_eye_translation_x",
                inputId: "gaze_left_right_copy",
                alias: "s2",
                expression: "s3 = parent * scale + offset",
              },
            ],
          },
        },
      },
    });

    const result = rehydrateRigDataFromGraph(spec, {
      faceId: "robot",
      animatables: {},
      components: [makeComponent()],
    });

    const binding = result.inputBindings.propsrig_l_eye_translation_x;
    expect(binding).toBeDefined();
    expect(binding?.slots.map((slot) => slot.inputId)).toEqual([
      "gaze_left_right",
      "gaze_left_right_copy",
    ]);
    expect(binding?.slots.map((slot) => slot.alias)).toEqual(["s1", "s2"]);
    expect(binding?.expression).toBe("s1 + s2");
    const parent = result.standardInputs.find(
      (input) => input.id === "gaze_left_right",
    );
    expect(parent?.derivedChildren).toContain("propsrig_l_eye_translation_x");
    const child = result.standardInputs.find(
      (input) => input.id === "propsrig_l_eye_translation_x",
    );
    expect(child?.parentBinding?.slots?.map((slot) => slot.inputId)).toEqual([
      "gaze_left_right",
      "gaze_left_right_copy",
    ]);
  });
});
