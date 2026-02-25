import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const inspectorContentTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorContent.tsx"),
  "utf8",
);
const uiDesignDoc = readFileSync(
  path.resolve(process.cwd(), "docs/UI_DESIGN.md"),
  "utf8",
);
const backlogDoc = readFileSync(
  path.resolve(process.cwd(), "docs/plans/BACKLOG.md"),
  "utf8",
);

describe("B2.4 inspector chain traversal contracts", () => {
  it("keeps autorig traversal wiring while removing redundant chain panels", () => {
    expect(inspectorContentTsx).toContain("includeAutorig: true");
    expect(inspectorContentTsx).toContain("Autorig");
    expect(inspectorContentTsx).toContain("showAutorigInternals");
    expect(inspectorContentTsx).not.toContain("Driven By");
    expect(inspectorContentTsx).not.toContain("What This Drives");
    expect(inspectorContentTsx).not.toContain("Show Autorig Internals");
    expect(inspectorContentTsx).not.toContain("Hide Autorig Internals");
  });

  it("uses chain-path helper to preserve context on revisits", () => {
    expect(inspectorContentTsx).toContain("appendOrRevisitInspectorChainPath");
    expect(inspectorContentTsx).toContain("pendingChainNavigationRef");
  });

  it("matches documented traversal contract directionality", () => {
    expect(uiDesignDoc).toContain("Pose -> Rig -> Autorig -> Animatable");
    expect(uiDesignDoc).toContain(
      "Animatable -> Autorig -> Rig -> Pose sources",
    );
    expect(backlogDoc).toContain("B2.4 Inspector Chain Traversal Completion");
  });
});
