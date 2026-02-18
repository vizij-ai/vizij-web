import { describe, expect, it } from "vitest";
import { createStandardRigInput, type StandardRigInput } from "@vizij/utils";
import {
  getStandardInputResolutionIndex,
  type StandardInputResolutionMetrics,
} from "./standardInputResolutionIndex";

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

describe("standardInputResolutionIndex", () => {
  it("resolves unique alias ids via normalized id/path keys", () => {
    const canonical = makeInput("autorig_mouth_open", "/autorig/mouth/open");
    const index = getStandardInputResolutionIndex(
      new Map([[canonical.id, canonical]]),
    );

    expect(index.resolveUniqueAliasId("/autorig/mouth/open")).toBe(
      canonical.id,
    );
    expect(index.resolveUniqueAliasId("autorig_mouth_open")).toBe(canonical.id);
    expect(index.resolveUniqueAliasId("missing_alias")).toBeNull();
  });

  it("returns null for ambiguous normalized alias matches", () => {
    const first = makeInput("jaw_open_a", "/jaw/open");
    const second = makeInput("jaw_open_b", "/jaw/open");
    const index = getStandardInputResolutionIndex(
      new Map([
        [first.id, first],
        [second.id, second],
      ]),
    );

    expect(index.resolveUniqueAliasId("/jaw/open")).toBeNull();
  });

  it("indexes equivalent canonical and /standard-prefixed target ids", () => {
    const canonical = makeInput(
      "autorig_scene_rotation_z",
      "/autorig/scene/rotation/z",
    );
    const standardPrefixed = makeInput(
      "standard_autorig_scene_rotation_z",
      "/standard/autorig/scene/rotation/z",
    );
    const index = getStandardInputResolutionIndex(
      new Map([
        [canonical.id, canonical],
        [standardPrefixed.id, standardPrefixed],
      ]),
    );

    expect(index.getEquivalentInputIds(canonical.id)).toEqual([
      canonical.id,
      standardPrefixed.id,
    ]);
  });

  it("caches canonical-id resolution misses for repeated hot-path lookups", () => {
    const canonical = makeInput("autorig_target", "/autorig/target/openness");
    const sourceMap = new Map([[canonical.id, canonical]]);
    const index = getStandardInputResolutionIndex(sourceMap);
    const metrics: StandardInputResolutionMetrics = {
      canonicalResolutionCalls: 0,
      canonicalResolutionMisses: 0,
    };

    const first = index.resolveCanonicalId(
      "/rig/element/target/openness",
      metrics,
    );
    const second = index.resolveCanonicalId(
      "/rig/element/target/openness",
      metrics,
    );
    const third = index.resolveCanonicalId(
      "/rig/element/target/openness",
      metrics,
    );

    expect(first).toBe(canonical.id);
    expect(second).toBe(canonical.id);
    expect(third).toBe(canonical.id);
    expect(metrics.canonicalResolutionCalls).toBe(3);
    expect(metrics.canonicalResolutionMisses).toBe(1);
  });

  it("keeps equivalent-path lookup hot path on cached canonical resolution", () => {
    const canonical = makeInput(
      "autorig_scene_rotation_z",
      "/autorig/scene/rotation/z",
    );
    const prefixed = makeInput(
      "standard_autorig_scene_rotation_z",
      "/standard/autorig/scene/rotation/z",
    );
    const index = getStandardInputResolutionIndex(
      new Map([
        [canonical.id, canonical],
        [prefixed.id, prefixed],
      ]),
    );
    const metrics: StandardInputResolutionMetrics = {
      canonicalResolutionCalls: 0,
      canonicalResolutionMisses: 0,
    };

    const first = index.getEquivalentInputIds(
      "/rig/element/scene/rotation/z",
      metrics,
    );
    const second = index.getEquivalentInputIds(
      "/rig/element/scene/rotation/z",
      metrics,
    );

    expect(first).toEqual([canonical.id, prefixed.id]);
    expect(second).toEqual([canonical.id, prefixed.id]);
    expect(metrics.canonicalResolutionCalls).toBe(2);
    expect(metrics.canonicalResolutionMisses).toBe(1);
  });
});
