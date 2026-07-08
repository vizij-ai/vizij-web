import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useManagedTargetLifecycle } from "../useManagedTargetLifecycle";

interface HarnessProps {
  targetOptions: { value: string }[];
  selectedTargetId: string | null;
  activeRuntimeTargetId?: string | null;
  setSelectedTargetId: (targetId: string | null) => void;
  loadSelectedTarget: (targetId: string | null) => void;
  clearInvalidActiveRuntimeTarget?: () => void;
}

function createHarness(initialProps: HarnessProps) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  let props = initialProps;
  let currentResolvedTargetId: string | null = null;

  function HookHarness() {
    currentResolvedTargetId = useManagedTargetLifecycle(props);
    return null;
  }

  flushSync(() => {
    root = createRoot(container);
    root.render(React.createElement(HookHarness));
  });

  return {
    get resolvedTargetId() {
      return currentResolvedTargetId;
    },
    rerender(nextProps: HarnessProps) {
      props = nextProps;
      flushSync(() => {
        root.render(React.createElement(HookHarness));
      });
    },
    unmount() {
      flushSync(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("useManagedTargetLifecycle", () => {
  const unmounts: Array<() => void> = [];

  afterEach(() => {
    while (unmounts.length > 0) {
      unmounts.pop()?.();
    }
  });

  it("selects and hydrates the first available target when nothing is selected", () => {
    const setSelectedTargetId = vi.fn();
    const loadSelectedTarget = vi.fn();
    const harness = createHarness({
      targetOptions: [{ value: "bundle-animation:session-a:0" }],
      selectedTargetId: null,
      setSelectedTargetId,
      loadSelectedTarget,
    });
    unmounts.push(() => harness.unmount());

    expect(harness.resolvedTargetId).toBe("bundle-animation:session-a:0");
    expect(setSelectedTargetId).toHaveBeenCalledWith(
      "bundle-animation:session-a:0",
    );
    expect(loadSelectedTarget).toHaveBeenCalledWith(
      "bundle-animation:session-a:0",
    );
  });

  it("resets the editor when the current selection disappears", () => {
    const setSelectedTargetId = vi.fn();
    const loadSelectedTarget = vi.fn();
    const harness = createHarness({
      targetOptions: [{ value: "bundle-animation:session-a:0" }],
      selectedTargetId: "bundle-animation:session-a:0",
      setSelectedTargetId,
      loadSelectedTarget,
    });
    unmounts.push(() => harness.unmount());

    setSelectedTargetId.mockClear();
    loadSelectedTarget.mockClear();

    harness.rerender({
      targetOptions: [],
      selectedTargetId: "bundle-animation:session-a:0",
      setSelectedTargetId,
      loadSelectedTarget,
    });

    expect(harness.resolvedTargetId).toBeNull();
    expect(setSelectedTargetId).toHaveBeenCalledWith(null);
    expect(loadSelectedTarget).toHaveBeenCalledWith(null);
  });

  it("hydrates the replacement imported target when a new bundle reuses index zero", () => {
    const setSelectedTargetId = vi.fn();
    const loadSelectedTarget = vi.fn();
    const harness = createHarness({
      targetOptions: [{ value: "bundle-program:session-a:0" }],
      selectedTargetId: "bundle-program:session-a:0",
      setSelectedTargetId,
      loadSelectedTarget,
    });
    unmounts.push(() => harness.unmount());

    setSelectedTargetId.mockClear();
    loadSelectedTarget.mockClear();

    harness.rerender({
      targetOptions: [{ value: "bundle-program:session-b:0" }],
      selectedTargetId: "bundle-program:session-a:0",
      setSelectedTargetId,
      loadSelectedTarget,
    });

    expect(harness.resolvedTargetId).toBe("bundle-program:session-b:0");
    expect(setSelectedTargetId).toHaveBeenCalledWith(
      "bundle-program:session-b:0",
    );
    expect(loadSelectedTarget).toHaveBeenCalledWith(
      "bundle-program:session-b:0",
    );
  });

  it("stops invalid runtime playback when the active target disappears", () => {
    const setSelectedTargetId = vi.fn();
    const loadSelectedTarget = vi.fn();
    const clearInvalidActiveRuntimeTarget = vi.fn();
    const harness = createHarness({
      targetOptions: [{ value: "bundle-animation:session-a:0" }],
      selectedTargetId: "bundle-animation:session-a:0",
      activeRuntimeTargetId: "bundle-animation:session-a:0",
      setSelectedTargetId,
      loadSelectedTarget,
      clearInvalidActiveRuntimeTarget,
    });
    unmounts.push(() => harness.unmount());

    clearInvalidActiveRuntimeTarget.mockClear();

    harness.rerender({
      targetOptions: [],
      selectedTargetId: null,
      activeRuntimeTargetId: "bundle-animation:session-a:0",
      setSelectedTargetId,
      loadSelectedTarget,
      clearInvalidActiveRuntimeTarget,
    });

    expect(clearInvalidActiveRuntimeTarget).toHaveBeenCalledTimes(1);
  });
});
