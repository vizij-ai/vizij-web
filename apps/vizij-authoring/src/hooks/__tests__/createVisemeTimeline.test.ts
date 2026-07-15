import { describe, expect, it } from "vitest";
import { createVisemeTimeline } from "../useSpeechPlayback";
import type { SpeechMark } from "../../types/polly";

const viseme = (time: number, value: string): SpeechMark => ({
  time,
  type: "viseme",
  value,
});

const resolveSegmentPath = (segment: string): string | null =>
  `rig/face/poses/${segment}.weight`;

describe("createVisemeTimeline", () => {
  it("returns an empty timeline for no visemes", () => {
    expect(createVisemeTimeline([], resolveSegmentPath)).toEqual([]);
  });

  it("appends a trailing rest entry after the last viseme", () => {
    const timeline = createVisemeTimeline(
      [viseme(100, "p")],
      resolveSegmentPath,
    );
    expect(timeline).toHaveLength(2);
    const rest = timeline[timeline.length - 1];
    expect(rest.path).toBeNull();
    expect(rest.isSilence).toBe(true);
    expect(rest.displayLabel).toBe("rest");
    expect(rest.start).toBeGreaterThan(timeline[0].start);
  });

  it("sorts entries by start time and keeps end greater than start", () => {
    const timeline = createVisemeTimeline(
      [viseme(300, "t"), viseme(100, "p"), viseme(300, "s")],
      resolveSegmentPath,
    );
    for (let i = 0; i < timeline.length; i += 1) {
      expect(timeline[i].end).toBeGreaterThan(timeline[i].start);
      if (i > 0) {
        expect(timeline[i].start).toBeGreaterThanOrEqual(timeline[i - 1].start);
      }
    }
  });

  it("clamps the transition ramp between 45 and 320 ms", () => {
    const timeline = createVisemeTimeline(
      [viseme(0, "p"), viseme(10, "t"), viseme(2000, "s")],
      resolveSegmentPath,
    );
    for (const entry of timeline) {
      const ramp = entry.start - entry.transitionStart;
      expect(ramp).toBeGreaterThanOrEqual(45);
      expect(ramp).toBeLessThanOrEqual(320);
    }
  });

  it("marks silence codes and unresolvable segments as silence", () => {
    const timeline = createVisemeTimeline(
      [viseme(0, "sil"), viseme(100, "p")],
      resolveSegmentPath,
    );
    expect(timeline[0].isSilence).toBe(true);
    expect(timeline[0].path).toBeNull();
    expect(timeline[1].isSilence).toBe(false);
    expect(timeline[1].path).toBe("rig/face/poses/p.weight");

    const unresolved = createVisemeTimeline([viseme(0, "p")], () => null);
    expect(unresolved[0].isSilence).toBe(true);
    expect(unresolved[0].path).toBeNull();
  });

  it("maps polly viseme codes to display labels", () => {
    const timeline = createVisemeTimeline(
      [viseme(0, "@"), viseme(100, "T"), viseme(200, "u")],
      resolveSegmentPath,
    );
    expect(timeline.map((entry) => entry.displayLabel)).toEqual([
      "@",
      "th",
      "oo",
      "rest",
    ]);
  });
});
