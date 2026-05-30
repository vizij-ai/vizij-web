import { describe, expect, it } from "vitest";
import {
  collectAnimationClipOutputPaths,
  resolveAnimationBridgeOutputPaths,
} from "../index";

describe("animation bridge output paths", () => {
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

  it("routes simple channels through rig input maps", () => {
    expect(
      resolveAnimationBridgeOutputPaths("blink", undefined, {
        blink: "rig/quori_latest/blink",
      }),
    ).toEqual(["blink", "rig/quori_latest/blink"]);
  });

  it("collects concrete clip output paths without creating animation inputs", () => {
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
});
