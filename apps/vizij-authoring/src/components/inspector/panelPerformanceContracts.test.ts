import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const variablesPanelTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/panels/VariablesPanel.tsx"),
  "utf8",
);
const inspectorContentTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorContent.tsx"),
  "utf8",
);
const inspectorPanelTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/inspector/InspectorPanel.tsx"),
  "utf8",
);
const transformSectionTsx = readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/inspector/RiggingTransformSection.tsx",
  ),
  "utf8",
);
const morphSectionTsx = readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/inspector/RiggingMorphTargetsSection.tsx",
  ),
  "utf8",
);
const materialSectionTsx = readFileSync(
  path.resolve(
    process.cwd(),
    "src/components/inspector/RiggingMaterialSection.tsx",
  ),
  "utf8",
);

describe("B5.1 panel performance contracts", () => {
  it("avoids broad binding-store selectors in heavy panel surfaces", () => {
    expect(variablesPanelTsx).not.toContain(
      "useBindingAuthoring((state) => state)",
    );
    expect(inspectorContentTsx).not.toContain(
      "useBindingAuthoring((state) => state)",
    );
    expect(inspectorPanelTsx).not.toContain(
      "useBindingAuthoring((state) => state)",
    );
    expect(transformSectionTsx).not.toContain(
      "useBindingAuthoring((state) => state)",
    );
    expect(morphSectionTsx).not.toContain(
      "useBindingAuthoring((state) => state)",
    );
    expect(materialSectionTsx).not.toContain(
      "useBindingAuthoring((state) => state)",
    );
  });

  it("keeps variables tree filtering and panel rendering scoped to active surface", () => {
    expect(variablesPanelTsx).toContain("resolveVisibleRootForActiveSurface");
    expect(variablesPanelTsx).toContain(
      "if (surfaceForTab(id) !== activeSurface)",
    );
  });
});
