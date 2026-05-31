import { describe, expect, it } from "vitest";
import type { BindingMap } from "@vizij/node-graph-authoring";
import { createStandardRigInputFromPath } from "@vizij/utils";
import {
  buildPoseComposeModeByInputId,
  canonicalizeImportedPipelineMetadataV1,
  derivePipelineConfigFromInputBindings,
  deriveLockedInspectorTargetsFromPipeline,
  mergeImportedAndLocalPipelineConfigByInputId,
  mergeImportedAndLocalPipelineLinksById,
  readPipelineLinkPatch,
  resolvePipelineMetadataForExport,
  sanitizePipelineConfigAndLinksForAvailableInputs,
  withPipelineConfigBuildOptions,
} from "../utils/pipelineMetadata";

describe("buildPoseComposeModeByInputId", () => {
  it("projects compose modes only for targeted inputs", () => {
    const modes = buildPoseComposeModeByInputId({
      poses: [
        {
          values: { jaw: 0.4, smile: 1 },
          composeModes: { jaw: "average" },
        },
        {
          values: { smile: 0.2, blink: 1 },
          composeModes: { smile: "average", blink: "unsupported" },
        },
      ],
    });

    expect(modes).toEqual({
      jaw: "average",
      smile: "average",
      blink: "add",
    });
  });
});

describe("withPipelineConfigBuildOptions", () => {
  it("returns original options when no staged config map is provided", () => {
    const options = { faceId: "face", inputComposeModesById: {} };
    expect(withPipelineConfigBuildOptions(options, null)).toBe(options);
    expect(withPipelineConfigBuildOptions(options, {})).toBe(options);
  });

  it("attaches pipelineV1 metadata for staged pipeline maps", () => {
    const options = { faceId: "face", inputComposeModesById: {} };
    const next = withPipelineConfigBuildOptions(options, {
      jaw: { clamp: { enabled: true } },
    });
    expect(next).not.toBe(options);
    expect(next).toMatchObject({
      pipelineV1: expect.objectContaining({
        byInputId: expect.objectContaining({
          jaw: expect.objectContaining({ clamp: { enabled: true } }),
        }),
      }),
    });
  });
});

