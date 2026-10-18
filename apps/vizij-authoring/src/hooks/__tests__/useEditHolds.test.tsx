import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Runtime } from "@vizij/runtime";
import { useEditHolds } from "../useEditHolds";

function device() {
  return {
    holdKeys: vi.fn(),
    releaseKeys: vi.fn(),
  };
}

/** Renders the hook and hands out its `holdWhileEditing`. */
function renderHolds(runtime: ReturnType<typeof device> | null) {
  let hold: (key: string) => void = () => {};
  function Harness() {
    hold = useEditHolds(runtime as unknown as Runtime | null);
    return null;
  }
  const view = render(<Harness />);
  return {
    hold: (key: string) => hold(key),
    rerender: () => view.rerender(<Harness />),
  };
}

describe("useEditHolds", () => {
  afterEach(cleanup);

  it("holds what an edit writes from the press, and releases it at the release", () => {
    const runtime = device();
    const { hold } = renderHolds(runtime);

    window.dispatchEvent(new Event("pointerdown"));
    hold("rig/face/poses/happy.weight");
    hold("rig/face/poses/happy.weight");
    expect(runtime.holdKeys.mock.calls).toEqual([
      [["rig/face/poses/happy.weight"]],
    ]);

    window.dispatchEvent(new Event("pointerup"));
    expect(runtime.releaseKeys).toHaveBeenCalledWith([
      "rig/face/poses/happy.weight",
    ]);
  });

  it("holds nothing a write outside an edit makes", () => {
    const runtime = device();
    const { hold } = renderHolds(runtime);

    hold("rig/face/gaze/x");

    expect(runtime.holdKeys).not.toHaveBeenCalled();
  });

  it("releases at a key's release, and when the page loses focus", () => {
    const runtime = device();
    const { hold } = renderHolds(runtime);

    window.dispatchEvent(new Event("keydown"));
    hold("rig/face/gaze/x");
    window.dispatchEvent(new Event("keyup"));
    window.dispatchEvent(new Event("pointerdown"));
    hold("rig/face/gaze/y");
    window.dispatchEvent(new Event("blur"));

    expect(runtime.releaseKeys.mock.calls).toEqual([
      [["rig/face/gaze/x"]],
      [["rig/face/gaze/y"]],
    ]);
  });
});
