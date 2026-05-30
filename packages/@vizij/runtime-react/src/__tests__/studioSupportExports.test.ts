import { describe, expect, it } from "vitest";
import {
  buildRigInputPath,
  resolveRuntimeUpdatePlan,
  sampleTrackAtTime,
} from "../index";

describe("runtime-react Studio support exports", () => {
  it("keeps the package-root Studio helper surface available", () => {
    expect(buildRigInputPath("hugo", "/controls/jaw/open")).toBe(
      "rig/hugo/controls/jaw/open",
    );
    expect(
      sampleTrackAtTime(
        {
          channel: "controls/jaw/open",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
        },
        0.5,
      ),
    ).toBeCloseTo(0.5, 6);
    expect(
      resolveRuntimeUpdatePlan(
        null,
        {
          glb: {
            kind: "world",
            world: {},
            animatables: {},
            bundle: null,
          },
        } as any,
        "auto",
      ),
    ).toEqual({ reloadAssets: true, reregisterGraphs: false });
  });
});
