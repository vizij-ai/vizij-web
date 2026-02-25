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

describe("B2.1 variable lifecycle contracts", () => {
  it("keeps variable metadata editing in the rig inspector flow", () => {
    expect(inspectorContentTsx).toContain("Variable Metadata");
    expect(inspectorContentTsx).toContain("Apply Metadata");
    expect(inspectorContentTsx).toContain("handleApplyRigMetadataDraft");
  });

  it("exposes guardrail messaging for invalid edits and destructive actions", () => {
    expect(inspectorContentTsx).toContain(
      "Default value must stay within the configured min/max range.",
    );
    expect(inspectorContentTsx).toContain(
      "Deletion is disabled for system-managed variables.",
    );
    expect(inspectorContentTsx).toContain("handleDeleteCustomStandardInput");
  });

  it("preserves inspector-first and lifecycle UX contracts in docs", () => {
    expect(uiDesignDoc).toContain("Inspector-first workflows");
    expect(uiDesignDoc).toContain(
      "Consistent lifecycle patterns: create/edit/delete flows behave similarly",
    );
    expect(uiDesignDoc).toContain(
      "Editable metadata: name/path/min/max/default",
    );
  });

  it("authors parent/child links in staged pipeline mode by default", () => {
    expect(inspectorContentTsx).toContain("onAddParent");
    expect(inspectorContentTsx).toContain("onAddChild");
    expect(inspectorContentTsx).toContain(
      'migrationSource: "staged-link-authoring"',
    );
    expect(inspectorContentTsx).toContain("applyPipelineMetadataPatchForInput");
  });
});
