import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHistoryManager,
  type HistoryManager,
  type HistorySnapshot,
} from "../historyStore";

interface FakeDoc extends HistorySnapshot {
  value: number;
  label: string;
}

function createFakeScope(manager: HistoryManager, id = "fake") {
  let doc: FakeDoc = { value: 0, label: "initial" };
  const unregister = manager.registerScope({
    id,
    capture: () => doc,
    restore: (snapshot) => {
      doc = snapshot as FakeDoc;
    },
  });
  return {
    unregister,
    get: () => doc,
    set: (next: Partial<FakeDoc>) => {
      doc = { ...doc, ...next };
      manager.notifyChange();
    },
  };
}

describe("createHistoryManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with nothing to undo or redo", () => {
    const manager = createHistoryManager();
    createFakeScope(manager);
    expect(manager.getStatus()).toMatchObject({
      canUndo: false,
      canRedo: false,
    });
    expect(manager.undo()).toBe(false);
    expect(manager.redo()).toBe(false);
  });

  it("commits a debounced burst as a single entry and undoes it", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    const scope = createFakeScope(manager);

    scope.set({ value: 1 });
    scope.set({ value: 2 });
    scope.set({ value: 3 });
    expect(manager.getStatus().canUndo).toBe(false);

    vi.advanceTimersByTime(150);
    expect(manager.getStatus()).toMatchObject({
      canUndo: true,
      undoDepth: 1,
    });

    expect(manager.undo()).toBe(true);
    expect(scope.get().value).toBe(0);
    expect(manager.getStatus()).toMatchObject({
      canUndo: false,
      canRedo: true,
    });

    expect(manager.redo()).toBe(true);
    expect(scope.get().value).toBe(3);
  });

  it("flushes pending changes before an undo so nothing is lost", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    const scope = createFakeScope(manager);

    scope.set({ value: 1 });
    vi.advanceTimersByTime(150);
    scope.set({ value: 2 });
    // No debounce elapse: undo must still see value=2 as an entry.
    expect(manager.undo()).toBe(true);
    expect(scope.get().value).toBe(1);
    expect(manager.undo()).toBe(true);
    expect(scope.get().value).toBe(0);
  });

  it("clears the redo stack on a new edit after undo", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    const scope = createFakeScope(manager);

    scope.set({ value: 1 });
    vi.advanceTimersByTime(150);
    manager.undo();
    expect(manager.getStatus().canRedo).toBe(true);

    vi.setSystemTime(Date.now() + 2000); // leave the absorb window
    scope.set({ value: 5 });
    vi.advanceTimersByTime(150);
    expect(manager.getStatus().canRedo).toBe(false);
    manager.undo();
    expect(scope.get().value).toBe(0);
  });

  it("does not record identical snapshots", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    const scope = createFakeScope(manager);

    // Notify without an actual change.
    manager.notifyChange();
    vi.advanceTimersByTime(150);
    expect(manager.getStatus().canUndo).toBe(false);

    scope.set({ value: 1 });
    vi.advanceTimersByTime(150);
    expect(manager.getStatus().undoDepth).toBe(1);
  });

  it("absorbs the echo commit right after a restore", () => {
    const manager = createHistoryManager({
      debounceMs: 100,
      absorbAfterRestoreMs: 1000,
    });
    const scope = createFakeScope(manager);

    scope.set({ value: 1 });
    vi.advanceTimersByTime(150);
    manager.undo();

    // A derived-state rebuild echoes with fresh references shortly after the
    // restore; it must not create a duplicate entry.
    scope.set({ label: "initial-rebuilt" });
    vi.advanceTimersByTime(150);
    expect(manager.getStatus()).toMatchObject({
      canUndo: false,
      canRedo: true,
    });
  });

  it("caps the undo depth at the configured capacity", () => {
    const manager = createHistoryManager({ debounceMs: 10, capacity: 3 });
    const scope = createFakeScope(manager);

    for (let index = 1; index <= 6; index += 1) {
      scope.set({ value: index });
      vi.advanceTimersByTime(20);
    }
    expect(manager.getStatus().undoDepth).toBe(3);
    manager.undo();
    manager.undo();
    manager.undo();
    expect(manager.undo()).toBe(false);
    expect(scope.get().value).toBe(3);
  });

  it("reset clears both stacks and re-baselines", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    const scope = createFakeScope(manager);

    scope.set({ value: 1 });
    vi.advanceTimersByTime(150);
    manager.undo();
    manager.reset();
    expect(manager.getStatus()).toMatchObject({
      canUndo: false,
      canRedo: false,
    });

    vi.setSystemTime(Date.now() + 2000);
    scope.set({ value: 9 });
    vi.advanceTimersByTime(150);
    manager.undo();
    expect(scope.get().value).toBe(0);
  });

  it("restores multiple scopes together and skips unregistered ones", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    const first = createFakeScope(manager, "first");
    const second = createFakeScope(manager, "second");

    first.set({ value: 1 });
    second.set({ value: 10 });
    vi.advanceTimersByTime(150);

    second.unregister();
    expect(manager.undo()).toBe(true);
    expect(first.get().value).toBe(0);
    // Unregistered scope untouched.
    expect(second.get().value).toBe(10);
  });

  it("ignores notifications while restoring", () => {
    const manager = createHistoryManager({ debounceMs: 100 });
    let doc = { value: 0 };
    manager.registerScope({
      id: "loop",
      capture: () => ({ ...doc }),
      restore: (snapshot) => {
        doc = snapshot as { value: number };
        // Simulate a store listener firing synchronously during restore.
        manager.notifyChange();
      },
    });
    doc = { value: 1 };
    manager.notifyChange();
    vi.advanceTimersByTime(150);
    expect(manager.undo()).toBe(true);
    expect(doc.value).toBe(0);
    // The synchronous notify during restore must not have queued a commit.
    vi.advanceTimersByTime(500);
    expect(manager.getStatus().canRedo).toBe(true);
  });
});