describe("resolvePipelineMetadataForExport", () => {
  it("normalizes export pipeline metadata so links and byInputId stay internally consistent", () => {
    const metadata = resolvePipelineMetadataForExport(
      {
        links: {
          "link/blink->propsrig_ltlid_lidcurve_value": {
            parentInputId: "blink",
            childInputId: "propsrig_ltlid_lidcurve_value",
            scale: 1,
            offset: 0.1,
            enabled: true,
          },
        },
      },
      {
        propsrig_ltlid_lidcurve_value: {
          clamp: { enabled: true },
          parents: [],
        },
        blink: {
          inputId: "blink",
          parents: [],
          children: ["propsrig_ltlid_lidcurve_value"],
          directInput: { enabled: false },
          poseSource: { targetIds: [] },
        },
      },
      new Set(["blink", "propsrig_ltlid_lidcurve_value"]),
    );

    expect(metadata).toMatchObject({
      byInputId: {
        propsrig_ltlid_lidcurve_value: {
          inputId: "propsrig_ltlid_lidcurve_value",
          parents: [
            {
              inputId: "blink",
              linkId: "link/blink->propsrig_ltlid_lidcurve_value",
            },
          ],
        },
        blink: {
          inputId: "blink",
          children: ["propsrig_ltlid_lidcurve_value"],
          directInput: { enabled: true },
        },
      },
      links: {
        "link/blink->propsrig_ltlid_lidcurve_value": {
          parentInputId: "blink",
          childInputId: "propsrig_ltlid_lidcurve_value",
          linkId: "link/blink->propsrig_ltlid_lidcurve_value",
        },
      },
    });
  });

  it("preserves parent aliases and custom formulas during export normalization", () => {
    const linkId = "link/blink->propsrig_ltlid_lidcurve_value";
    const parentFormula = "s1 = sin(parent * scale) + offset";
    const parentBlendExpression =
      "parentContribution = normalizedAdditive([s1], baseline=default)";

    const metadata = resolvePipelineMetadataForExport(
      {
        links: {
          [linkId]: {
            linkId,
            parentInputId: "blink",
            childInputId: "propsrig_ltlid_lidcurve_value",
            scale: 1,
            offset: 0.1,
            enabled: true,
            expression: parentFormula,
          },
        },
      },
      {
        propsrig_ltlid_lidcurve_value: {
          inputId: "propsrig_ltlid_lidcurve_value",
          parents: [
            {
              inputId: "blink",
              linkId,
              alias: "s1",
              expression: parentFormula,
            },
          ],
          parentBlend: {
            mode: "normalized-additive",
            expression: parentBlendExpression,
          },
        },
      },
      new Set(["blink", "propsrig_ltlid_lidcurve_value"]),
    );

    expect(metadata).toMatchObject({
      byInputId: {
        propsrig_ltlid_lidcurve_value: {
          parentBlend: { expression: parentBlendExpression },
          parents: [
            {
              inputId: "blink",
              linkId,
              alias: "s1",
              expression: parentFormula,
            },
          ],
        },
      },
      links: {
        [linkId]: {
          expression: parentFormula,
        },
      },
    });
  });

  it("keeps linked propsrig child inputs directly enabled when no explicit lock was authored", () => {
    const linkId = "link/custom_smile_driver->propsrig_mouth_jawud_value";

    const metadata = resolvePipelineMetadataForExport(
      {
        links: {
          [linkId]: {
            linkId,
            parentInputId: "custom_smile_driver",
            childInputId: "propsrig_mouth_jawud_value",
            scale: 0.1,
            offset: 0,
            enabled: true,
          },
        },
      },
      {
        custom_smile_driver: {
          inputId: "custom_smile_driver",
          directInput: { enabled: true },
        },
        propsrig_mouth_jawud_value: {
          inputId: "propsrig_mouth_jawud_value",
          parents: [
            {
              inputId: "custom_smile_driver",
              linkId,
              alias: "smile",
            },
          ],
        },
      },
      new Set(["custom_smile_driver", "propsrig_mouth_jawud_value"]),
    );

    expect(metadata).toMatchObject({
      byInputId: {
        propsrig_mouth_jawud_value: {
          inputId: "propsrig_mouth_jawud_value",
          directInput: { enabled: true },
          parents: [
            {
              inputId: "custom_smile_driver",
              linkId,
              alias: "smile",
            },
          ],
        },
      },
    });
  });
});

