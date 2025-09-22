import React, { createContext, useContext } from "react";
import type { GraphRuntimeContextValue } from "./types";

/**
 * GraphContext
 * The provider exposes a concrete GraphRuntimeContextValue. The initial value
 * is null until initialized.
 */
export const GraphContext = createContext<GraphRuntimeContextValue | null>(
  null,
);

/**
 * useGraphContext
 * Hook to access the provider runtime from components/hooks.
 * Throws when used outside of a GraphProvider.
 */
export function useGraphContext(): GraphRuntimeContextValue {
  const ctx = useContext(GraphContext);
  if (ctx === null) {
    throw new Error("useGraphContext must be used within a <GraphProvider />");
  }
  return ctx;
}
