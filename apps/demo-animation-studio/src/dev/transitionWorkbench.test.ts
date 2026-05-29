import { describe, expect, it } from "vitest";
import {
  STUDIO_STANDARD_TRANSITIONS,
  STUDIO_TRANSITION_DIRECTIVES,
  applySegmentTransitionMode,
  dragHandleToTransitionDelta,
  getAnimationExtentMs,
  getStudioV2CompatibilityReport,
  makeStudioCanonicalTransitionAsset,
  getTransitionCoverage,
  makeStudioTransitionWorkbenchAnimation,
  sampleScalarTrackAt,
  updateSegmentHandle,
} from "./transitionWorkbench";

describe("transition workbench Studio v2 fixture", () => {
  it("can ingest a Studio-canonical stored animation asset", () => {
    const animation = makeStudioCanonicalTransitionAsset();
    const report = getStudioV2CompatibilityReport(animation);

    expect(animation.id).toBe("studio-canonical-transition-asset");
    expect(animation.formatVersion).toBe(2);
    expect(animation.defaultViewportExtent).toBe(8200);
    expect(animation.duration).toBeUndefined();
    expect(Array.isArray(animation.groups)).toBe(true);
    expect(report.sourceKind).toBe("studio-canonical");
    expect(report.isCompatible).toBe(true);
    expect(report.hasLegacyDuration).toBe(false);
    expect(report.usesMillisecondStamps).toBe(true);
    expect(report.coverage.standardNames).toEqual([
      ...STUDIO_STANDARD_TRANSITIONS,
    ]);
    expect(report.coverage.directives).toEqual([
      ...STUDIO_TRANSITION_DIRECTIVES,
    ]);
    expect(report.coverage.hasExplicitHandles).toBe(true);
    expect(report.coverage.hasStepValueTracks).toBe(true);
  });

  it("uses the Studio v2 schema with millisecond stamps and full transition coverage", () => {
    const animation = makeStudioTransitionWorkbenchAnimation();

    expect(animation.formatVersion).toBe(2);
    expect(animation.defaultViewportExtent).toBe(8000);
    expect(animation.duration).toBeUndefined();
    expect(Array.isArray(animation.groups)).toBe(true);
    expect(getAnimationExtentMs(animation)).toBe(8000);

    const scalarTrack = animation.tracks.find(
      (track) => track.id === "workbench-transition-scalar",
    );
    expect(scalarTrack).toBeDefined();
    expect(scalarTrack?.points.some((point) => point.stamp > 1)).toBe(true);

    const coverage = getTransitionCoverage(animation);
    expect(coverage.standardNames).toEqual([...STUDIO_STANDARD_TRANSITIONS]);
    expect(coverage.directives).toEqual([...STUDIO_TRANSITION_DIRECTIVES]);
    expect(coverage.hasExplicitHandles).toBe(true);
    expect(coverage.hasStepValueTracks).toBe(true);
  });

  it("keeps a Studio-canonical asset compatible after live handle editing", () => {
    const animation = makeStudioCanonicalTransitionAsset();
    const dragged = updateSegmentHandle(
      animation,
      "workbench-transition-scalar",
      0,
      "startOut",
      { stamp: 680, value: 0.76 },
    );
    const report = getStudioV2CompatibilityReport(dragged);
    const scalarTrack = dragged.tracks.find(
      (track) => track.id === "workbench-transition-scalar",
    );

    expect(report.isCompatible).toBe(true);
    expect(report.sourceKind).toBe("live-edited");
    expect(scalarTrack?.points[0].transitions?.out).toEqual({
      x: 680,
      y: 0.58,
    });
  });

  it("rejects legacy unit-domain animations from the Studio v2 compatibility report", () => {
    const legacyAnimation = {
      id: "legacy-unit",
      name: "Legacy Unit",
      duration: 1000,
      groups: {},
      tracks: [
        {
          id: "legacy-track",
          name: "Legacy Track",
          animatableId: "legacy/value",
          points: [
            { id: "a", stamp: 0, value: 0 },
            { id: "b", stamp: 1, value: 1 },
          ],
        },
      ],
    };

    const report = getStudioV2CompatibilityReport(legacyAnimation);

    expect(report.isCompatible).toBe(false);
    expect(report.hasLegacyDuration).toBe(true);
    expect(report.usesMillisecondStamps).toBe(false);
    expect(report.issues).toContain("formatVersion is not 2");
    expect(report.issues).toContain("groups is not a Studio track-group array");
  });

  it("stores dragged handles as anchor-relative Studio world deltas", () => {
    expect(
      dragHandleToTransitionDelta({
        anchor: { stamp: 1000, value: 0.4 },
        handle: { stamp: 760, value: 0.9 },
      }),
    ).toEqual({ x: -240, y: 0.5 });

    expect(
      dragHandleToTransitionDelta({
        anchor: { stamp: 1000, value: 0.4 },
        handle: { stamp: 1240, value: 0.1 },
      }),
    ).toEqual({ x: 240, y: -0.3 });
  });

  it("can switch segment modes and preserve explicit handles after a drag", () => {
    const animation = makeStudioTransitionWorkbenchAnimation();
    const quart = applySegmentTransitionMode(
      animation,
      "workbench-transition-scalar",
      2,
      "quart",
    );
    const quartTrack = quart.tracks.find(
      (track) => track.id === "workbench-transition-scalar",
    );

    expect(quartTrack?.points[2].transitions?.out).toBe("quart");
    expect(quartTrack?.points[3].transitions?.in).toBe("quart");

    const explicit = applySegmentTransitionMode(
      animation,
      "workbench-transition-scalar",
      2,
      "explicit-handles",
    );
    const explicitTrack = explicit.tracks.find(
      (track) => track.id === "workbench-transition-scalar",
    );
    expect(typeof explicitTrack?.points[2].transitions?.out).toBe("object");
    expect(typeof explicitTrack?.points[3].transitions?.in).toBe("object");

    const dragged = updateSegmentHandle(
      animation,
      "workbench-transition-scalar",
      1,
      "endIn",
      { stamp: 1325, value: 0.78 },
    );
    const draggedTrack = dragged.tracks.find(
      (track) => track.id === "workbench-transition-scalar",
    );
    expect(draggedTrack?.points[2].transitions?.in).toEqual({
      x: -275,
      y: 0.18,
    });
  });

  it("samples every Studio-compatible scalar transition segment without gaps", () => {
    const animation = makeStudioTransitionWorkbenchAnimation();
    const scalarTrack = animation.tracks.find(
      (track) => track.id === "workbench-transition-scalar",
    );
    expect(scalarTrack).toBeDefined();

    for (
      let index = 0;
      index < (scalarTrack?.points.length ?? 1) - 1;
      index++
    ) {
      const start = scalarTrack!.points[index];
      const end = scalarTrack!.points[index + 1];
      const sample = sampleScalarTrackAt(
        scalarTrack!,
        start.stamp + (end.stamp - start.stamp) / 2,
      );

      expect(Number.isFinite(sample)).toBe(true);
    }
  });
});
