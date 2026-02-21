import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../App.tsx",
);
const viewerSourcePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../components/app/Viewer.tsx",
);

function readAppSource() {
  return readFileSync(appSourcePath, "utf8");
}

function readViewerSource() {
  return readFileSync(viewerSourcePath, "utf8");
}

function collectGraphRuntimeSelectors(source: string): string[] {
  const selectorPattern =
    /useGraphRuntime\(\s*\(state\)\s*=>\s*state\.([A-Za-z0-9_]+)/g;
  return Array.from(source.matchAll(selectorPattern), (match) => match[1]);
}

describe("App runtime performance contracts", () => {
  it("keeps runtime bundle construction routed through useRuntimeBaseBundle", () => {
    const source = readAppSource();
    expect(source).toContain("useRuntimeBaseBundle({");
  });

  it("avoids inert graph runtime subscriptions in App", () => {
    const source = readAppSource();
    const selectors = collectGraphRuntimeSelectors(source);

    expect(new Set(selectors)).toEqual(
      new Set(["faceSegment", "faceId", "handleImportGraphSpec"]),
    );
    expect(selectors).not.toContain("graphSpec");
    expect(selectors).not.toContain("poseGraphSpec");
    expect(selectors).not.toContain("poseConfig");
    expect(selectors).not.toContain("discrepancyReview");
    expect(selectors).not.toContain("resolveDiscrepancyReview");
  });

  it("keeps Viewer runtime graph bridge driven by revision selectors", () => {
    const source = readViewerSource();
    const selectors = collectGraphRuntimeSelectors(source);

    expect(selectors).toContain("graphSpecRevision");
    expect(selectors).toContain("poseGraphSpecRevision");
    expect(selectors).toContain("poseRuntimeRevision");
  });
});
