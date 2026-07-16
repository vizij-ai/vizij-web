import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHistoryManager } from "../historyStore";
import { registerAnimationHistoryScope } from "../animationHistoryScope";
import { registerMotionGraphHistoryScope } from "../motiongraphHistoryScope";
import { registerPoseHistoryScope } from "../poseHistoryScope";
import { useAnimationStore } from "../../animationStore";
import { useEditorStore } from "../../../motiongraph/store/useEditorStore";
import { createPoseRigStore } from "../../../poseRig/store";

describe("history scopes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("undoes and redoes animation track edits", () => {
    useAnimationStore.getState().reset();
    const manager = createHistoryManager({ debounceMs: 50 });
    const cleanup = registerAnimationHistoryScope(manager);

    useAnimationStore.getState().addTrack("input-a", "Input A");
    vi.advanceTimersByTime(100);
    const trackId = useAnimationStore.getState().tracks[0]!.id;
    useAnimationStore.getState().addKeyframe(trackId, 1, 0.5);
    vi.advanceTimersByTime(100);
    expect(useAnimationStore.getState().tracks[0]!.keyframes).toHaveLength(1);

    manager.undo();
    expect(useAnimationStore.getState().tracks[0]!.keyframes).toHaveLength(0);
    manager.undo();
    expect(useAnimationStore.getState().tracks).toHaveLength(0);
    manager.redo();
    manager.redo();
    expect(useAnimationStore.getState().tracks[0]!.keyframes).toHaveLength(1);

    cleanup();
    useAnimationStore.getState().reset();
  });

  it("does not record transport-only changes", () => {
    useAnimationStore.getState().reset();
    const manager = createHistoryManager({ debounceMs: 50 });
    const cleanup = registerAnimationHistoryScope(manager);

    useAnimationStore.getState().play();
    useAnimationStore.getState().tick(0.25);
    useAnimationStore.getState().pause();
    vi.advanceTimersByTime(100);
    expect(manager.getStatus().canUndo).toBe(false);

    cleanup();
    useAnimationStore.getState().reset();
  });

  it("undoes motion-graph node edits", () => {
    useEditorStore.getState().clear();
    const manager = createHistoryManager({ debounceMs: 50 });
    const cleanup = registerMotionGraphHistoryScope(manager);

    useEditorStore.getState().setNodes(() => [
      {
        id: "n1",
        type: "oscillator",
        position: { x: 0, y: 0 },
        data: {},
      },
    ]);
    vi.advanceTimersByTime(100);
    expect(useEditorStore.getState().nodes).toHaveLength(1);

    manager.undo();
    expect(useEditorStore.getState().nodes).toHaveLength(0);
    manager.redo();
    expect(useEditorStore.getState().nodes).toHaveLength(1);

    cleanup();
    useEditorStore.getState().clear();
  });

  it("undoes pose creation and deletion through the pose store", () => {
    const store = createPoseRigStore();
    const manager = createHistoryManager({ debounceMs: 50 });
    const cleanup = registerPoseHistoryScope(manager, store);

    store.getState().createPose("Smile");
    vi.advanceTimersByTime(100);
    expect(store.getState().poses).toHaveLength(1);
    const poseId = store.getState().poses[0]!.id;

    vi.setSystemTime(Date.now() + 2000);
    store.getState().deletePose(poseId);
    vi.advanceTimersByTime(100);
    expect(store.getState().poses).toHaveLength(0);

    manager.undo();
    expect(store.getState().poses).toHaveLength(1);
    expect(store.getState().poses[0]!.name).toBe("Smile");
    manager.undo();
    expect(store.getState().poses).toHaveLength(0);
    manager.redo();
    expect(store.getState().poses).toHaveLength(1);

    cleanup();
  });
});
