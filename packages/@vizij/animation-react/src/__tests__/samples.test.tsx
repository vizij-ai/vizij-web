/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, afterAll, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { init as initAnimationWasm } from "@vizij/animation";
import {
  AnimationProvider,
  useAnimation,
  valueAsNumber,
  samples,
} from "../index";
import { getAnimationWasmInitInput } from "./helpers";

const originalWarn = console.warn;
const originalError = console.error;

const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg, ...args) => {
  if (
    typeof msg === "string" &&
    msg.includes("deprecated parameters for the initialization function")
  ) {
    return;
  }
  if (
    typeof msg === "string" &&
    msg.startsWith("Warning: An update to AnimationProvider inside a test")
  ) {
    return;
  }
  originalWarn.call(console, msg as any, ...args);
});

const errorSpy = vi
  .spyOn(console, "error")
  .mockImplementation((msg, ...args) => {
    if (
      typeof msg === "string" &&
      msg.startsWith("Warning: An update to AnimationProvider inside a test")
    ) {
      return;
    }
    originalError.call(console, msg as any, ...args);
  });

afterAll(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

type RecorderHandle = {
  isReady: () => boolean;
  capture: () => number[];
};

const Recorder = React.forwardRef<RecorderHandle>((_, ref) => {
  const { ready, step, getLatestValuesByPlayer } = useAnimation();

  const captureValues = React.useCallback(() => {
    const thresholds = [0, 0.5, 1.0];
    const values: number[] = [];
    let nextThreshold = 0;

    const capture = () => {
      const players = getLatestValuesByPlayer();
      const raw = players?.default?.["node.t"];
      const num = valueAsNumber(raw as any);
      if (typeof num === "number") {
        values.push(num);
      }
    };

    capture(); // initial at t=0
    nextThreshold = 1;
    let elapsed = 0;
    const dt = 1 / 120; // seconds per step (~120 FPS)
    while (elapsed < thresholds[thresholds.length - 1] + dt) {
      step(dt);
      elapsed += dt;
      while (
        nextThreshold < thresholds.length &&
        elapsed + 1e-4 >= thresholds[nextThreshold]
      ) {
        capture();
        nextThreshold += 1;
      }
    }

    return values;
  }, [getLatestValuesByPlayer, step]);

  React.useImperativeHandle(
    ref,
    () => ({
      isReady: () => ready,
      capture: captureValues,
    }),
    [captureValues, ready],
  );

  return null;
});

Recorder.displayName = "Recorder";

describe("@vizij/animation-react samples", () => {
  it("plays the simple scalar ramp sample animation", async () => {
    await initAnimationWasm(getAnimationWasmInitInput());
    const animation = await samples.load("simple-scalar-ramp");
    const recorderRef = React.createRef<RecorderHandle>();

    render(
      <AnimationProvider
        animations={animation}
        autostart={false}
        prebind={(path) => path}
        wasmInitInput={getAnimationWasmInitInput()}
      >
        <Recorder ref={recorderRef} />
      </AnimationProvider>,
    );

    await waitFor(() => {
      expect(recorderRef.current?.isReady()).toBe(true);
    });

    let values: number[] = [];
    act(() => {
      values = recorderRef.current?.capture() ?? [];
    });

    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(1);
    expect(values[values.length - 1]).toBeCloseTo(1, 3);
  });
});
