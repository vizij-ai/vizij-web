import { useContext } from "react";
import { OrchestratorContext } from "../context";
import type { OrchestratorReactCtx } from "../types";

export function useOrchestrator(): OrchestratorReactCtx {
  const ctx = useContext(OrchestratorContext);
  if (!ctx) {
    throw new Error(
      "useOrchestrator must be used within an OrchestratorProvider.",
    );
  }
  return ctx;
}
