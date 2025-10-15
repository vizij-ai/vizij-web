/* @vitest-environment jsdom */

import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  AnimationProvider,
  useAnimation,
  valueAsNumber,
  samples,
} from "../index";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("@vizij/animation-react samples", () => {
  it("plays the simple scalar ramp sample animation", async () => {
    const animation = await samples.load("simple-scalar-ramp");
    const deferred = createDeferred<number[]>();

    const Recorder: React.FC = () => {
      const { ready, step, getLatestValuesByPlayer } = useAnimation();
      const stagedRef = React.useRef(false);

      React.useEffect(() => {
        if (!ready || stagedRef.current) return;
        stagedRef.current = true;

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

        try {
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
          deferred.resolve(values);
        } catch (err) {
          deferred.reject(err);
        }
      }, [ready, step, getLatestValuesByPlayer]);

      return null;
    };

    render(
      <AnimationProvider
        animations={animation}
        autostart={false}
        prebind={(path) => path}
      >
        <Recorder />
      </AnimationProvider>,
    );

    const values = await deferred.promise;
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(1);
    expect(values[values.length - 1]).toBeCloseTo(1, 3);
  });
});
