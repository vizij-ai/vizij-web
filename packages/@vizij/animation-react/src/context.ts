import { createContext } from "react";
import type { AnimationContextValue } from "./types";

export const AnimationContext = createContext<AnimationContextValue | null>(
  null,
);
