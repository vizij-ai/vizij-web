import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import { init as initGraphWasm, getNodeSchemas } from "@vizij/node-graph-react";

export type Registry = any;

/**
 * Port / Param helpers used by the editor:
 * - PortSpec: describes a node input or output port (id, name, type, label, direction)
 * - ParamSpec: describes editable node params (id/name/type/default/editor hints)
 */
export type PortSpec = {
  id: string;
  name: string;
  type: string;
  label?: string;
  direction: "input" | "output";
  optional?: boolean;
};

export type VariadicSpec = {
  id: string;
  type: string;
  label?: string;
  min?: number;
  max?: number | null;
  doc?: string;
};

export type ParamSpec = {
  id: string;
  name: string;
  type: string;
  default_json?: any;
  editorHints?: Record<string, any>;
};

type RegistryState = {
  registry: Registry | null;
  loading: boolean;
  error: string | null;

  // helpers
  normalizeNodeSchema: (schema: any) => {
    inputs: PortSpec[];
    outputs: PortSpec[];
    params: ParamSpec[];
    variadicInputs?: VariadicSpec | null;
    variadicOutputs?: VariadicSpec | null;
  };
  getPortsForType: (typeId: string) => {
    inputs: PortSpec[];
    outputs: PortSpec[];
    variadicInputs?: VariadicSpec | null;
    variadicOutputs?: VariadicSpec | null;
  };
  getParamsForType: (typeId: string) => ParamSpec[];
};

const RegistryContext = createContext<RegistryState>({
  registry: null,
  loading: true,
  error: null,
  normalizeNodeSchema: () => ({ inputs: [], outputs: [], params: [] }),
  getPortsForType: () => ({ inputs: [], outputs: [] }),
  getParamsForType: () => [],
});

function normalizeNodeSchemaImpl(schema: any) {
  // Many registry schemas differ in shape. We implement a best-effort normalizer:
  // - inputs/outputs: look for fields `inputs` / `outputs` or `ports`
  // - params: look for `params` array with id/name/type/default_json
  const inputs: PortSpec[] = [];
  const outputs: PortSpec[] = [];
  const params: ParamSpec[] = [];

  if (!schema || typeof schema !== "object") {
    return {
      inputs,
      outputs,
      params,
      variadicInputs: null,
      variadicOutputs: null,
    };
  }

  // Normalize params
  if (Array.isArray(schema.params)) {
    for (const p of schema.params) {
      params.push({
        id: String(p.id ?? p.name ?? ""),
        name: String(p.name ?? p.id ?? p.id ?? ""),
        type: String(p.ty ?? p.type ?? p.param_type ?? p.kind ?? "any"),
        default_json: p.default_json ?? p.default ?? undefined,
        editorHints: p.editor_hints ?? p.hints ?? undefined,
      });
    }
  }

  // Ports may be listed under `inputs` / `outputs` or `ports` with direction
  if (Array.isArray(schema.inputs)) {
    for (const pi of schema.inputs) {
      inputs.push({
        id: String(pi.id ?? pi.name ?? ""),
        name: String(pi.name ?? pi.id ?? ""),
        type: String(pi.ty ?? pi.type ?? pi.data_type ?? "any"),
        label: pi.label ?? pi.name ?? pi.id,
        direction: "input",
        optional: !!pi.optional,
      });
    }
  }
  if (Array.isArray(schema.outputs)) {
    for (const po of schema.outputs) {
      outputs.push({
        id: String(po.id ?? po.name ?? ""),
        name: String(po.name ?? po.id ?? ""),
        type: String(po.ty ?? po.type ?? po.data_type ?? "any"),
        label: po.label ?? po.name ?? po.id,
        direction: "output",
      });
    }
  }

  if (Array.isArray(schema.ports)) {
    for (const p of schema.ports) {
      const dir = (p.direction ?? p.dir ?? "").toString().toLowerCase();
      const spec: PortSpec = {
        id: String(p.id ?? p.name ?? ""),
        name: String(p.name ?? p.id ?? ""),
        type: String(p.ty ?? p.type ?? p.data_type ?? "any"),
        label: p.label ?? p.name ?? p.id,
        direction: dir === "output" ? "output" : "input",
        optional: !!p.optional,
      };
      if (spec.direction === "output") outputs.push(spec);
      else inputs.push(spec);
    }
  }

  // Fallback: if nothing found, attempt to derive from schema.io or schema.signature
  if (
    inputs.length === 0 &&
    outputs.length === 0 &&
    schema.io &&
    typeof schema.io === "object"
  ) {
    const io = schema.io;
    if (Array.isArray(io.inputs)) {
      for (const pi of io.inputs) {
        inputs.push({
          id: String(pi.id ?? pi.name ?? ""),
          name: String(pi.name ?? pi.id ?? ""),
          type: String(pi.ty ?? pi.type ?? "any"),
          label: pi.label ?? pi.name ?? pi.id,
          direction: "input",
          optional: !!pi.optional,
        });
      }
    }
    if (Array.isArray(io.outputs)) {
      for (const po of io.outputs) {
        outputs.push({
          id: String(po.id ?? po.name ?? ""),
          name: String(po.name ?? po.id ?? ""),
          type: String(po.ty ?? po.type ?? "any"),
          label: po.label ?? po.name ?? po.id,
          direction: "output",
        });
      }
    }
  }

  // ensure we include variadic specs if present on the schema
  const variadicInputs =
    (schema.variadic_inputs ?? schema.variadicInputs ?? null)
      ? {
          id: String(
            (schema.variadic_inputs ?? schema.variadicInputs).id ?? "",
          ),
          type: String(
            (schema.variadic_inputs ?? schema.variadicInputs).ty ??
              (schema.variadic_inputs ?? schema.variadicInputs).type ??
              "any",
          ),
          label: String(
            (schema.variadic_inputs ?? schema.variadicInputs).label ?? "",
          ),
          min:
            (schema.variadic_inputs ?? schema.variadicInputs).min ?? undefined,
          max: (schema.variadic_inputs ?? schema.variadicInputs).max ?? null,
          doc: (schema.variadic_inputs ?? schema.variadicInputs).doc ?? "",
        }
      : null;

  const variadicOutputs =
    (schema.variadic_outputs ?? schema.variadicOutputs ?? null)
      ? {
          id: String(
            (schema.variadic_outputs ?? schema.variadicOutputs).id ?? "",
          ),
          type: String(
            (schema.variadic_outputs ?? schema.variadicOutputs).ty ??
              (schema.variadic_outputs ?? schema.variadicOutputs).type ??
              "any",
          ),
          label: String(
            (schema.variadic_outputs ?? schema.variadicOutputs).label ?? "",
          ),
          min:
            (schema.variadic_outputs ?? schema.variadicOutputs).min ??
            undefined,
          max: (schema.variadic_outputs ?? schema.variadicOutputs).max ?? null,
          doc: (schema.variadic_outputs ?? schema.variadicOutputs).doc ?? "",
        }
      : null;

  return { inputs, outputs, params, variadicInputs, variadicOutputs };
}

