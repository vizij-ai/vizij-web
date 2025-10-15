/* @vitest-environment jsdom */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import {
  GraphProvider,
  useGraphRuntime,
  samples,
  valueAsNumber,
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

describe("@vizij/node-graph-react samples", () => {
  it("evaluates the simple gain/offset graph sample", async () => {
    const spec = await samples.load("simple-gain-offset");
    const deferred = createDeferred<number[]>();

    const Harness: React.FC = () => {
      const runtime = useGraphRuntime();
      const stagedRef = React.useRef(false);

      React.useEffect(() => {
        if (!runtime.ready || stagedRef.current) return;
        stagedRef.current = true;
        (async () => {
          try {
            const values: number[] = [];
            const pushIfNew = (val: number | undefined) => {
              if (typeof val !== "number") return;
              const prev = values[values.length - 1];
              if (typeof prev !== "number" || Math.abs(prev - val) > 1e-6) {
                values.push(val);
              }
            };

            const evaluate = () => {
              const result = runtime.evalAll();
              const writes = result?.writes ?? [];
              const hit = writes.find(
                (w: any) => w?.path === "demo/output/value",
              );
              const num = hit ? valueAsNumber(hit.value as any) : undefined;
              pushIfNew(num);
            };

            await act(async () => {
              await runtime.waitForGraphReady?.();
              evaluate();
              runtime.stageInput("node.t", 0.5, undefined, true);
              evaluate();
              runtime.stageInput("node.t", 1.0, undefined, true);
              evaluate();
            });

            deferred.resolve(values);
          } catch (err) {
            deferred.reject(err);
          }
        })().catch((err) => deferred.reject(err));
      }, [runtime]);

      return null;
    };

    render(
      <GraphProvider spec={spec} autoStart={false}>
        <Harness />
      </GraphProvider>,
    );

    const values = await deferred.promise;
    expect(values[0]).toBeCloseTo(0.25, 3);
    expect(values[1]).toBeCloseTo(1.0, 3);
    expect(values[2]).toBeCloseTo(1.75, 3);
  });
});
