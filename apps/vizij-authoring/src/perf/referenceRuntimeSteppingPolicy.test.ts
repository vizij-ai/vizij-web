import { describe, expect, it } from "vitest";
import { resolveReferenceRuntimeSteppingPolicy } from "./referenceRuntimeSteppingPolicy";

describe("resolveReferenceRuntimeSteppingPolicy", () => {
  it("disables runtime stepping when bundle is missing", () => {
    const policy = resolveReferenceRuntimeSteppingPolicy({
      hasBundle: false,
      visible: true,
      autostartRequested: true,
      driveOrchestratorRequested: true,
      recentlyActive: true,
    });

    expect(policy).toEqual({
      runtimeAutostart: false,
      runtimeDriveOrchestrator: false,
      idleThrottled: false,
      label: "Hidden",
    });
  });

  it("runs fully active when recent activity is present", () => {
    const policy = resolveReferenceRuntimeSteppingPolicy({
      hasBundle: true,
      visible: true,
      autostartRequested: true,
      driveOrchestratorRequested: true,
      recentlyActive: true,
    });

    expect(policy).toEqual({
      runtimeAutostart: true,
      runtimeDriveOrchestrator: true,
      idleThrottled: false,
      label: "Active",
    });
  });

  it("throttles idle stepping when no recent activity is present", () => {
    const policy = resolveReferenceRuntimeSteppingPolicy({
      hasBundle: true,
      visible: true,
      autostartRequested: true,
      driveOrchestratorRequested: true,
      recentlyActive: false,
    });

    expect(policy).toEqual({
      runtimeAutostart: false,
      runtimeDriveOrchestrator: false,
      idleThrottled: true,
      label: "Idle throttled",
    });
  });

  it("keeps idle mode non-throttled when not visible", () => {
    const policy = resolveReferenceRuntimeSteppingPolicy({
      hasBundle: true,
      visible: false,
      autostartRequested: true,
      driveOrchestratorRequested: true,
      recentlyActive: false,
    });

    expect(policy).toEqual({
      runtimeAutostart: false,
      runtimeDriveOrchestrator: false,
      idleThrottled: false,
      label: "Hidden",
    });
  });
});
