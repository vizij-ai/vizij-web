import { act, renderHook } from "@testing-library/react";
import { normalizeGraphSpec } from "@vizij/node-graph";
import type { VizijBundleExtension } from "@vizij/render";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
} from "../../types/animationClipIr";
import {
  hydrateAuthoredTimelineFromBundleAnimations,
  useBundleSynchronizer,
} from "../useBundleSynchronizer";
import type { FaceLoadPhaseUpdate } from "../useVizijAssetLoader";

vi.mock("@vizij/node-graph", async () => {
  const actual =
    await vi.importActual<typeof import("@vizij/node-graph")>(
      "@vizij/node-graph",
    );
  return {
    ...actual,
    normalizeGraphSpec: vi.fn(async (spec: unknown) => spec),
  };
});

function createBundleAnimationEntry(
  id: string,
  metadata?: Record<string, unknown>,
) {
  return {
    id,
    clip: {
      id,
      duration: 1,
      tracks: [
        {
          channel: "controls/a",
          targetInputId: "input_a",
          interpolation: "linear",
          keyframes: [
            { time: 0, value: 0, interpolation: "linear" },
            { time: 1, value: 1, interpolation: "linear" },
          ],
        },
      ],
    },
    metadata,
  };
}

describe("hydrateAuthoredTimelineFromBundleAnimations", () => {
  it("hydrates canonical authored clip id", () => {
    const importClipIr = vi.fn();
    const reset = vi.fn();

    const hydrated = hydrateAuthoredTimelineFromBundleAnimations(
      [createBundleAnimationEntry(AUTHORED_TIMELINE_CLIP_ID)],
      { importClipIr, reset },
    );

    expect(hydrated).toBe(true);
    expect(importClipIr).toHaveBeenCalledTimes(1);
    expect(importClipIr).toHaveBeenCalledWith(
      expect.objectContaining({
        id: AUTHORED_TIMELINE_CLIP_ID,
      }),
    );
    expect(reset).not.toHaveBeenCalled();
  });

  it("accepts legacy timeline-main only when metadata.origin is authored timeline", () => {
    const importClipIr = vi.fn();
    const reset = vi.fn();

    const withoutMarker = hydrateAuthoredTimelineFromBundleAnimations(
      [createBundleAnimationEntry(LEGACY_AUTHORED_TIMELINE_CLIP_ID)],
      { importClipIr, reset },
    );
    expect(withoutMarker).toBe(false);
    expect(importClipIr).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledTimes(1);

    reset.mockReset();
    const withMarker = hydrateAuthoredTimelineFromBundleAnimations(
      [
        createBundleAnimationEntry(LEGACY_AUTHORED_TIMELINE_CLIP_ID, {
          origin: AUTHORED_TIMELINE_METADATA_ORIGIN,
        }),
      ],
      { importClipIr, reset },
    );
    expect(withMarker).toBe(true);
    expect(importClipIr).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

/** A bundle carrying a rig graph and a pose config, as an exported face does. */
function createBundleWithRigAndPoses(): VizijBundleExtension {
  return {
    version: 1,
    graphs: [{ id: "face", kind: "rig", spec: { nodes: [], edges: [] } }],
    poses: {
      config: {
        version: 1,
        faceId: "face",
        neutralInputs: {},
        poses: [{ id: "smile", name: "Smile", values: { mouth_smile: 1 } }],
      },
    },
    animations: [],
  } as unknown as VizijBundleExtension;
}

type SynchronizerProps = Parameters<typeof useBundleSynchronizer>[0];
type RigImportResult = {
  faceChanged: boolean;
  importedFaceId: string | null;
  inputsRevision: number;
};

function isBundleSynced(update: FaceLoadPhaseUpdate): boolean {
  return (
    update.stepId === "bundle-sync" &&
    update.substepId === undefined &&
    update.status === "complete"
  );
}

describe("useBundleSynchronizer", () => {
  let frames: FrameRequestCallback[] = [];

  /** Runs `count` animation frames, settling the promises each one resolves. */
  async function runFrames(count = 20): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await act(async () => {
        const pending = frames;
        frames = [];
        pending.forEach((callback) => callback(0));
        for (let tick = 0; tick < 10; tick += 1) {
          await Promise.resolve();
        }
      });
    }
  }

  beforeEach(() => {
    vi.mocked(normalizeGraphSpec).mockClear();
    frames = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
  });

  function renderSynchronizer(overrides: Partial<SynchronizerProps>) {
    const phases: FaceLoadPhaseUpdate[] = [];
    const props: SynchronizerProps = {
      faceId: "face",
      rootId: "root",
      loadedBundle: createBundleWithRigAndPoses(),
      standardInputCount: 3,
      standardInputsRigImportRevision: 0,
      skipDiscrepancyCheck: false,
      importGraphSpec: vi.fn(
        async (): Promise<RigImportResult> => ({
          faceChanged: false,
          importedFaceId: null,
          inputsRevision: 0,
        }),
      ),
      canImportRigGraph: true,
      importPoseConfigFromData: vi.fn(),
      onPhaseChange: (update) => {
        phases.push(update);
      },
      ...overrides,
    };
    const hook = renderHook(
      (current: SynchronizerProps) => useBundleSynchronizer(current),
      { initialProps: props },
    );
    return { hook, props, phases };
  }

  it("reports the bundle synced only once its pose config is imported", async () => {
    // The pose rig has no inputs yet, and the rig graph import brings them.
    const { hook, props, phases } = renderSynchronizer({
      standardInputCount: 0,
      importGraphSpec: vi.fn(
        async (): Promise<RigImportResult> => ({
          faceChanged: false,
          importedFaceId: null,
          inputsRevision: 1,
        }),
      ),
    });
    await runFrames();

    expect(props.importGraphSpec).toHaveBeenCalledTimes(1);
    expect(props.importPoseConfigFromData).not.toHaveBeenCalled();
    expect(phases.some(isBundleSynced)).toBe(false);

    hook.rerender({
      ...props,
      standardInputCount: 3,
      standardInputsRigImportRevision: 1,
    });
    await runFrames();

    expect(props.importPoseConfigFromData).toHaveBeenCalledTimes(1);
    expect(phases.filter(isBundleSynced)).toHaveLength(1);
  });

  it("imports the pose config against the inputs the rig graph import brings", async () => {
    // The face already has inputs, generated from its animatables; the ones
    // the rig graph import brings reach the pose rig a few renders after it.
    const { hook, props, phases } = renderSynchronizer({
      standardInputCount: 3,
      standardInputsRigImportRevision: 4,
      importGraphSpec: vi.fn(
        async (): Promise<RigImportResult> => ({
          faceChanged: false,
          importedFaceId: null,
          inputsRevision: 5,
        }),
      ),
    });
    await runFrames();

    expect(props.importGraphSpec).toHaveBeenCalledTimes(1);
    expect(props.importPoseConfigFromData).not.toHaveBeenCalled();
    expect(phases.some(isBundleSynced)).toBe(false);

    hook.rerender({ ...props, standardInputsRigImportRevision: 5 });
    await runFrames();

    expect(props.importPoseConfigFromData).toHaveBeenCalledTimes(1);
    expect(phases.filter(isBundleSynced)).toHaveLength(1);
  });

  it("imports the pose config of a face whose pose rig has no inputs", async () => {
    const { hook, props, phases } = renderSynchronizer({
      standardInputCount: 0,
      importGraphSpec: vi.fn(
        async (): Promise<RigImportResult> => ({
          faceChanged: false,
          importedFaceId: null,
          inputsRevision: 1,
        }),
      ),
    });
    await runFrames();
    expect(props.importPoseConfigFromData).not.toHaveBeenCalled();

    hook.rerender({ ...props, standardInputsRigImportRevision: 1 });
    await runFrames();

    expect(props.importPoseConfigFromData).toHaveBeenCalledTimes(1);
    expect(phases.filter(isBundleSynced)).toHaveLength(1);
  });

  it("imports the pose config once a superseded run's rig graph import finishes", async () => {
    const rigImport = createDeferred<RigImportResult>();
    const { hook, props, phases } = renderSynchronizer({
      importGraphSpec: vi.fn(() => rigImport.promise),
    });
    await runFrames();
    expect(props.importGraphSpec).toHaveBeenCalledTimes(1);

    // A new phase callback, as the app hands down whenever a load milestone
    // is marked, re-runs the sync while the rig graph import is in flight.
    hook.rerender({ ...props, onPhaseChange: (update) => phases.push(update) });
    await runFrames();

    await act(async () => {
      rigImport.resolve({
        faceChanged: false,
        importedFaceId: null,
        inputsRevision: 0,
      });
    });
    await runFrames();

    expect(props.importGraphSpec).toHaveBeenCalledTimes(1);
    expect(props.importPoseConfigFromData).toHaveBeenCalledTimes(1);
    expect(phases.filter(isBundleSynced)).toHaveLength(1);
  });

  it("imports the pose config once a run superseded during the pose stage gives up", async () => {
    // The rig graph renames the face, so the pose stage waits for the rename
    // to land before importing.
    const { hook, props, phases } = renderSynchronizer({
      importGraphSpec: vi.fn(
        async (): Promise<RigImportResult> => ({
          faceChanged: true,
          importedFaceId: "renamed",
          inputsRevision: 0,
        }),
      ),
    });
    await runFrames(5);
    expect(
      phases.some(
        (update) =>
          update.substepId === "import-pose-config" &&
          update.status === "active",
      ),
    ).toBe(true);
    expect(props.importPoseConfigFromData).not.toHaveBeenCalled();

    // A new phase callback re-runs the sync while the pose stage waits; then
    // the rename lands, which does not re-run the sync by itself.
    const nextOnPhaseChange = (update: FaceLoadPhaseUpdate) => {
      phases.push(update);
    };
    hook.rerender({ ...props, onPhaseChange: nextOnPhaseChange });
    await runFrames(5);
    hook.rerender({
      ...props,
      faceId: "renamed",
      onPhaseChange: nextOnPhaseChange,
    });
    await runFrames(80);

    expect(props.importPoseConfigFromData).toHaveBeenCalledTimes(1);
    expect(phases.filter(isBundleSynced)).toHaveLength(1);
  });

  it("does not import the rig graph of a bundle replaced while it normalized", async () => {
    const normalized = createDeferred<unknown>();
    vi.mocked(normalizeGraphSpec).mockImplementationOnce(
      () => normalized.promise as never,
    );
    const { hook, props } = renderSynchronizer({});
    await runFrames();
    expect(normalizeGraphSpec).toHaveBeenCalledTimes(1);

    // A new import begins: the loader clears the face before the next one is
    // registered.
    hook.rerender({ ...props, rootId: null, loadedBundle: null });
    await runFrames();
    await act(async () => {
      normalized.resolve({ nodes: [], edges: [] });
    });
    await runFrames();

    expect(props.importGraphSpec).not.toHaveBeenCalled();
    expect(props.importPoseConfigFromData).not.toHaveBeenCalled();
  });

  it("reports why the rig graph failed to import", async () => {
    const { phases } = renderSynchronizer({
      importGraphSpec: vi.fn(async () => {
        throw new Error("Graph spec is missing Vizij metadata.");
      }),
    });
    await runFrames();

    expect(
      phases.find(
        (update) =>
          update.substepId === "import-rig-graph" && update.status === "error",
      )?.message,
    ).toBe(
      "The face's rig graph failed to import: Graph spec is missing Vizij metadata.",
    );
    expect(phases.some(isBundleSynced)).toBe(false);
  });

  it("reports why the pose config failed to import", async () => {
    const { phases } = renderSynchronizer({
      importPoseConfigFromData: vi.fn(() => {
        throw new Error("Unsupported pose rig config version: 7.");
      }),
    });
    await runFrames();

    expect(
      phases.find(
        (update) =>
          update.substepId === "import-pose-config" &&
          update.status === "error",
      )?.message,
    ).toBe(
      "The face's pose config failed to import: Unsupported pose rig config version: 7.",
    );
    expect(phases.some(isBundleSynced)).toBe(false);
  });
});
