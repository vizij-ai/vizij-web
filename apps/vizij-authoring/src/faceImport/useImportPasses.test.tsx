import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthoringUiProvider,
  useAuthoringUiActions,
} from "../state/AuthoringUiProvider";
import { useImportPasses } from "./useImportPasses";

const pass = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  optimizeMorphTriangles: vi.fn(() => ({ bytes: null, report: { parts: [] } })),
  stillFolding: vi.fn(() => []),
}));

vi.mock("@vizij/import", () => pass);

function wrapper(optimizeMorphTriangles: boolean) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthoringUiProvider initialState={{ optimizeMorphTriangles }}>
        {children}
      </AuthoringUiProvider>
    );
  };
}

function renderPasses(optimizeMorphTriangles: boolean) {
  return renderHook(
    () => ({ passes: useImportPasses(), ui: useAuthoringUiActions() }),
    { wrapper: wrapper(optimizeMorphTriangles) },
  );
}

const face = (name: string) => new File([new Uint8Array([1, 2, 3])], name);

/**
 * Holds `init` until the returned function is called, as a first wasm
 * fetch does. Opening it before `init` is reached is fine: the gate stays
 * open.
 */
function gateInit() {
  let open = () => {};
  const gate = new Promise<void>((resolve) => (open = resolve));
  pass.init.mockImplementationOnce(async () => {
    await gate;
    return undefined;
  });
  return () => open();
}

describe("useImportPasses", () => {
  beforeEach(() => {
    pass.init.mockReset();
    pass.init.mockImplementation(async () => undefined);
    pass.optimizeMorphTriangles.mockClear();
  });

  it("imports the file untouched while the cleanup is off, as it is by default", async () => {
    const { result } = renderHook(() => useImportPasses(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <AuthoringUiProvider>{children}</AuthoringUiProvider>
      ),
    });
    const file = face("face.glb");
    let prepared: File | null = null;
    await act(async () => {
      prepared = await result.current.prepare(file);
    });
    expect(prepared).toBe(file);
    expect(pass.init).not.toHaveBeenCalled();
    expect(result.current.morphTriangles).toBeNull();
  });

  it("follows the option when it changes after mount", async () => {
    const { result } = renderPasses(false);
    act(() => result.current.ui.setOptimizeMorphTriangles(true));
    await act(async () => {
      await result.current.passes.prepare(face("face.glb"));
    });
    expect(pass.optimizeMorphTriangles).toHaveBeenCalledTimes(1);
    expect(result.current.passes.morphTriangles?.status).toBe("applied");
  });

  it("drops an earlier import that finishes after a later one", async () => {
    const { result } = renderPasses(true);
    const release = gateInit();
    let first: Promise<File | null> = Promise.resolve(null);
    act(() => {
      first = result.current.passes.prepare(face("a.glb"));
    });
    act(() => result.current.ui.setOptimizeMorphTriangles(false));
    let second: File | null = null;
    await act(async () => {
      second = await result.current.passes.prepare(face("b.glb"));
    });
    await act(async () => {
      release();
      expect(await first).toBeNull();
    });
    expect((second as File | null)?.name).toBe("b.glb");
    expect(result.current.passes.morphTriangles).toBeNull();
  });

  it("abandons an import still in its passes when New cancels it", async () => {
    const { result } = renderPasses(true);
    const release = gateInit();
    let pending: Promise<File | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.passes.prepare(face("a.glb"));
    });
    act(() => result.current.passes.cancel());
    await act(async () => {
      release();
      expect(await pending).toBeNull();
    });
    expect(result.current.passes.morphTriangles).toBeNull();
  });

  it("dismissing the notice leaves an import in progress to finish", async () => {
    const { result } = renderPasses(true);
    const release = gateInit();
    let pending: Promise<File | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.passes.prepare(face("a.glb"));
    });
    act(() => result.current.passes.dismissMorphTriangles());
    await act(async () => {
      release();
      expect(await pending).not.toBeNull();
    });
    expect(result.current.passes.morphTriangles?.status).toBe("applied");
  });
});
