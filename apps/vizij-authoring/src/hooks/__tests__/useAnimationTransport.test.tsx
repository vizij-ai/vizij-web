import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { useAnimationStore } from "../../state/animationStore";
import { useAnimationTransport } from "../useAnimationTransport";

function renderTransportHook() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root;
  let current: ReturnType<typeof useAnimationTransport> | null = null;

  function HookHarness() {
    current = useAnimationTransport();
    return null;
  }

  flushSync(() => {
    root = createRoot(container);
    root.render(React.createElement(HookHarness));
  });

  return {
    get result() {
      if (!current) {
        throw new Error("Transport hook not initialized");
      }
      return current;
    },
    unmount: () => {
      flushSync(() => {
        root.unmount();
      });
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

describe("useAnimationTransport", () => {
  beforeEach(() => {
    useAnimationStore.getState().reset();
  });

  it("remains safe when rendered outside VizijRuntimeProvider", () => {
    useAnimationStore.getState().addTrack("input_a", "Input A");
    const hook = renderTransportHook();

    expect(hook.result.active).toBe(false);
    expect(() => hook.result.play()).not.toThrow();
    expect(() => hook.result.pause()).not.toThrow();
    expect(() => hook.result.stop()).not.toThrow();
    expect(() => hook.result.step()).not.toThrow();
    hook.unmount();
  });

  it("updates timeline position without enabling runtime transport outside provider", () => {
    useAnimationStore.getState().addTrack("input_a", "Input A");
    const hook = renderTransportHook();

    hook.result.seek(1.25);

    const state = useAnimationStore.getState();
    expect(state.currentTime).toBe(1.25);
    expect(state.transportActive).toBe(false);
    expect(state.transportPlaybackState).toBe("stopped");
    hook.unmount();
  });
});
