import { describe, expect, it } from "vitest";
import { resolveAnimationBridgeOutputPaths } from "../utils/animationBridge";

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
});
