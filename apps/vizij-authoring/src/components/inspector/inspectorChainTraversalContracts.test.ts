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
  it("keeps explicit rig-to-autorig and autorig-to-rig inspector affordances", () => {
    expect(inspectorContentTsx).toContain("includeAutorig: true");
    expect(inspectorContentTsx).toContain("Autorig");
    expect(inspectorContentTsx).toContain("Driven By");
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
