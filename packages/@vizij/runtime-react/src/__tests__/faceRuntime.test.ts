import { describe, expect, it } from "vitest";
import { FaceRuntime } from "../core/FaceRuntime";
import { namespaceTypedPath } from "../core/helpers";
import type { VizijAssetBundle, VizijRuntimeStatus } from "../types";

const emptyBundle = (): VizijAssetBundle => ({
  glb: { kind: "world", world: {}, animatables: {} },
});

const makeRuntime = (overrides?: {
  autostart?: boolean;
  namespace?: string;
}) => {
  const runtime = new FaceRuntime();
  runtime.configure({
    namespace: overrides?.namespace ?? "test",
    faceId: undefined,
    autostart: overrides?.autostart ?? false,
    driveRuntime: true,
    mergeStrategy: undefined,
    assetBundle: emptyBundle(),
  });
  return runtime;
};

describe("FaceRuntime (headless)", () => {
  it("stages inputs under the namespace and flushes them into pending device writes", () => {
    const runtime = makeRuntime();
    runtime.setInput("rig/face/x", { float: 0.5 });

    const namespaced = namespaceTypedPath("rig/face/x", "test");
    // Before the flush the staged value is not yet visible to snapshots
    // (no device is booted, so snapshots read pending writes).
    expect(runtime.getPathSnapshot(namespaced)).toBeUndefined();

    runtime.flushStagedInputs();
    expect(runtime.getPathSnapshot(namespaced)).toEqual({ float: 0.5 });
  });

  it("step() without a booted device advances without throwing and flushes staged inputs", () => {
    const runtime = makeRuntime();
    runtime.setInput("rig/face/y", { float: 1 });
    expect(() => runtime.step(1 / 60)).not.toThrow();
    const namespaced = namespaceTypedPath("rig/face/y", "test");
    expect(runtime.getPathSnapshot(namespaced)).toEqual({ float: 1 });
  });

  it("reports and resets errors through the status-patch seam", () => {
    const runtime = makeRuntime();
    let status: VizijRuntimeStatus = {
      loading: true,
      ready: false,
      error: null,
      errors: [],
      namespace: "test",
      rootId: null,
      outputPaths: [],
      controllers: { graphs: [], anims: [] },
    };
    runtime.callbacks.onStatusPatch = (updater) => {
      status = updater(status);
    };

    runtime.pushError({
      message: "boom",
      phase: "engine",
      timestamp: 1,
    });
    expect(status.error?.message).toBe("boom");
    expect(status.errors).toHaveLength(1);

    runtime.resetErrors();
    expect(status.error).toBeNull();
    expect(status.errors).toHaveLength(0);
  });

  it("computes loop modes from autostart and recent activity", () => {
    const idle = makeRuntime({ autostart: false });
    expect(idle.computeDesiredLoopMode()).toBe("idle-hidden");

    const auto = makeRuntime({ autostart: true });
    expect(auto.computeDesiredLoopMode()).toBe("active"); // construction counts as activity

    const modes: string[] = [];
    auto.callbacks.onLoopModeChange = (mode) => modes.push(mode);
    auto.markActivity();
    expect(modes).toEqual(["active"]);
  });

  it("subscribe/unsubscribe manages step and store-change listeners", () => {
    const runtime = makeRuntime();
    let stepCount = 0;
    const unsubscribe = runtime.subscribeToStep(() => {
      stepCount += 1;
    });
    // No device booted: stepping must not fire step listeners (the device
    // step never ran), and unsubscribing must not throw.
    runtime.step(1 / 60);
    expect(stepCount).toBe(0);
    expect(() => unsubscribe()).not.toThrow();

    const unsubscribeChanges = runtime.subscribeToStoreChanges(() => {});
    expect(() => unsubscribeChanges()).not.toThrow();
  });

  it("setGraphBundle applies the graph tier and notifies the host with a plan", () => {
    const runtime = makeRuntime();
    const base = emptyBundle();
    runtime.noteEffectiveAssetBundle(base);
    runtime.resolveBundlePlan(base);

    const applied: Array<{ reregisterGraphs: boolean; reloadAssets: boolean }> =
      [];
    let latestBundle: VizijAssetBundle | null = null;
    runtime.callbacks.onGraphBundleApplied = (bundle, plan) => {
      latestBundle = bundle;
      applied.push({
        reregisterGraphs: plan.reregisterGraphs,
        reloadAssets: plan.reloadAssets,
      });
    };

    runtime.setGraphBundle(
      {
        programs: [
          {
            id: "p1",
            graph: { id: "p1", spec: { nodes: [], edges: [] } },
          },
        ],
      },
      { tier: "graphs" },
    );

    expect(applied).toEqual([{ reregisterGraphs: true, reloadAssets: false }]);
    const appliedBundle = latestBundle as VizijAssetBundle | null;
    expect(appliedBundle?.programs?.map((p) => p.id)).toEqual(["p1"]);

    // The suppress flag consumes the host's next prop-driven plan resolution
    // (the bundle we just applied must not double-plan).
    expect(runtime.resolveBundlePlan(appliedBundle!)).toBeNull();
  });

  it("animateValue with duration 0 stages the target immediately and resolves", async () => {
    const runtime = makeRuntime();
    await runtime.animateValue("rig/face/z", { float: 2 }, { duration: 0 });
    runtime.flushStagedInputs();
    const namespaced = namespaceTypedPath("rig/face/z", "test");
    expect(runtime.getPathSnapshot(namespaced)).toEqual({ float: 2 });
  });

  it("wraps input drivers with error guards and hands them the runtime seams", () => {
    const runtime = makeRuntime();
    const statuses: string[] = [];
    runtime.callbacks.onStatusPatch = (updater) => {
      const next = updater({
        loading: false,
        ready: true,
        error: null,
        errors: [],
        namespace: "test",
        rootId: null,
        outputPaths: [],
        controllers: { graphs: [], anims: [] },
      });
      if (next.error) {
        statuses.push(next.error.message);
      }
    };

    const lifecycle = runtime.registerInputDriver("d1", ({ setInput }) => ({
      start: () => {
        setInput("rig/face/d", { float: 3 });
        throw new Error("driver start failure");
      },
      stop: () => {},
      dispose: () => {},
    }));

    lifecycle.start();
    expect(statuses).toEqual(["Input driver d1 failed to start"]);

    runtime.flushStagedInputs();
    const namespaced = namespaceTypedPath("rig/face/d", "test");
    expect(runtime.getPathSnapshot(namespaced)).toEqual({ float: 3 });
  });
});
