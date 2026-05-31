import type { OrchestratorBackend } from "@vizij/orchestrator-react";
import {
  resolveAnimationTransportMode as resolveStudioAnimationTransportMode,
  type AnimationTransportPreference,
  type ResolvedAnimationTransportMode,
} from "@vizij/studio-support";
import type { AnimationTransportMode } from "../types";

export function resolveProviderAnimationBackend(args: {
  providerBackend: OrchestratorBackend | undefined;
  parentBackend: OrchestratorBackend | undefined;
  providesOrchestrator: boolean;
}): OrchestratorBackend | undefined {
  if (args.providesOrchestrator) {
    return args.providerBackend;
  }
  return args.parentBackend ?? args.providerBackend;
}

export function resolveAnimationTransportMode(
  mode: AnimationTransportMode | undefined,
  backend: OrchestratorBackend | undefined,
): ResolvedAnimationTransportMode {
  return resolveStudioAnimationTransportMode(
    mode as AnimationTransportPreference | undefined,
    backend,
  );
}
