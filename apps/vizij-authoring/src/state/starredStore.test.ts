import { beforeEach, describe, expect, it } from "vitest";
import {
  getStarredForFace,
  isRefStarred,
  starredRefKey,
  useStarredStore,
} from "./starredStore";

beforeEach(() => {
  useStarredStore.setState({ byFace: {} });
  try {
    window.localStorage.clear();
  } catch {
    // ignore in non-DOM environments
  }
});

describe("starredStore", () => {
  it("toggles a reference on and off for a face", () => {
    const { toggleStarred } = useStarredStore.getState();
    const ref = { kind: "driver", id: "mouth_open" } as const;

    toggleStarred("faceA", ref);
    expect(getStarredForFace(useStarredStore.getState(), "faceA")).toEqual([
      ref,
    ]);

    toggleStarred("faceA", ref);
    expect(getStarredForFace(useStarredStore.getState(), "faceA")).toEqual([]);
  });

  it("scopes starred references per face", () => {
    const { toggleStarred } = useStarredStore.getState();
    toggleStarred("faceA", { kind: "driver", id: "d1" });
    toggleStarred("faceB", { kind: "pose", id: "p1" });

    expect(getStarredForFace(useStarredStore.getState(), "faceA")).toEqual([
      { kind: "driver", id: "d1" },
    ]);
    expect(getStarredForFace(useStarredStore.getState(), "faceB")).toEqual([
      { kind: "pose", id: "p1" },
    ]);
  });

  it("distinguishes drivers and poses that share an id", () => {
    const { toggleStarred } = useStarredStore.getState();
    toggleStarred("faceA", { kind: "driver", id: "shared" });
    toggleStarred("faceA", { kind: "pose", id: "shared" });

    const refs = getStarredForFace(useStarredStore.getState(), "faceA");
    expect(refs).toHaveLength(2);
    expect(isRefStarred(refs, { kind: "driver", id: "shared" })).toBe(true);
    expect(isRefStarred(refs, { kind: "pose", id: "shared" })).toBe(true);
  });

  it("replaces and dedupes the set on import via setStarredForFace", () => {
    const { setStarredForFace } = useStarredStore.getState();
    setStarredForFace("faceA", [
      { kind: "driver", id: "d1" },
      { kind: "driver", id: "d1" },
      { kind: "pose", id: "p1" },
    ]);

    expect(getStarredForFace(useStarredStore.getState(), "faceA")).toEqual([
      { kind: "driver", id: "d1" },
      { kind: "pose", id: "p1" },
    ]);
  });

  it("ignores toggles when the face id is empty", () => {
    const { toggleStarred } = useStarredStore.getState();
    toggleStarred("", { kind: "driver", id: "d1" });
    expect(getStarredForFace(useStarredStore.getState(), "")).toEqual([]);
  });

  it("builds a stable, kind-qualified key", () => {
    expect(starredRefKey({ kind: "driver", id: "d1" })).toBe("driver:d1");
    expect(starredRefKey({ kind: "pose", id: "d1" })).toBe("pose:d1");
  });
});
