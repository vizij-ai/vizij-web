// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ValueJSON } from "@vizij/runtime";
// `vi.mock` is hoisted above these imports: the package sees the stand-ins.
import {
  VizijRuntimeFace,
  VizijRuntimeProvider,
  useAnimateValue,
  useVizijChanges,
  useVizijRuntime,
  useVizijValues,
  type VizijChanges,
} from "../index";

/** A stand-in for `@vizij/runtime`'s `Runtime`: a store with a change cursor. */
class FakeRuntime {
  store: Record<string, ValueJSON> = {};
  private changes: Record<string, ValueJSON | null> | null = null;
  running = false;
  behaviorError: string | undefined = undefined;
  writes: Array<[string, ValueJSON]> = [];
  run = vi.fn(() => {
    this.running = true;
    return new Promise<void>(() => undefined);
  });
  step = vi.fn();
  drains = 0;
  stop = vi.fn(() => {
    this.running = false;
  });
  dispose = vi.fn();
  constructor(initial: Record<string, ValueJSON> = {}) {
    this.store = { ...initial };
  }
  readValues(paths: string[]) {
    return Object.fromEntries(paths.map((p) => [p, this.store[p] ?? null]));
  }
  setValue(path: string, value: ValueJSON) {
    this.writes.push([path, value]);
    this.store[path] = value;
    this.changes = { ...(this.changes ?? {}), [path]: value };
  }
  drainChanges() {
    this.drains += 1;
    // The first drain is the whole store, as the runtime's is.
    const drained = this.changes ?? { ...this.store };
    this.changes = {};
    return drained;
  }
  behaviorErrorChanged() {
    return new Promise<string | undefined>(() => undefined);
  }
  /** Keys the store declares without holding a value, with their meta. */
  declared: Record<string, Record<string, unknown>> = {};
  async listKeys(prefix = "") {
    return Object.entries(this.declared)
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, __meta]) => ({ path, __meta }));
  }
}

const runtime = vi.hoisted(() => ({
  describe: vi.fn(),
  loadVizij: vi.fn(),
  unloadVizij: vi.fn(),
  whenReady: vi.fn(),
}));
vi.mock("@vizij/runtime", () => runtime);
vi.mock("@vizij/render", () => ({
  canvasMounted: () => Promise.resolve({}),
  Vizij: ({ vizijId }: { vizijId: string }) => (
    <div data-testid="slot" data-vizij-id={vizijId} />
  ),
}));

const DESCRIPTION = { faceId: "quori", rigPrefix: "rig/quori/" };
const HAPPY = "rig/quori/standard/vizij/expression/happy";

let loaded: FakeRuntime[];
beforeEach(() => {
  loaded = [];
  runtime.describe.mockResolvedValue(DESCRIPTION);
  runtime.whenReady.mockResolvedValue(undefined);
  runtime.loadVizij.mockImplementation(async () => {
    const face = new FakeRuntime({ [HAPPY]: { f32: 0 } });
    loaded.push(face);
    return face;
  });
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  setVisibility("visible");
  // Let the unmounted providers' teardowns run before the next test.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.clearAllMocks();
});

function Status() {
  const { status, runtime: rt, description, vizijId } = useVizijRuntime();
  return (
    <span data-testid="status">
      {status}|{rt ? loaded.indexOf(rt as never) : "-"}|
      {description ? "described" : "-"}|{vizijId}
    </span>
  );
}

const bytes = (n: number) => new Uint8Array([n]);

/** Animation frames the test hands out itself: `frame()` runs the ones
 * requested so far, as the browser does on its next frame. */
