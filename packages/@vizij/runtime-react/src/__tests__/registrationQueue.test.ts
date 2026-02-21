import { describe, expect, it, vi } from "vitest";
import { createLatestTokenQueue } from "../registrationQueue";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createLatestTokenQueue", () => {
  it("runs a single task for repeated requests with the same token", async () => {
    const gate = deferred<void>();
    const run = vi.fn(async () => {
      await gate.promise;
    });
    const queue = createLatestTokenQueue(run);

    queue.request(1);
    queue.request(1);
    queue.request(1);

    expect(run).toHaveBeenCalledTimes(1);
    gate.resolve();
    await flushMicrotasks();
  });

  it("coalesces in-flight requests to the latest token", async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const run = vi
      .fn<(token: number) => Promise<void>>()
      .mockImplementationOnce(async () => {
        await firstGate.promise;
      })
      .mockImplementationOnce(async () => {
        await secondGate.promise;
      });
    const queue = createLatestTokenQueue(run);

    queue.request(1);
    queue.request(2);
    queue.request(3);
    queue.request(2);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenNthCalledWith(1, 1);

    firstGate.resolve();
    await flushMicrotasks();

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(2, 3);

    secondGate.resolve();
    await flushMicrotasks();
  });

  it("ignores stale tokens after a newer token completed", async () => {
    const run = vi.fn(async () => undefined);
    const queue = createLatestTokenQueue(run);

    queue.request(5);
    await flushMicrotasks();
    expect(run).toHaveBeenCalledWith(5);

    queue.request(4);
    queue.request(5);
    await flushMicrotasks();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("stops accepting new work after dispose", async () => {
    const run = vi.fn(async () => undefined);
    const queue = createLatestTokenQueue(run);

    queue.dispose();
    queue.request(1);
    await flushMicrotasks();

    expect(run).not.toHaveBeenCalled();
  });
});
