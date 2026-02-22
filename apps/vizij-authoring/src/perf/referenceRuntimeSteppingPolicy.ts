export interface ResolveReferenceRuntimeSteppingPolicyOptions {
  hasBundle: boolean;
  visible: boolean;
  autostartRequested: boolean;
  driveOrchestratorRequested: boolean;
  recentlyActive: boolean;
}

export interface ReferenceRuntimeSteppingPolicy {
  runtimeAutostart: boolean;
  runtimeDriveOrchestrator: boolean;
  idleThrottled: boolean;
  label: string;
}

export function resolveReferenceRuntimeSteppingPolicy({
  hasBundle,
  visible,
  autostartRequested,
  driveOrchestratorRequested,
  recentlyActive,
}: ResolveReferenceRuntimeSteppingPolicyOptions): ReferenceRuntimeSteppingPolicy {
  if (!hasBundle || !visible) {
    return {
      runtimeAutostart: false,
      runtimeDriveOrchestrator: false,
      idleThrottled: false,
      label: "Hidden",
    };
  }

  if (recentlyActive) {
    return {
      runtimeAutostart: autostartRequested,
      runtimeDriveOrchestrator: driveOrchestratorRequested,
      idleThrottled: false,
      label: "Active",
    };
  }

  return {
    runtimeAutostart: false,
    runtimeDriveOrchestrator: false,
    idleThrottled: true,
    label: "Idle throttled",
  };
}
