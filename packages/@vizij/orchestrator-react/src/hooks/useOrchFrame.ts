import { useSyncExternalStore } from "react";
import type { OrchestratorFrame } from "../types";
import { useOrchestrator } from "./useOrchestrator";

export function useOrchFrame(): OrchestratorFrame | null {
  const ctx = useOrchestrator();

  return useSyncExternalStore<OrchestratorFrame | null>(
    (cb) => ctx.subscribeToFrame(cb),
    () => ctx.getFrameSnapshot(),
    () => ctx.getFrameSnapshot(),
  );
}
