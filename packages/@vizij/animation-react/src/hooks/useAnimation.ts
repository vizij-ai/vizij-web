import { useContext } from "react";
import { AnimationContext } from "../context";
import type { AnimationContextValue } from "../types";

export function useAnimation(): AnimationContextValue {
  const ctx = useContext(AnimationContext);
  if (!ctx) {
    throw new Error("useAnimation must be used within AnimationProvider");
  }
  return ctx;
}
