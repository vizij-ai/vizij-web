import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthoringUiProvider,
  useAuthoringUiActions,
  type MorphTriangleCleanup,
} from "../state/AuthoringUiProvider";
import { useImportPasses } from "./useImportPasses";

const pass = vi.hoisted(() => ({
  init: vi.fn(async () => undefined),
  optimizeMorphTriangles: vi.fn(
    (
      _glb: Uint8Array,
      _mode: string,
    ): { bytes: Uint8Array<ArrayBuffer> | null; report: { parts: [] } } => ({
      bytes: null,
      report: { parts: [] },
    }),
  ),
  stillFolding: vi.fn(() => []),
}));

vi.mock("@semio/import", () => pass);

function wrapper(morphTriangleCleanup: MorphTriangleCleanup) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthoringUiProvider initialState={{ morphTriangleCleanup }}>
        {children}
      </AuthoringUiProvider>
    );
  };
}

function renderPasses(morphTriangleCleanup: MorphTriangleCleanup) {
  return renderHook(
    () => ({ passes: useImportPasses(), ui: useAuthoringUiActions() }),
    { wrapper: wrapper(morphTriangleCleanup) },
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
      prepared = await result.current.prepare(result.current.begin(), file);
    });
    expect(prepared).toBe(file);
    expect(pass.init).not.toHaveBeenCalled();
    expect(result.current.notice).toBeNull();
  });

  it("follows the option when it changes after mount", async () => {
    const { result } = renderPasses("off");
    act(() => result.current.ui.setMorphTriangleCleanup("safe"));
    await act(async () => {
      await result.current.passes.prepare(
        result.current.passes.begin(),
        face("face.glb"),
      );
    });
    expect(pass.optimizeMorphTriangles).toHaveBeenCalledTimes(1);
    expect(result.current.passes.notice?.outcome?.status).toBe("applied");
  });

  it("drops an earlier import that finishes after a later one", async () => {
    const { result } = renderPasses("safe");
    const release = gateInit();
    let first: Promise<File | null> = Promise.resolve(null);
    act(() => {
      first = result.current.passes.prepare(
        result.current.passes.begin(),
        face("a.glb"),
      );
    });
    act(() => result.current.ui.setMorphTriangleCleanup("off"));
    let second: File | null = null;
    await act(async () => {
      second = await result.current.passes.prepare(
        result.current.passes.begin(),
        face("b.glb"),
      );
    });
    await act(async () => {
      release();
      expect(await first).toBeNull();
    });
    expect((second as File | null)?.name).toBe("b.glb");
    expect(result.current.passes.notice).toBeNull();
  });

  it("drops an import superseded by one that started but never reached its passes", async () => {
    // A preset import takes its ticket before fetching; if the fetch fails,
    // it never prepares, but the import it superseded must still be dropped.
    const { result } = renderPasses("safe");
    const release = gateInit();
    let pending: Promise<File | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.passes.prepare(
        result.current.passes.begin(),
        face("a.glb"),
      );
    });
    act(() => {
      result.current.passes.begin();
    });
    await act(async () => {
      release();
      expect(await pending).toBeNull();
    });
    expect(result.current.passes.notice).toBeNull();
    expect(result.current.passes.original).toBeNull();
  });

  it("dismissing hides the notice", async () => {
    const { result } = renderPasses("safe");
    await act(async () => {
      await result.current.passes.prepare(
        result.current.passes.begin(),
        face("a.glb"),
      );
    });
    expect(result.current.passes.notice).not.toBeNull();
    act(() => result.current.passes.dismissMorphTriangles());
    expect(result.current.passes.notice).toBeNull();
  });

  it("dismissing the notice leaves an import in progress to finish", async () => {
    const { result } = renderPasses("safe");
    const release = gateInit();
    let pending: Promise<File | null> = Promise.resolve(null);
    act(() => {
      pending = result.current.passes.prepare(
        result.current.passes.begin(),
        face("a.glb"),
      );
    });
    act(() => result.current.passes.dismissMorphTriangles());
    await act(async () => {
      release();
      expect(await pending).not.toBeNull();
    });
    expect(result.current.passes.notice?.outcome?.status).toBe("applied");
  });

  it("keeps the picked file, before the cleanup rewrote it", async () => {
    pass.optimizeMorphTriangles.mockReturnValueOnce({
      bytes: new Uint8Array([9]),
      report: { parts: [] },
    });
    const { result } = renderPasses("safe");
    const picked = face("a.glb");
    let loaded: File | null = null;
    await act(async () => {
      loaded = await result.current.passes.prepare(
        result.current.passes.begin(),
        picked,
      );
    });
    expect(loaded).not.toBe(picked);
    expect(result.current.passes.original).toBe(picked);
  });

  it("runs a re-import with the cleanup it is given and says so even when off", async () => {
    const { result } = renderPasses("safe");
    const picked = face("a.glb");
    let loaded: File | null = null;
    await act(async () => {
      loaded = await result.current.passes.prepare(
        result.current.passes.begin(),
        picked,
        "off",
      );
    });
    expect(loaded).toBe(picked);
    expect(pass.optimizeMorphTriangles).not.toHaveBeenCalled();
    expect(result.current.passes.notice).toEqual({
      cleanup: "off",
      outcome: null,
    });

    await act(async () => {
      await result.current.passes.prepare(
        result.current.passes.begin(),
        picked,
        "overall",
      );
    });
    expect(pass.optimizeMorphTriangles.mock.calls[0][1]).toBe("overall");
    expect(result.current.passes.notice?.cleanup).toBe("overall");
  });

  it("hides the previous import's notice as soon as the next one starts", async () => {
    const { result } = renderPasses("safe");
    await act(async () => {
      await result.current.passes.prepare(
        result.current.passes.begin(),
        face("a.glb"),
      );
    });
    expect(result.current.passes.notice).not.toBeNull();
    act(() => {
      result.current.passes.begin();
    });
    expect(result.current.passes.notice).toBeNull();
  });
});
