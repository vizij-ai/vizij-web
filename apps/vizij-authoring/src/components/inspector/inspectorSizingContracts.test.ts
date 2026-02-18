import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesCss = readFileSync(
  path.resolve(process.cwd(), "src/styles.css"),
  "utf8",
);
const rowSliderTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/ui/RowSlider.tsx"),
  "utf8",
);
const collapsibleRowTsx = readFileSync(
  path.resolve(process.cwd(), "src/components/ui/CollapsibleRow.tsx"),
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

describe("B1.1 inspector sizing contracts", () => {
  it("defines reusable minimum size tokens", () => {
    expect(stylesCss).toMatch(/--inspector-row-hit-min-height:\s*32px;/);
    expect(stylesCss).toMatch(/--inspector-numeric-min-width:\s*88px;/);
    expect(stylesCss).toMatch(
      /\.inspector-row-hit-target\s*{[\s\S]*?min-height:/,
    );
    expect(stylesCss).toMatch(
      /\.inspector-numeric-control\s*{[\s\S]*?min-width:\s*var\(--inspector-numeric-min-width\);/,
    );
  });

  it("uses numeric width contract on inspector slider rows", () => {
    expect(rowSliderTsx).toContain("inspector-numeric-control");
    expect(inspectorContentTsx).toContain("inspector-numeric-control");
    expect(inspectorPanelTsx).toContain("inspector-numeric-control");
  });

  it("allows wrapping in dense inspector row layouts", () => {
    expect(collapsibleRowTsx).toContain("flex-wrap");
    expect(collapsibleRowTsx).not.toContain("w-48");
    expect(inspectorContentTsx).toContain("flex flex-wrap items-center");
    expect(inspectorPanelTsx).toContain("flex flex-wrap items-center");
  });
});
