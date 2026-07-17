import { describe, expect, it } from "vitest";
import {
  collectAnimationClipOutputPaths,
  diffAnimationAggregateValues,
  resolveAnimationBridgeOutputPaths,
} from "../utils/animationBridge";

describe("resolveAnimationBridgeOutputPaths", () => {
  it("adds rig-scoped fallback for non-rig channels", () => {
    expect(
      resolveAnimationBridgeOutputPaths("controls/jaw/open", "hugo"),
    ).toEqual(["controls/jaw/open", "rig/hugo/controls/jaw/open"]);
  });

  it("keeps animation channels scoped only to animation namespace", () => {
    expect(
      resolveAnimationBridgeOutputPaths(
        "animation/authoring.timeline.main/controls/jaw/open",
        "hugo",
      ),
    ).toEqual(["animation/authoring.timeline.main/controls/jaw/open"]);
  });

  it("adds current-face alias for rig-scoped channels from other faces", () => {
    expect(
      resolveAnimationBridgeOutputPaths("rig/toasty/controls/jaw/open", "hugo"),
    ).toEqual(["rig/hugo/controls/jaw/open", "rig/toasty/controls/jaw/open"]);
  });

  it("routes simple channels through rig input map when face id is unavailable", () => {
    expect(
      resolveAnimationBridgeOutputPaths("blink", undefined, {
        blink: "rig/quori_latest/blink",
      }),
    ).toEqual(["blink", "rig/quori_latest/blink"]);
  });

  it("uses rig input map mapping even when channel is not rig scoped", () => {
    expect(
      resolveAnimationBridgeOutputPaths("controls/eyes/blink", "face", {
        "controls/eyes/blink": "rig/quori_latest/blink",
      }),
    ).toEqual([
      "controls/eyes/blink",
      "rig/face/controls/eyes/blink",
      "rig/quori_latest/blink",
    ]);
  });

  it("collects concrete clip output paths without creating animation bridge inputs", () => {
    expect(
      collectAnimationClipOutputPaths(
        {
          tracks: [
            {
              channel: "controls/jaw/open",
              keyframes: [{ time: 0, value: 0 }],
            },
          ],
        },
        "hugo",
      ),
    ).toEqual(["controls/jaw/open", "rig/hugo/controls/jaw/open"]);
  });

  it("clears removed aggregate paths instead of converting them to zero writes", () => {
    expect(
      diffAnimationAggregateValues(
        new Map([["rig/hugo/poses/pose_happy.weight", 0.75]]),
        new Map(),
      ),
    ).toEqual([
      {
        kind: "clear",
        path: "rig/hugo/poses/pose_happy.weight",
      },
    ]);
  });

  it("preserves explicit zero-valued aggregates as real writes", () => {
    expect(
      diffAnimationAggregateValues(
        new Map([["rig/hugo/poses/pose_happy.weight", 0.75]]),
        new Map([["rig/hugo/poses/pose_happy.weight", 0]]),
      ),
    ).toEqual([
      {
        kind: "set",
        path: "rig/hugo/poses/pose_happy.weight",
        value: 0,
      },
    ]);
  });
});
