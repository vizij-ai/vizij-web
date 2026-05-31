import { describe, expect, it } from "vitest";
import * as support from "../index";

describe("studio-support semantic exports", () => {
  it("exports promoted authoring semantics without UI-only formatters", () => {
    expect(support.resolveControllableInputId).toBeTypeOf("function");
    expect(support.resolveFaceInspectorCurrentValue).toBeTypeOf("function");
    expect(support.computePoseContributionSemantics).toBeTypeOf("function");
    expect(support.syncBindingParentAliasReferences).toBeTypeOf("function");
    expect(support.mergePipelineMetadata).toBeTypeOf("function");
    expect(support.buildPoseGraphSpecFromIr).toBeTypeOf("function");
    expect(support.parsePoseGraphSpec).toBeTypeOf("function");
    expect(support.PoseIrService.fromConfig).toBeTypeOf("function");
    expect(support.PoseGraphService.buildSpecFromIr).toBeTypeOf("function");

    const exported = support as Record<string, unknown>;
    expect(exported.formatPipelineValue).toBeUndefined();
    expect(exported.formatContributionStrength).toBeUndefined();
    expect(exported.toggleInspectorChannelLock).toBeUndefined();
  });
});
