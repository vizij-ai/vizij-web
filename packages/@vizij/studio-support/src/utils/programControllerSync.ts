import type { RuntimeProgramRegistrationSupportResult } from "../types";

export type RuntimeProgramControllerPlaybackState =
  | "playing"
  | "paused"
  | "stopped";

export type RuntimeProgramControllerPlaybackEntry = {
  id: string;
  state: RuntimeProgramControllerPlaybackState;
};

export type RuntimeProgramControllerRemovalReason = "unavailable" | "inactive";

export type RuntimeProgramControllerRemoval = {
  programId: string;
  controllerId: string;
  reason: RuntimeProgramControllerRemovalReason;
};

export type RuntimeProgramControllerRegistration = {
  programId: string;
  registration: RuntimeProgramRegistrationSupportResult;
};

export type RuntimeProgramControllerSyncPlan = {
  stalePlaybackIds: string[];
  controllerRemovals: RuntimeProgramControllerRemoval[];
  controllerRegistrations: RuntimeProgramControllerRegistration[];
  waitingProgramIds: string[];
};

export type PlanRuntimeProgramControllerSyncOptions = {
  playbackStates: Iterable<RuntimeProgramControllerPlaybackEntry>;
  availableProgramIds: Iterable<string>;
  activeControllerIds: ReadonlyMap<string, string>;
  registrationByProgramId: ReadonlyMap<
    string,
    RuntimeProgramRegistrationSupportResult
  >;
};

export function planRuntimeProgramControllerSync({
  playbackStates,
  availableProgramIds,
  activeControllerIds,
  registrationByProgramId,
}: PlanRuntimeProgramControllerSyncOptions): RuntimeProgramControllerSyncPlan {
  const available = new Set(availableProgramIds);
  const seen = new Set<string>();
  const stalePlaybackIds: string[] = [];
  const controllerRemovals: RuntimeProgramControllerRemoval[] = [];
  const controllerRegistrations: RuntimeProgramControllerRegistration[] = [];
  const waitingProgramIds: string[] = [];

  for (const playback of playbackStates) {
    const programId = playback.id;
    if (seen.has(programId)) {
      continue;
    }
    seen.add(programId);

    const controllerId = activeControllerIds.get(programId);
    if (!available.has(programId)) {
      stalePlaybackIds.push(programId);
      if (controllerId) {
        controllerRemovals.push({
          programId,
          controllerId,
          reason: "unavailable",
        });
      }
      continue;
    }

    if (playback.state !== "playing") {
      if (controllerId) {
        controllerRemovals.push({
          programId,
          controllerId,
          reason: "inactive",
        });
      }
      continue;
    }

    if (controllerId) {
      continue;
    }

    const registration = registrationByProgramId.get(programId);
    if (!registration) {
      waitingProgramIds.push(programId);
      continue;
    }

    controllerRegistrations.push({
      programId,
      registration,
    });
  }

  return {
    stalePlaybackIds,
    controllerRemovals,
    controllerRegistrations,
    waitingProgramIds,
  };
}