describe("pipeline metadata live-edit helpers", () => {
  it("derives authored pipeline edits from input binding metadata", () => {
    const edits = derivePipelineConfigFromInputBindings({
      child: {
        inputId: "child",
        slots: [
          { id: "self", inputId: "__self__" },
          { id: "slot-parent", inputId: "parent", alias: "drive" },
        ],
        metadata: {
          vizij: {
            pipelineV1: {
              migration: { status: "migrated" },
              parentBlend: {
                mode: "normalized-additive",
                expression: "blend(drive)",
              },
              directInput: { enabled: false },
              override: { enabled: true, value: 0.25 },
              clamp: { enabled: true },
              links: {
                "link/parent->child": {
                  parentInputId: "parent",
                  childInputId: "child",
                  scale: 0.5,
                  offset: 0.1,
                  enabled: true,
                  expression: "parent * scale + offset",
                },
              },
            },
          },
        },
      },
    } as any);

    expect(edits.byInputId.child).toMatchObject({
      inputId: "child",
      parents: [
        {
          inputId: "parent",
          linkId: "link/parent->child",
          alias: "drive",
          expression: "parent * scale + offset",
        },
      ],
      parentBlend: {
        mode: "normalized-additive",
        expression: "blend(drive)",
      },
      directInput: { enabled: false },
      override: { enabledDefault: true, valueDefault: 0.25 },
      clamp: { enabled: true },
    });
    expect(edits.links["link/parent->child"]).toMatchObject({
      parentInputId: "parent",
      childInputId: "child",
      scale: 0.5,
      offset: 0.1,
      enabled: true,
      expression: "parent * scale + offset",
    });
  });

  it("merges imported pipeline metadata with local edits while preserving formulas", () => {
    const merged = mergeImportedAndLocalPipelineConfigByInputId(
      {
        child: {
          inputId: "child",
          parents: [
            {
              inputId: "parent",
              linkId: "link/parent->child",
              alias: "oldAlias",
              expression: "old expression",
            },
          ],
        },
      },
      {
        child: {
          inputId: "child",
          parents: [
            {
              inputId: "parent",
              linkId: "link/parent->child",
              alias: "newAlias",
            },
          ],
          directInput: { enabled: false },
        },
      },
    );

    expect(merged.child).toMatchObject({
      inputId: "child",
      directInput: { enabled: false },
      parents: [
        {
          inputId: "parent",
          linkId: "link/parent->child",
          alias: "newAlias",
          expression: "old expression",
        },
      ],
    });
  });

  it("merges pipeline links while preserving or replacing expressions intentionally", () => {
    const imported = {
      "link/parent->child": {
        linkId: "link/parent->child",
        parentInputId: "parent",
        childInputId: "child",
        scale: 1,
        expression: "old expression",
      },
      "link/other->child": {
        linkId: "link/other->child",
        parentInputId: "other",
        childInputId: "child",
        expression: "old other expression",
      },
    };

    expect(
      mergeImportedAndLocalPipelineLinksById(imported, {
        "link/parent->child": {
          linkId: "link/parent->child",
          parentInputId: "parent",
          childInputId: "child",
          scale: 2,
        },
        "link/other->child": {
          linkId: "link/other->child",
          parentInputId: "other",
          childInputId: "child",
          expression: "new other expression",
        },
      }),
    ).toMatchObject({
      "link/parent->child": {
        scale: 2,
        expression: "old expression",
      },
      "link/other->child": {
        expression: "new other expression",
      },
    });
  });

  it("sanitizes pipeline metadata against available inputs and repairs dead relay drivers", () => {
    const result = sanitizePipelineConfigAndLinksForAvailableInputs({
      availableInputIds: new Set(["parent", "relay", "child"]),
      byInputId: {
        relay: {
          inputId: "relay",
          directInput: { enabled: false },
          children: ["child"],
        },
        child: {
          inputId: "child",
          parents: [{ inputId: "parent", linkId: "link/parent->child" }],
        },
        missing: {
          inputId: "missing",
          parents: [{ inputId: "parent", linkId: "link/parent->missing" }],
        },
      },
      linksById: {
        "link/parent->child": {
          parentInputId: "parent",
          childInputId: "child",
        },
        "link/parent->missing": {
          parentInputId: "parent",
          childInputId: "missing",
        },
      },
    });

    expect(Object.keys(result.byInputId).sort()).toEqual(["child", "relay"]);
    expect(result.byInputId.relay).toMatchObject({
      directInput: { enabled: true },
    });
    expect(result.linksById).toEqual({
      "link/parent->child": {
        linkId: "link/parent->child",
        parentInputId: "parent",
        childInputId: "child",
      },
    });
  });

  it("reads a pipeline link patch from binding metadata", () => {
    expect(
      readPipelineLinkPatch(
        {
          inputId: "child",
          slots: [],
          metadata: {
            vizij: {
              pipelineV1: {
                links: {
                  "link/parent->child": {
                    scale: 0.2,
                    offset: -0.1,
                    enabled: false,
                    expression: "parent * 0.2",
                  },
                },
              },
            },
          },
        } as any,
        "parent",
        "child",
      ),
    ).toEqual({
      scale: 0.2,
      offset: -0.1,
      enabled: false,
      expression: "parent * 0.2",
    });
  });
});

