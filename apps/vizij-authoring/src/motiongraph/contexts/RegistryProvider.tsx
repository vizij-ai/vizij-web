import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FC, PropsWithChildren } from "react";
import { init as initGraphWasm, getNodeSchemas } from "@vizij/node-graph-react";

// ─── Raw WASM types ─────────────────────────────────────────────────

type WasmPortSpec = {
  id?: string;
  name?: string;
  label?: string;
  ty?: string;
  type?: string;
  data_type?: string;
  doc?: string;
  optional?: boolean;
};

type WasmVariadicSpec = {
  id?: string;
  label?: string;
  ty?: string;
  type?: string;
  data_type?: string;
  doc?: string;
  min?: number;
  max?: number | null;
};

type WasmParamSpec = {
  id?: string;
  label?: string;
  ty?: string;
  type?: string;
  data_type?: string;
  doc?: string;
  default_json?: unknown;
  min?: number;
  max?: number;
  editor_hints?: Record<string, unknown>;
};

type NodeSignature = {
  type_id?: string;
  id?: string;
  name?: string;
  category?: string;
  doc?: string;
  inputs?: WasmPortSpec[];
  outputs?: WasmPortSpec[];
  variadic_inputs?: WasmVariadicSpec | null;
  variadic_outputs?: WasmVariadicSpec | null;
  params?: WasmParamSpec[];
};

// ─── Normalized types ───────────────────────────────────────────────

export type PortSpec = {
  id: string;
  name: string;
  type: string;
  direction: "input" | "output";
  optional?: boolean;
  doc?: string;
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
  doc?: string;
  default_json?: unknown;
  min?: number;
  max?: number;
};

export type NormalizedNodeSchema = {
  signature: NodeSignature;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
  variadicInputs: VariadicSpec | null;
  variadicOutputs: VariadicSpec | null;
};

export type NodeSummary = {
  name: string;
  doc: string;
  category: string;
};

// ─── Context ────────────────────────────────────────────────────────

type PortsForType = {
  inputs: PortSpec[];
  outputs: PortSpec[];
  variadicInputs: VariadicSpec | null;
  variadicOutputs: VariadicSpec | null;
};

type RegistryState = {
  loading: boolean;
  error: string | null;
  nodesByType: Map<string, NormalizedNodeSchema>;
  getNodeSummary: (typeId: string) => NodeSummary | null;
  getPortsForType: (typeId: string) => PortsForType;
};

const emptyPorts: PortsForType = {
  inputs: [],
  outputs: [],
  variadicInputs: null,
  variadicOutputs: null,
};

const RegistryContext = createContext<RegistryState>({
  loading: true,
  error: null,
  nodesByType: new Map(),
  getNodeSummary: () => null,
  getPortsForType: () => emptyPorts,
});

// ─── Helpers ────────────────────────────────────────────────────────

function normalizeTypeId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function resolveType(spec: {
  ty?: string;
  type?: string;
  data_type?: string;
}): string {
  if (typeof spec.ty === "string" && spec.ty)
    return normalizeTypeId(spec.ty) || "any";
  if (typeof spec.type === "string" && spec.type)
    return normalizeTypeId(spec.type) || "any";
  if (typeof spec.data_type === "string" && spec.data_type)
    return normalizeTypeId(spec.data_type) || "any";
  return "any";
}

function buildPortSpec(
  port: WasmPortSpec,
  direction: "input" | "output",
): PortSpec {
  const id = port.id != null ? String(port.id) : String(port.label ?? "");
  const label = port.label ?? (typeof port.id === "string" ? port.id : "");
  const type = resolveType(port);
  return {
    id,
    name: label || id,
    type,
    direction,
    optional: !!port.optional,
    doc: port.doc ?? "",
  };
}

function buildVariadicSpec(
  spec?: WasmVariadicSpec | null,
): VariadicSpec | null {
  if (!spec) return null;
  const type = resolveType(spec);
  return {
    id: String(spec.id ?? ""),
    type,
    label: spec.label ?? spec.id ?? "",
    min: typeof spec.min === "number" ? spec.min : undefined,
    max:
      spec.max === undefined || spec.max === null
        ? null
        : Number.isFinite(spec.max)
          ? spec.max
          : null,
    doc: spec.doc ?? "",
  };
}

function buildParamSpec(param: WasmParamSpec): ParamSpec {
  const type = resolveType(param);
  return {
    id: String(param.id ?? ""),
    name: String(param.label ?? param.id ?? ""),
    type,
    doc: param.doc ?? "",
    default_json: param.default_json,
    min: typeof param.min === "number" ? param.min : undefined,
    max: typeof param.max === "number" ? param.max : undefined,
  };
}

function normalizeSignature(signature: NodeSignature): NormalizedNodeSchema {
  return {
    signature,
    inputs: Array.isArray(signature.inputs)
      ? signature.inputs.map((p) => buildPortSpec(p, "input"))
      : [],
    outputs: Array.isArray(signature.outputs)
      ? signature.outputs.map((p) => buildPortSpec(p, "output"))
      : [],
    params: Array.isArray(signature.params)
      ? signature.params.map(buildParamSpec)
      : [],
    variadicInputs: buildVariadicSpec(signature.variadic_inputs),
    variadicOutputs: buildVariadicSpec(signature.variadic_outputs),
  };
}

// ─── Provider ───────────────────────────────────────────────────────

export const RegistryProvider: FC<PropsWithChildren> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<{ nodes: NodeSignature[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initGraphWasm?.();
        if (cancelled) return;
        if (typeof getNodeSchemas !== "function") {
          setError("getNodeSchemas not available");
          setLoading(false);
          return;
        }
        const fetched = await getNodeSchemas();
        if (!cancelled) setRaw(fetched as { nodes: NodeSignature[] });
      } catch (err: unknown) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nodesByType = useMemo(() => {
    const map = new Map<string, NormalizedNodeSchema>();
    if (!raw?.nodes) return map;
    for (const sig of raw.nodes) {
      const key =
        normalizeTypeId((sig as Record<string, unknown>).type_id) ||
        normalizeTypeId((sig as Record<string, unknown>).id);
      if (key) map.set(key, normalizeSignature(sig));
    }
    return map;
  }, [raw]);

  const getNodeSummary = useCallback(
    (typeId: string): NodeSummary | null => {
      const entry = nodesByType.get(normalizeTypeId(typeId));
      if (!entry) return null;
      const { signature } = entry;
      return {
        name: signature.name ?? String(signature.type_id ?? typeId),
        doc: signature.doc ?? "",
        category: signature.category ?? "Uncategorized",
      };
    },
    [nodesByType],
  );

  const getPortsForType = useCallback(
    (typeId: string): PortsForType => {
      const entry = nodesByType.get(normalizeTypeId(typeId));
      if (!entry) return emptyPorts;
      return {
        inputs: entry.inputs,
        outputs: entry.outputs,
        variadicInputs: entry.variadicInputs,
        variadicOutputs: entry.variadicOutputs,
      };
    },
    [nodesByType],
  );

  const value = useMemo<RegistryState>(
    () => ({ loading, error, nodesByType, getNodeSummary, getPortsForType }),
    [loading, error, nodesByType, getNodeSummary, getPortsForType],
  );

  return (
    <RegistryContext.Provider value={value}>
      {children}
    </RegistryContext.Provider>
  );
};

export function useRegistry() {
  return useContext(RegistryContext);
}