let requested: Map<number, FrameRequestCallback>;
function takeFrames() {
  requested = new Map();
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    requested.set(next, callback);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    requested.delete(id);
  });
}
function frame() {
  const due = [...requested.values()];
  requested.clear();
  act(() => due.forEach((callback) => callback(performance.now())));
}

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", {
  configurable: true,
  get: () => visibility,
});
function setVisibility(state: DocumentVisibilityState) {
  if (visibility === state) return;
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("VizijRuntimeProvider", () => {
  it("loads the face and hands out its Runtime unwrapped", async () => {
    render(
      <VizijRuntimeProvider
        glb={bytes(1)}
        vizijId="hero"
        options={{ program: "none" }}
      >
        <Status />
        <VizijRuntimeFace />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toBe(
        "ready|0|described|hero",
      ),
    );
    expect(runtime.loadVizij).toHaveBeenCalledWith("hero", bytes(1), {
      program: "none",
    });
    expect(loaded[0].run).not.toHaveBeenCalled();
    expect(screen.getByTestId("slot").getAttribute("data-vizij-id")).toBe(
      "hero",
    );
  });

  it("loads once under StrictMode", async () => {
    render(
      <StrictMode>
        <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
          <Status />
        </VizijRuntimeProvider>
      </StrictMode>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    expect(runtime.loadVizij).toHaveBeenCalledTimes(1);
    expect(runtime.unloadVizij).not.toHaveBeenCalled();
  });

  it("leaves a stopped device to the page when run is false", async () => {
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero" run={false}>
        <Status />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    expect(loaded[0].run).not.toHaveBeenCalled();
    expect(loaded[0].stop).toHaveBeenCalled();
    await sleep(50);
    expect(loaded[0].step).not.toHaveBeenCalled();
  });

  it("reloads in place on a new glb, disposing the previous Runtime", async () => {
    const { rerender } = render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Status />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready\|0/),
    );
    rerender(
      <VizijRuntimeProvider glb={bytes(2)} vizijId="hero">
        <Status />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready\|1/),
    );
    expect(runtime.loadVizij).toHaveBeenLastCalledWith(
      "hero",
      bytes(2),
      undefined,
    );
    expect(loaded[0].stop).toHaveBeenCalled();
    expect(loaded[0].dispose).toHaveBeenCalled();
    expect(runtime.unloadVizij).not.toHaveBeenCalled();
  });

  it("takes the face down on unmount", async () => {
    const { unmount } = render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Status />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    unmount();
    await waitFor(() => expect(loaded[0].dispose).toHaveBeenCalled());
    expect(loaded[0].stop).toHaveBeenCalled();
    expect(runtime.unloadVizij).toHaveBeenCalledWith("hero");
  });

  it("reports a failed load", async () => {
    runtime.loadVizij.mockRejectedValueOnce(new Error("no rig"));
    function Failure() {
      const { status, error } = useVizijRuntime();
      return <span data-testid="failure">{`${status}:${error?.message}`}</span>;
    }
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Failure />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("failure").textContent).toBe("error:no rig"),
    );
  });
});

describe("the device's pace", () => {
  it("steps the device once per animation frame while the page is visible", async () => {
    takeFrames();
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Status />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    const face = loaded[0];
    const before = face.step.mock.calls.length;
    frame();
    frame();
    frame();
    expect(face.step.mock.calls.length - before).toBe(3);
    expect(face.step.mock.calls.at(-1)?.[0]).toBeGreaterThan(0);
    expect(face.run).not.toHaveBeenCalled();
  });

  it("steps on a timer while hidden, until the first frame after the page returns", async () => {
    takeFrames();
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Status />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    const face = loaded[0];
    act(() => setVisibility("hidden"));
    // The browser draws no frame while hidden; the timer steps.
    const hidden = face.step.mock.calls.length;
    await waitFor(() =>
      expect(face.step.mock.calls.length).toBeGreaterThan(hidden + 2),
    );

    // Shown again, before its first frame: the timer still steps.
    act(() => setVisibility("visible"));
    const shown = face.step.mock.calls.length;
    await waitFor(() =>
      expect(face.step.mock.calls.length).toBeGreaterThan(shown + 2),
    );

    // The first frame takes over: one step per frame, the timer gone.
    frame();
    const framed = face.step.mock.calls.length;
    await sleep(50);
    expect(face.step.mock.calls.length).toBe(framed);
    frame();
    expect(face.step.mock.calls.length).toBe(framed + 1);
  });
});

