import { createContext } from "react";
import type { VizijRuntimeContextValue } from "./types";

export const VizijRuntimeContext =
  createContext<VizijRuntimeContextValue | null>(null);
