import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { VisemeData } from "@vizij/config";

import { fetchVisemeData } from "./pollyApi";

const originalFetch = globalThis.fetch;
const originalApiUrl = import.meta.env.VITE_API_URL;

const createJsonResponse = <T>(data: T): Response =>
  ({ json: () => Promise.resolve(data) }) as unknown as Response;

const createBlobResponse = (blob: Blob): Response =>
  ({ blob: () => Promise.resolve(blob) }) as unknown as Response;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  import.meta.env.VITE_API_URL = originalApiUrl;
});

describe("fetchVisemeData", () => {
  it("uses VITE_API_URL by default", async () => {
    const visemeData: VisemeData = { sentences: [], words: [], visemes: [] };
    const audioBlob = new Blob();
    const base = " https://example.test/api/ ";
    import.meta.env.VITE_API_URL = base;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(visemeData))
      .mockResolvedValueOnce(createBlobResponse(audioBlob));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchVisemeData("hello", "Ruth");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://example.test/api/tts/get-visemes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://example.test/api/tts/get-audio",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({ visemeData, audioBlob });
  });

  it("uses an override base when provided", async () => {
    const visemeData: VisemeData = { sentences: [], words: [], visemes: [] };
    const audioBlob = new Blob();
    import.meta.env.VITE_API_URL = "https://example.test/base";

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(visemeData))
      .mockResolvedValueOnce(createBlobResponse(audioBlob));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchVisemeData(
      "hello",
      "Ruth",
      "https://override.test/api/",
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://override.test/api/tts/get-visemes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://override.test/api/tts/get-audio",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toEqual({ visemeData, audioBlob });
  });

  it("throws when VITE_API_URL is missing", async () => {
    delete (import.meta.env as Record<string, unknown>).VITE_API_URL;

    await expect(fetchVisemeData("hello", "Ruth")).rejects.toThrow(
      /VITE_API_URL/,
    );
  });
});
