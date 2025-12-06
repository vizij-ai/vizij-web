import { createContext } from "react";
import type { VizijStore } from "./store";

// This creates a context where the single app store is stored.
export const VizijContext = createContext<VizijStore | null>(null);