describe("the change fan-out", () => {
  it("drains per frame only while something listens, and at least once a second", async () => {
    takeFrames();
    let listening = false;
    function Listener() {
      useVizijChanges(() => undefined);
      return null;
    }
    function Page({ listen }: { listen: boolean }) {
      listening = listen;
      return (
        <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
          <Status />
          {listen ? <Listener /> : null}
        </VizijRuntimeProvider>
      );
    }
    const { rerender } = render(<Page listen={false} />);
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    const face = loaded[0];
    // Nothing listens: frames drain nothing...
    const idle = face.drains;
    frame();
    frame();
    expect(face.drains).toBe(idle);
    // ...and the changes are still drained, once a second, unheard.
    await waitFor(() => expect(face.drains).toBeGreaterThan(idle), {
      timeout: 3000,
    });

    rerender(<Page listen />);
    expect(listening).toBe(true);
    const heard = face.drains;
    frame();
    frame();
    expect(face.drains).toBe(heard + 2);
  });

  it("drains once per frame and hands each batch to every subscriber", async () => {
    const batches: VizijChanges[] = [];
    function Listener() {
      useVizijChanges((changes) => batches.push(changes));
      return null;
    }
    function Happy() {
      const values = useVizijValues([HAPPY]);
      return <span data-testid="happy">{JSON.stringify(values[HAPPY])}</span>;
    }
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Listener />
        <Happy />
      </VizijRuntimeProvider>,
    );
    await waitFor(() => expect(batches.length).toBeGreaterThan(0));
    // The first batch is the whole store.
    expect(batches[0]).toEqual({ [HAPPY]: { f32: 0 } });
    expect(screen.getByTestId("happy").textContent).toBe('{"f32":0}');

    act(() => loaded[0].setValue(HAPPY, { f32: 1 }));
    await waitFor(() =>
      expect(screen.getByTestId("happy").textContent).toBe('{"f32":1}'),
    );
    expect(batches.at(-1)).toEqual({ [HAPPY]: { f32: 1 } });
  });
});

describe("useAnimateValue", () => {
  it("tweens a key in the numeric kind it holds, a newer tween replacing the running one", async () => {
    let animate: ReturnType<typeof useAnimateValue> | null = null;
    function Animator() {
      animate = useAnimateValue();
      return <Status />;
    }
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Animator />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    const face = loaded[0];

    let firstDone = false;
    const first = animate!.animateValue(HAPPY, 1, { duration: 10 }).then(() => {
      firstDone = true;
    });
    const second = animate!.animateValue(HAPPY, 0.5, { duration: 0.05 });
    await first;
    expect(firstDone).toBe(true);
    await second;
    expect(face.store[HAPPY]).toEqual({ f32: 0.5 });
    expect(face.writes.every(([, value]) => "f32" in (value as object))).toBe(
      true,
    );
  });

  it("starts an unwritten key from the value the device lists it resting at", async () => {
    let animate: ReturnType<typeof useAnimateValue> | null = null;
    function Animator() {
      animate = useAnimateValue();
      return <Status />;
    }
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Animator />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    const blink = "rig/quori/standard/vizij/blink";
    loaded[0].declared[blink] = { default: { f32: 0 } };
    loaded[0].declared[`${blink}_rate`] = { default: { f64: 3 } };
    await animate!.animateValue(blink, 1, { duration: 0 });
    expect(loaded[0].writes).toEqual([[blink, { f32: 1 }]]);
  });

  it("rejects a key that holds no number", async () => {
    let animate: ReturnType<typeof useAnimateValue> | null = null;
    function Animator() {
      animate = useAnimateValue();
      return <Status />;
    }
    render(
      <VizijRuntimeProvider glb={bytes(1)} vizijId="hero">
        <Animator />
      </VizijRuntimeProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("status").textContent).toMatch(/^ready/),
    );
    await expect(animate!.animateValue("rig/quori/unset", 1)).rejects.toThrow(
      /holds no number/,
    );
  });
});
