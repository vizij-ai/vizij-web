import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRuntimeInputDispatcher } from "../useRuntimeInputDispatcher";

const setInputSpy = vi.fn();

vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({
    setInput: setInputSpy,
  }),
}));

describe("useRuntimeInputDispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches raw paths when no resolver is provided", () => {
    const { result } = renderHook(() => useRuntimeInputDispatcher());

    act(() => {
      result.current("rig/face/standard/jaw/open", 0.4);
    });

    expect(setInputSpy).toHaveBeenCalledWith("rig/face/standard/jaw/open", {
      float: 0.4,
    });
  });

  it("applies path resolver and emits dispatch payload", () => {
    const onDispatched = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeInputDispatcher({
        resolvePath: (path) => `rig/ref-face${path}`,
        onDispatched,
      }),
    );

    act(() => {
      result.current("/standard/jaw/open", 0.75);
    });

    expect(setInputSpy).toHaveBeenCalledWith("rig/ref-face/standard/jaw/open", {
      float: 0.75,
    });
    expect(onDispatched).toHaveBeenCalledWith({
      rawPath: "/standard/jaw/open",
      resolvedPath: "rig/ref-face/standard/jaw/open",
      value: 0.75,
    });
  });
});
