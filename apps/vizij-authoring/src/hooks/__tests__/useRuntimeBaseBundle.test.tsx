import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as runtimeBundle from "../../utils/runtimeBundle";
import { useRuntimeBaseBundle } from "../useRuntimeBaseBundle";

describe("useRuntimeBaseBundle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps bundle identity stable across unrelated rerenders", () => {
    const buildSpy = vi.spyOn(runtimeBundle, "buildRuntimeBaseBundle");
    const world = {} as Parameters<
      typeof runtimeBundle.buildRuntimeBaseBundle
    >[0]["world"];
    const animatables = {} as Parameters<
      typeof runtimeBundle.buildRuntimeBaseBundle
    >[0]["animatables"];

    const { result, rerender } = renderHook(
      ({ tick }) => {
        void tick;
        return useRuntimeBaseBundle({
          namespace: "vizij",
          world,
          animatables,
          loadedBundle: null,
        });
      },
      { initialProps: { tick: 0 } },
    );

    const firstBundle = result.current;
    rerender({ tick: 1 });

    expect(result.current).toBe(firstBundle);
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  it("rebuilds when a runtime dependency changes", () => {
    const buildSpy = vi.spyOn(runtimeBundle, "buildRuntimeBaseBundle");
    const worldA = {} as Parameters<
      typeof runtimeBundle.buildRuntimeBaseBundle
    >[0]["world"];
    const worldB = {} as Parameters<
      typeof runtimeBundle.buildRuntimeBaseBundle
    >[0]["world"];
    const animatables = {} as Parameters<
      typeof runtimeBundle.buildRuntimeBaseBundle
    >[0]["animatables"];

    const { result, rerender } = renderHook(
      ({ world }) =>
        useRuntimeBaseBundle({
          namespace: "vizij",
          world,
          animatables,
          loadedBundle: null,
        }),
      { initialProps: { world: worldA } },
    );

    const firstBundle = result.current;
    rerender({ world: worldB });

    expect(result.current).not.toBe(firstBundle);
    expect(buildSpy).toHaveBeenCalledTimes(2);
  });
});
