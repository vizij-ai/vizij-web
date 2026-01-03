import { describe, expect, it, vi } from "vitest";
import { downloadJsonFile, ensureExtension, readJsonFile } from "../fileIO";
import { downloadBlob } from "../download";

vi.mock("../download", () => ({
  downloadBlob: vi.fn(),
}));

const mockedDownloadBlob = vi.mocked(downloadBlob);

describe("fileIO", () => {
  it("ensures missing extensions are appended", () => {
    expect(ensureExtension("pose", "fallback", "json")).toBe("pose.json");
    expect(ensureExtension("already.JSON", "fallback", "json")).toBe(
      "already.JSON",
    );
    expect(ensureExtension("   ", "rig", ".glb")).toBe("rig.glb");
  });

  it("downloads JSON payloads", () => {
    downloadJsonFile({ foo: "bar" }, "data.json");
    expect(mockedDownloadBlob).toHaveBeenCalledTimes(1);
    const blobArg = mockedDownloadBlob.mock.calls[0]?.[0];
    expect(blobArg).toBeInstanceOf(Blob);
  });

  it("reads parsed JSON from a File", async () => {
    const file = {
      text: vi.fn().mockResolvedValue('{"value":42}'),
    } as unknown as File;
    await expect(readJsonFile<{ value: number }>(file)).resolves.toEqual({
      value: 42,
    });
  });
});
