import React, { createContext, useContext, useEffect, useState } from "react";
import type { Registry } from "@vizij/node-graph-wasm";
import { loadRegistry } from "../schema/registry";

type RegistryState = {
  registry: Registry | null;
  loading: boolean;
  error: string | null;
};

const RegistryContext = createContext<RegistryState>({
  registry: null,
  loading: true,
  error: null,
});

export const RegistryProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<RegistryState>({
    registry: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const reg = await loadRegistry();
        if (cancelled) return;
        setState({ registry: reg, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        setState({
          registry: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <RegistryContext.Provider value={state}>
      {children}
    </RegistryContext.Provider>
  );
};

export const useRegistry = () => useContext(RegistryContext);