export const RegistryProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, setState] = useState<RegistryState>({
    registry: null,
    loading: true,
    error: null,
    normalizeNodeSchema: () => ({ inputs: [], outputs: [], params: [] }),
    getPortsForType: () => ({ inputs: [], outputs: [] }),
    getParamsForType: () => [],
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        // Ensure the wasm module is initialised before requesting schemas
        await initGraphWasm?.();

        if (!mounted) return;

        if (typeof getNodeSchemas === "function") {
          const r = await getNodeSchemas();
          if (!mounted) return;
          setState((prev) => ({
            ...prev,
            registry: r,
            loading: false,
            error: null,
          }));
          return;
        }

        setState((prev) => ({
          ...prev,
          registry: null,
          loading: false,
          error:
            "@vizij/node-graph-react does not expose getNodeSchemas; ensure the package version includes schema exports.",
        }));
      } catch (err: any) {
        if (!mounted) return;
        setState((prev) => ({
          ...prev,
          registry: null,
          loading: false,
          error: err?.message ?? String(err),
        }));
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // memoized helpers that operate on the registry
  const normalizeNodeSchema = useMemo(() => normalizeNodeSchemaImpl, []);
  const getPortsForType = useMemo(
    () => (typeId: string) => {
      const reg = state.registry;
      if (!reg)
        return {
          inputs: [],
          outputs: [],
          variadicInputs: null,
          variadicOutputs: null,
        };
      // registry.nodes is expected to be an array of node schema entries
      const found = Array.isArray(reg.nodes)
        ? reg.nodes.find(
            (n: any) =>
              (n.type_id ?? n.id ?? "").toString().toLowerCase() ===
              typeId.toLowerCase(),
          )
        : null;
      if (!found)
        return {
          inputs: [],
          outputs: [],
          variadicInputs: null,
          variadicOutputs: null,
        };
      const normalized = normalizeNodeSchemaImpl(found);
      return {
        inputs: normalized.inputs,
        outputs: normalized.outputs,
        variadicInputs: (normalized as any).variadicInputs ?? null,
        variadicOutputs: (normalized as any).variadicOutputs ?? null,
      };
    },
    [state.registry],
  );

  const getParamsForType = useMemo(
    () => (typeId: string) => {
      const reg = state.registry;
      if (!reg) return [];
      const found = Array.isArray(reg.nodes)
        ? reg.nodes.find(
            (n: any) =>
              (n.type_id ?? n.id ?? "").toString().toLowerCase() ===
              typeId.toLowerCase(),
          )
        : null;
      if (!found) return [];
      const normalized = normalizeNodeSchemaImpl(found);
      return normalized.params;
    },
    [state.registry],
  );

  return (
    <RegistryContext.Provider
      value={{
        ...state,
        normalizeNodeSchema,
        getPortsForType,
        getParamsForType,
      }}
    >
      {children}
    </RegistryContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- TODO: Refactor
export function useRegistry() {
  return useContext(RegistryContext);
}
