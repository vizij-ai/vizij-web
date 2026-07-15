import { act } from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VizijAssetBundle } from "@vizij/runtime-react";
import { DemoEmotionRow } from "./DemoEmotionRow";

const animateValueSpy = vi.fn();
const runtimeState: { ready: boolean; assetBundle: VizijAssetBundle } = {
  ready: true,
  assetBundle: {} as VizijAssetBundle,
};

vi.mock("@vizij/runtime-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vizij/runtime-react")>();
  return {
    ...actual,
    useVizijRuntime: () => ({
      ready: runtimeState.ready,
      animateValue: animateValueSpy,
      faceId: "face",
      assetBundle: runtimeState.assetBundle,
    }),
  };
});

function makeBundle(poseNames: string[]): VizijAssetBundle {
  return {
    namespace: "empty-demo",
    glb: { kind: "url", src: "/assets/demo.glb" },
    pose: {
      config: {
        version: 1,
        faceId: "face",
        neutralInputs: {},
        poses: poseNames.map((name) => ({
          id: `pose_${name.toLowerCase()}`,
          name,
          values: {},
        })),
      },
    },
  } as VizijAssetBundle;
}

describe("DemoEmotionRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    animateValueSpy.mockReset();
    runtimeState.ready = true;
    runtimeState.assetBundle = makeBundle([
      "Happy",
      "Sad",
      "Surprise",
      "Angry",
      "Concerned",
      "Sleepy",
      "Neutral",
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders emotion buttons in canonical order, excluding neutral", () => {
    const { container } = render(<DemoEmotionRow />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Concerned",
      "Happy",
      "Sad",
      "Sleepy",
      "Surprise",
      "Angry",
    ]);
  });

  it("animates the pose weight up and auto-releases it", () => {
    const { container } = render(<DemoEmotionRow />);
    const happy = container.querySelector(
      '[data-testid="empty-state-demo-emotion-happy"]',
    ) as HTMLButtonElement;
    expect(happy).toBeTruthy();

    fireEvent.click(happy);
    expect(animateValueSpy).toHaveBeenCalledWith(
      "rig/face/poses/pose_happy.weight",
      { float: 0.75 },
      { duration: 0.25 },
    );

    animateValueSpy.mockClear();
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(animateValueSpy).toHaveBeenCalledWith(
      "rig/face/poses/pose_happy.weight",
      { float: 0 },
      { duration: 0.35 },
    );
  });

  it("renders nothing when the runtime is not ready", () => {
    runtimeState.ready = false;
    const { container } = render(<DemoEmotionRow />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the bundle has no emotion poses", () => {
    runtimeState.assetBundle = makeBundle([]);
    const { container } = render(<DemoEmotionRow />);
    expect(container.firstChild).toBeNull();
  });
});
