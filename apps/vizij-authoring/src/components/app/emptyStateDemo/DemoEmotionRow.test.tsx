import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DemoEmotionRow } from "./DemoEmotionRow";

const animateValue = vi.fn().mockResolvedValue(undefined);
const face: { status: string; expressionKeys: string[] } = {
  status: "ready",
  expressionKeys: [],
};
const runtime = {
  path: (relative: string) => `rig/quori/${relative}`,
  listKeys: async (prefix: string) =>
    face.expressionKeys
      .map((name) => `${prefix}${name}`)
      .map((path) => ({ path, __meta: {} })),
};

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({ status: face.status, runtime }),
  useAnimateValue: () => ({ animateValue }),
}));

/** Let the listed keys arrive. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("DemoEmotionRow", () => {
  beforeEach(() => {
    animateValue.mockClear();
    face.status = "ready";
    face.expressionKeys = [
      "angry",
      "surprised",
      "happy",
      "neutral",
      "sad",
      "bored",
      "concerned",
      "sleepy",
    ];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("offers the featured expressions the face implements, in order", async () => {
    face.expressionKeys = ["sad", "happy", "bored", "angry"];
    render(<DemoEmotionRow />);
    await settle();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["Happy", "Sad", "Angry"]);
  });

  it("eases the expression up, the others down, and releases it", async () => {
    render(<DemoEmotionRow />);
    await settle();
    vi.useFakeTimers();

    fireEvent.click(screen.getByTestId("empty-state-demo-emotion-happy"));
    const rise = { duration: 0.25, easing: "easeInOut" };
    expect(animateValue).toHaveBeenCalledWith(
      "rig/quori/standard/vizij/expression/happy",
      0.75,
      rise,
    );
    expect(animateValue).toHaveBeenCalledWith(
      "rig/quori/standard/vizij/expression/sad",
      0,
      rise,
    );

    animateValue.mockClear();
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(animateValue.mock.calls).toEqual([
      [
        "rig/quori/standard/vizij/expression/happy",
        0,
        { duration: 0.35, easing: "easeInOut" },
      ],
    ]);
  });

  it("renders nothing until the face is ready", async () => {
    face.status = "loading";
    const { container } = render(<DemoEmotionRow />);
    await settle();
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a face implementing none of them", async () => {
    face.expressionKeys = ["bored"];
    const { container } = render(<DemoEmotionRow />);
    await settle();
    expect(container.firstChild).toBeNull();
  });
});
