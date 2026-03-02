import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./useEditorStore";

describe("useEditorStore prune safeguards", () => {
  beforeEach(() => {
    useEditorStore.getState().clear();
  });

  it("retains enabled inputs when allowed paths are temporarily empty", () => {
    const store = useEditorStore.getState();
    store.setEnabledInputs(["/face/jaw/open"]);

    store.pruneEnabledInputs(new Set());

    expect(Array.from(useEditorStore.getState().enabledInputs)).toEqual([
      "/face/jaw/open",
    ]);
  });

  it("retains enabled outputs when allowed paths are temporarily empty", () => {
    const store = useEditorStore.getState();
    store.setEnabledOutputs(["/face/jaw/open"]);

    store.pruneEnabledOutputs(new Set());

    expect(Array.from(useEditorStore.getState().enabledOutputs)).toEqual([
      "/face/jaw/open",
    ]);
  });
});
