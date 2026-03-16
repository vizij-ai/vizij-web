import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserSafeId } from "../createBrowserSafeId";

const uuidV4Pattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createBrowserSafeId", () => {
  it("uses crypto.randomUUID when available", () => {
    const randomUUID = vi.fn(() => "uuid-from-randomUUID");

    vi.stubGlobal("crypto", {
      randomUUID,
    });

    expect(createBrowserSafeId()).toBe("uuid-from-randomUUID");
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it("builds a v4 uuid from getRandomValues when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set([
          0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa,
          0xbb, 0xcc, 0xdd, 0xee, 0xff,
        ]);
        return bytes;
      },
    });

    const id = createBrowserSafeId();

    expect(id).toBe("00112233-4455-4677-8899-aabbccddeeff");
    expect(id).toMatch(uuidV4Pattern);
  });

  it("falls back to a non-throwing opaque id when crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1710000000000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);

    const first = createBrowserSafeId();
    const second = createBrowserSafeId();

    expect(first).toMatch(/^vizij-/);
    expect(second).toMatch(/^vizij-/);
    expect(first).not.toBe(second);
  });
});
