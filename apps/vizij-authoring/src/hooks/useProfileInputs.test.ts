import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { VizijBundleProfile } from "@vizij/render";
import { useProfileInputs } from "./useProfileInputs";

const { createMock, byPath } = vi.hoisted(() => ({
  createMock: vi.fn(),
  byPath: new Map<string, unknown>(),
}));

// The hook reads two things off the binding-authoring store; stand them up
// directly so what is under test is the skip-and-create decision.
vi.mock("../state/RigControllerProvider", () => ({
  useBindingAuthoring: (
    selector: (state: {
      handleCreateCustomStandardInput: unknown;
      standardInputsByPath: Map<string, unknown>;
    }) => unknown,
  ) =>
    selector({
      handleCreateCustomStandardInput: createMock,
      standardInputsByPath: byPath,
    }),
}));

const profileOf = (paths: string[]): VizijBundleProfile => ({
  id: "vizij-face",
  version: "v1",
  keys: paths.map((path) => ({ path })),
});

beforeEach(() => {
  createMock.mockReset().mockImplementation((path: string) => ({ id: path }));
  byPath.clear();
});

describe("useProfileInputs", () => {
  it("creates a standard input for every path the rig lacks", () => {
    const { result } = renderHook(() => useProfileInputs());
    const report = result.current(
      profileOf([
        "rig/quori_latest/standard/vizij/expression/happy",
        "rig/quori_latest/standard/vizij/viseme/aa",
      ]),
    );
    expect(report).toStrictEqual({ added: 2, existing: 0 });
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  // Standard inputs are keyed rig-relative, so the face prefix a declared
  // profile carries has to come off before the lookup or the create.
  it("normalizes the face prefix off the path", () => {
    const { result } = renderHook(() => useProfileInputs());
    result.current(
      profileOf(["rig/quori_latest/standard/vizij/expression/happy"]),
    );
    expect(createMock).toHaveBeenCalledWith("/standard/vizij/expression/happy");
  });

  // The underlying entry point de-duplicates by id and would mint `happy_2`
  // on a re-import, quietly doubling the control surface.
  it("skips a path the rig already carries rather than duplicating it", () => {
    byPath.set("/standard/vizij/expression/happy", { id: "happy" });
    const { result } = renderHook(() => useProfileInputs());
    const report = result.current(
      profileOf([
        "rig/quori_latest/standard/vizij/expression/happy",
        "rig/quori_latest/standard/vizij/viseme/aa",
      ]),
    );
    expect(report).toStrictEqual({ added: 1, existing: 1 });
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith("/standard/vizij/viseme/aa");
  });

  it("re-importing an unchanged profile adds nothing", () => {
    byPath.set("/standard/vizij/expression/happy", { id: "happy" });
    byPath.set("/standard/vizij/viseme/aa", { id: "aa" });
    const { result } = renderHook(() => useProfileInputs());
    expect(
      result.current(
        profileOf([
          "rig/quori_latest/standard/vizij/expression/happy",
          "rig/quori_latest/standard/vizij/viseme/aa",
        ]),
      ),
    ).toStrictEqual({ added: 0, existing: 2 });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("does not count an input the rig refused to create", () => {
    createMock.mockReturnValue(null);
    const { result } = renderHook(() => useProfileInputs());
    expect(
      result.current(profileOf(["rig/quori_latest/standard/vizij/viseme/aa"])),
    ).toStrictEqual({ added: 0, existing: 0 });
  });

  it("is a no-op for a profile that defines nothing", () => {
    const { result } = renderHook(() => useProfileInputs());
    expect(result.current(profileOf([]))).toStrictEqual({
      added: 0,
      existing: 0,
    });
  });
});
