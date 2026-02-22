import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../App.tsx"),
  "utf8",
);
const viewerSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../components/app/Viewer.tsx",
  ),
  "utf8",
);
const referencePanelSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../components/app/ReferenceFacePanel.tsx",
  ),
  "utf8",
);
const referenceRuntimeSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../components/app/ReferenceFaceRuntime.tsx",
  ),
  "utf8",
);
const runtimeFaceFrameSource = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../components/app/RuntimeFaceFrame.tsx",
  ),
  "utf8",
);

describe("cross-face runtime contracts", () => {
  it("routes selected scene identity to both main and reference runtime hosts", () => {
    expect(appSource).toContain("selectedSceneId={selectedSceneId}");
    expect(appSource).toContain("<ReferenceFacePanel");
    expect(referencePanelSource).toContain("selectedSceneId={selectedSceneId}");
    expect(referenceRuntimeSource).toContain("selectedSceneId");
    expect(referenceRuntimeSource).toContain(
      "selectElementById?.(selectedSceneId)",
    );
  });

  it("keeps outline glow wiring on both face canvases", () => {
    expect(viewerSource).toContain("showSelectionGlow={showSelectionGlow}");
    expect(appSource).toContain("showSelectionGlow={showSelectionGlow}");
    expect(referencePanelSource).toContain(
      "showSelectionGlow={showSelectionGlow}",
    );
    expect(referenceRuntimeSource).toContain("showSelectionGlow");
    expect(runtimeFaceFrameSource).toContain(
      "showSelectionGlow={showSelectionGlow}",
    );
  });

  it("surfaces fps status text for main and reference runtimes", () => {
    expect(viewerSource).toContain("formattedFps");
    expect(viewerSource).toContain("fps");
    expect(referenceRuntimeSource).toContain("ref-face-viewer__fps");
    expect(referenceRuntimeSource).toContain("formattedFps");
  });

  it("keeps post-pose-import responsiveness refresh wired in App", () => {
    expect(appSource).toContain("runPostPoseImportNudge");
    expect(appSource).toContain(
      "onPostPoseImport: requestRuntimeTopologyRefresh",
    );
  });
});
