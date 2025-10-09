import { createContext } from "react";
import type { OrchestratorReactCtx } from "./types";

export const OrchestratorContext = createContext<OrchestratorReactCtx | null>(
  null,
);
