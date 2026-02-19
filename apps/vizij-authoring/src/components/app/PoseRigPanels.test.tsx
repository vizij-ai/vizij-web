import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PoseDiagnostic } from "../../poseRig/types";
import { PoseRigExportPanel, PoseRigImportPanel } from "./PoseRigPanels";

const noopAsync = vi.fn(async () => {});
const noop = vi.fn();

afterEach(() => {
  cleanup();
});

describe("PoseRigPanels diagnostics surfaces", () => {
  it("renders structured diagnostics in pose import panel", () => {
    const diagnostics: PoseDiagnostic[] = [
      {
        id: "pose-ir:non-canonical-input-id:1",
        severity: "warning",
        code: "non-canonical-input-id",
        source: "pose-ir",
        message:
          'Pose "Smile" input "unknown_input" ignored because it is not a canonical standard input id.',
      },
      {
        id: "pose-ir:invalid-input-value:2",
        severity: "error",
        code: "invalid-input-value",
        source: "pose-ir",
        message: 'Neutral input "smile" ignored invalid value.',
      },
    ];

    render(
      <PoseRigImportPanel
        onImportPoseConfig={noopAsync}
        onImportPoseGraph={noopAsync}
        onImportPoseIr={noopAsync}
        poseConfigWarnings={[]}
        poseDiagnostics={diagnostics}
      />,
    );

    expect(screen.getByText("Pose diagnostics:")).toBeTruthy();
    expect(screen.getByText(/\[non-canonical-input-id\]/)).toBeTruthy();
    expect(screen.getByText(/\[invalid-input-value\]/)).toBeTruthy();
    expect(screen.getByText(/1 errors · 1 warnings · 0 info/)).toBeTruthy();
  });

  it("renders diagnostics summary in pose export panel", () => {
    const diagnostics: PoseDiagnostic[] = [
      {
        id: "pose-ir:unsupported-ir-version:1",
        severity: "error",
        code: "unsupported-ir-version",
        source: "pose-ir",
        message: "Unsupported pose rig IR version: 99.",
      },
      {
        id: "pose-config:legacy-config-warning:2",
        severity: "warning",
        code: "legacy-config-warning",
        source: "pose-config",
        message: "Legacy warning.",
      },
    ];

    render(
      <PoseRigExportPanel
        rigName="pose_rig"
        onRigNameChange={noop}
        poseGraphFileName="pose.graph.json"
        onPoseGraphFileNameChange={noop}
        poseConfigFileName="pose.config.json"
        onPoseConfigFileNameChange={noop}
        onExportPoseGraph={noop}
        onExportPoseConfig={noop}
        poseIrFileName="pose.ir.json"
        onPoseIrFileNameChange={noop}
        onExportPoseIr={noop}
        poseDiagnostics={diagnostics}
      />,
    );

    expect(screen.getByText("Pose diagnostics in draft:")).toBeTruthy();
    expect(screen.getByText(/1 errors · 1 warnings/)).toBeTruthy();
    expect(
      screen.getByText(
        "Resolve error diagnostics before relying on exported artifacts.",
      ),
    ).toBeTruthy();
  });
});
