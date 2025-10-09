import { useEffect, useState } from "react";
import { init as initNodeGraph, getNodeSchemas } from "@vizij/node-graph-react";

export interface NodeRegistryEntry {
  type_id: string;
  name: string;
  category: string;
  inputs?: Array<any>;
  outputs?: Array<any>;
  params?: Array<any>;
  variadic_inputs?: any;
  variadic_outputs?: any;
}

export interface NodeRegistryState {
  registry: NodeRegistryEntry[];
  loading: boolean;
  error: string | null;
}

export function useNodeRegistry(): NodeRegistryState {
  const [state, setState] = useState<NodeRegistryState>({
    registry: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initNodeGraph?.();
        if (cancelled) return;
        if (typeof getNodeSchemas === "function") {
          const schemas = await getNodeSchemas();
          if (cancelled) return;
          const nodes: NodeRegistryEntry[] = Array.isArray(schemas?.nodes)
            ? (schemas.nodes as NodeRegistryEntry[])
            : Array.isArray(schemas)
              ? (schemas as NodeRegistryEntry[])
              : [];
          setState({ registry: nodes, loading: false, error: null });
          return;
        }
        setState({
          registry: [],
          loading: false,
          error:
            "@vizij/node-graph-react does not expose getNodeSchemas; update the package or provide registry manually.",
        });
      } catch (err: any) {
        if (cancelled) return;
        setState({
          registry: [],
          loading: false,
          error: err?.message ?? String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