describe("deriveLockedInspectorTargetsFromPipeline", () => {
  it("locks targets whose preferred propsrig direct input is disabled", () => {
    const jawOpen = createStandardRigInputFromPath("/propsrig/jaw_open");
    const browRaise = createStandardRigInputFromPath("/propsrig/brow_raise");

    const bindings = {
      target_jaw: {
        inputId: jawOpen.id,
        slots: [{ id: "s1", inputId: jawOpen.id }],
      },
      target_brow: {
        inputId: browRaise.id,
        slots: [{ id: "s1", inputId: browRaise.id }],
      },
    } as unknown as BindingMap;

    const lockedTargets = deriveLockedInspectorTargetsFromPipeline({
      bindings,
      standardInputs: [jawOpen, browRaise],
      pipelineConfigByInputId: {
        [jawOpen.id]: { directInput: { enabled: false } },
        [browRaise.id]: { directInput: { enabled: true } },
      },
    });

    expect(Array.from(lockedTargets).sort()).toEqual(["target_jaw"]);
  });

  it("prefers canonical propsrig input ids when target bindings include multiple sources", () => {
    const legacyInput = createStandardRigInputFromPath(
      "/standard/semio/jaw/open",
    );
    const propsRigInput = createStandardRigInputFromPath("/propsrig/jaw_open");

    const bindings = {
      target_jaw: {
        inputId: legacyInput.id,
        slots: [
          { id: "s1", inputId: legacyInput.id },
          { id: "s2", inputId: propsRigInput.id },
        ],
      },
    } as unknown as BindingMap;

    const lockedTargets = deriveLockedInspectorTargetsFromPipeline({
      bindings,
      standardInputs: [legacyInput, propsRigInput],
      pipelineConfigByInputId: {
        [propsRigInput.id]: { directInput: { enabled: false } },
      },
    });

    expect(Array.from(lockedTargets).sort()).toEqual(["target_jaw"]);
  });

  it("returns no locked targets when pipeline has no disabled direct input entries", () => {
    const jawOpen = createStandardRigInputFromPath("/propsrig/jaw_open");
    const bindings = {
      target_jaw: {
        inputId: jawOpen.id,
        slots: [{ id: "s1", inputId: jawOpen.id }],
      },
    } as unknown as BindingMap;

    const lockedTargets = deriveLockedInspectorTargetsFromPipeline({
      bindings,
      standardInputs: [jawOpen],
      pipelineConfigByInputId: {
        [jawOpen.id]: { directInput: { enabled: true } },
      },
    });

    expect(lockedTargets.size).toBe(0);
  });
});

describe("canonicalizeImportedPipelineMetadataV1", () => {
  it("normalizes legacy slot aliases to resolved parent variables", () => {
    const childInput = createStandardRigInputFromPath("/propsrig/jaw_open");
    const chinInput = createStandardRigInputFromPath("/custom/chin");
    const jawUdInput = createStandardRigInputFromPath("/custom/jaw_ud");

    const canonical = canonicalizeImportedPipelineMetadataV1({
      faceId: "robot",
      standardInputs: [childInput, chinInput, jawUdInput],
      pipelineMetadataV1: {
        links: {
          [`link/${chinInput.id}->${childInput.id}`]: {
            linkId: `link/${chinInput.id}->${childInput.id}`,
            parentInputId: chinInput.id,
            childInputId: childInput.id,
            scale: 1,
            offset: 0,
            enabled: true,
            expression: "value = parent * scale + offset",
          },
          [`link/${jawUdInput.id}->${childInput.id}`]: {
            linkId: `link/${jawUdInput.id}->${childInput.id}`,
            parentInputId: jawUdInput.id,
            childInputId: childInput.id,
            scale: 1,
            offset: 0,
            enabled: true,
          },
        },
        byInputId: {
          [childInput.id]: {
            inputId: childInput.id,
            parentBlend: {
              expression:
                "parentContribution = normalizedAdditive([s1, s2], baseline=default)",
            },
          },
        },
      },
    });

    const childConfig = canonical?.byInputId?.[childInput.id] as
      | {
          parents?: Array<{ alias?: string }>;
          parentBlend?: { expression?: string };
        }
      | undefined;
    expect(childConfig?.parents?.map((parent) => parent.alias)).toEqual([
      "value",
      "P2",
    ]);
    expect(childConfig?.parentBlend?.expression).toBe(
      "parentContribution = normalizedAdditive([value, P2], baseline=default)",
    );
  });
});
