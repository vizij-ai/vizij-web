import { describe, expect, it } from "vitest";
import {
  getStudioV2CompatibilityReport,
  makeMigratedLegacyVizijTransitionAsset,
  migrateLegacyVizijAnimationToStudioV2,
} from "./transitionWorkbench";

describe("legacy Vizij animation migration", () => {
  it("converts normalized stamps and explicit handles into Studio v2 milliseconds", () => {
    const result = migrateLegacyVizijAnimationToStudioV2({
      id: "legacy-scalar",
      name: "Legacy Scalar",
      duration: 2000,
      groups: {
        curves: {
          name: "Curves",
          children: ["legacy-scalar-track"],
        },
      },
      tracks: [
        {
          id: "legacy-scalar-track",
          name: "Legacy Scalar Track",
          animatableId: "legacy/scalar",
          points: [
            {
              id: "k0",
              stamp: 0,
              value: 0,
              transitions: { out: { x: 0.25, y: 0.1 } },
            },
            {
              id: "k1",
              stamp: 0.5,
              value: 1,
              transitions: {
                in: { x: -0.15, y: -0.2 },
                out: "cubic",
                pairing: "free",
              },
            },
            {
              id: "k2",
              stamp: 1,
              value: 0.25,
              transitions: { in: "sine" },
            },
          ],
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.animation).toMatchObject({
      id: "legacy-scalar",
      name: "Legacy Scalar",
      formatVersion: 2,
      defaultViewportExtent: 2000,
    });
    expect(result.animation.duration).toBeUndefined();
    expect(result.animation.groups).toEqual([
      {
        id: "curves",
        name: "Curves",
        children: ["legacy-scalar-track"],
      },
    ]);
    expect(
      result.animation.tracks[0].points.map((point) => point.stamp),
    ).toEqual([0, 1000, 2000]);
    expect(result.animation.tracks[0].points[0].transitions?.out).toEqual({
      x: 500,
      y: 0.1,
    });
    expect(result.animation.tracks[0].points[1].transitions).toEqual({
      in: { x: -300, y: -0.2 },
      out: "cubic",
      pairing: "free",
    });
    expect(result.animation.tracks[0].points[2].transitions?.in).toBe("sine");
    expect(getStudioV2CompatibilityReport(result.animation).isCompatible).toBe(
      true,
    );
  });

  it("preserves bool and text hold tracks while migrating their stamps", () => {
    const result = migrateLegacyVizijAnimationToStudioV2({
      id: "legacy-holds",
      name: "Legacy Holds",
      duration: 3000,
      groups: {},
      tracks: [
        {
          id: "legacy-bool",
          name: "Legacy Bool",
          animatableId: "legacy/bool",
          points: [
            { id: "b0", stamp: 0, value: false },
            { id: "b1", stamp: 0.5, value: true },
            { id: "b2", stamp: 1, value: false },
          ],
        },
        {
          id: "legacy-text",
          name: "Legacy Text",
          animatableId: "legacy/text",
          points: [
            { id: "t0", stamp: 0, value: "idle" },
            { id: "t1", stamp: 0.25, value: "talk" },
            { id: "t2", stamp: 1, value: "done" },
          ],
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.animation.groups).toEqual([]);
    expect(result.animation.tracks[0].points).toEqual([
      { id: "b0", stamp: 0, value: false },
      { id: "b1", stamp: 1500, value: true },
      { id: "b2", stamp: 3000, value: false },
    ]);
    expect(result.animation.tracks[1].points).toEqual([
      { id: "t0", stamp: 0, value: "idle" },
      { id: "t1", stamp: 750, value: "talk" },
      { id: "t2", stamp: 3000, value: "done" },
    ]);
    expect(getStudioV2CompatibilityReport(result.animation).isCompatible).toBe(
      true,
    );
  });

  it("warns and preserves explicit handle x values that already look millisecond-domain", () => {
    const result = migrateLegacyVizijAnimationToStudioV2({
      id: "legacy-ambiguous-handles",
      name: "Legacy Ambiguous Handles",
      duration: 1000,
      groups: {},
      tracks: [
        {
          id: "legacy-track",
          name: "Legacy Track",
          animatableId: "legacy/value",
          points: [
            {
              id: "a",
              stamp: 0,
              value: 0,
              transitions: { out: { x: 240, y: 0.5 } },
            },
            { id: "b", stamp: 1, value: 1 },
          ],
        },
      ],
    });

    expect(result.animation.tracks[0].points[0].transitions?.out).toEqual({
      x: 240,
      y: 0.5,
    });
    expect(result.diagnostics).toEqual([
      {
        code: "transition-x-already-ms",
        level: "warning",
        message:
          "Transition x value looked larger than the legacy normalized domain, so it was preserved as milliseconds.",
        path: "tracks[0].points[0].transitions.out",
      },
    ]);
    expect(getStudioV2CompatibilityReport(result.animation).isCompatible).toBe(
      true,
    );
  });

  it("builds a migrated legacy fixture that covers Studio transition parity", () => {
    const result = makeMigratedLegacyVizijTransitionAsset();

    expect(result.diagnostics).toEqual([]);
    expect(result.animation.id).toBe("legacy-vizij-migrated-transition-asset");
    expect(result.animation.formatVersion).toBe(2);
    expect(result.animation.defaultViewportExtent).toBe(8000);
    expect(result.animation.duration).toBeUndefined();
    expect(getStudioV2CompatibilityReport(result.animation)).toMatchObject({
      sourceKind: "legacy-migrated",
      isCompatible: true,
      usesMillisecondStamps: true,
      groupsAreStudioArray: true,
    });
  });
});
