import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FC, PropsWithChildren } from "react";
import { init as initGraphWasm, getNodeSchemas } from "@vizij/node-graph-react";
import type { Registry as WasmRegistry } from "@vizij/node-graph";
import { useEditorStore } from "../store/useEditorStore";

export type Registry = WasmRegistry;

type WasmPortSpec = {
  id?: string;
  name?: string;
  label?: string;
  ty?: string;
  type?: string;
  doc?: string;
  optional?: boolean;
  direction?: string;
  dir?: string;
  data_type?: string;
};

type WasmVariadicSpec = {
  id?: string;
  label?: string;
  ty?: string;
  type?: string;
  doc?: string;
  min?: number;
  max?: number | null;
};

type WasmParamSpec = {
  id?: string;
  label?: string;
  ty?: string;
  type?: string;
  doc?: string;
  default_json?: unknown;
  default?: unknown;
  min?: number;
  max?: number;
  editor_hints?: Record<string, unknown>;
  editorHints?: Record<string, unknown>;
  hints?: Record<string, unknown>;
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
  doc?: string;
  schema?: WasmPortSpec;
};

export type VariadicSpec = {
  id: string;
  type: string;
  label?: string;
  min?: number;
  max?: number | null;
  doc?: string;
  schema?: WasmVariadicSpec;
};

export type ParamSpec = {
  id: string;
  name: string;
  type: string;
  doc?: string;
  default_json?: any;
  min?: number;
  max?: number;
  editorHints?: Record<string, any>;
  schema?: WasmParamSpec;
};

export type NormalizedNodeSchema = {
  signature: NodeSignature;
  inputs: PortSpec[];
  outputs: PortSpec[];
  params: ParamSpec[];
  variadicInputs: VariadicSpec | null;
  variadicOutputs: VariadicSpec | null;
};

type RegistryState = {
  registry: Registry | null;
  loading: boolean;
  error: string | null;
  nodesByType: Map<string, NormalizedNodeSchema>;
  normalizeNodeSchema: (
    schema: NodeSignature | string | null | undefined,
  ) => NormalizedNodeSchema | null;
  getPortsForType: (typeId: string) => {
    inputs: PortSpec[];
    outputs: PortSpec[];
    variadicInputs: VariadicSpec | null;
    variadicOutputs: VariadicSpec | null;
  };
  getParamsForType: (typeId: string) => ParamSpec[];
  getNodeSummary: (typeId: string) => {
    name: string;
    doc: string;
    category: string;
  } | null;
};

const RegistryContext = createContext<RegistryState>({
  registry: null,
  loading: true,
  error: null,
  nodesByType: new Map(),
  normalizeNodeSchema: () => null,
  getPortsForType: () => ({
    inputs: [],
    outputs: [],
    variadicInputs: null,
    variadicOutputs: null,
  }),
  getParamsForType: () => [],
  getNodeSummary: () => null,
});

const UNKNOWN_CATEGORY = "Uncategorized";

function normalizeTypeId(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function buildPortSpec(
  port: WasmPortSpec,
  direction: "input" | "output",
): PortSpec {
  const id = port.id != null ? String(port.id) : String(port.label ?? "");
  const label = port.label ?? (typeof port.id === "string" ? port.id : "");
  const type =
    typeof port.ty === "string"
      ? port.ty
      : normalizeTypeId((port as Record<string, unknown>).type) || "any";

  return {
    id,
    name: label || id,
    label: label || undefined,
    type,
    direction,
    optional: !!port.optional,
    doc: port.doc ?? "",
    schema: port,
  };
}

function buildVariadicSpec(
  spec?: WasmVariadicSpec | null,
): VariadicSpec | null {
  if (!spec) return null;
  const type =
    typeof spec.ty === "string"
      ? spec.ty
      : normalizeTypeId((spec as Record<string, unknown>).type) || "any";

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
    schema: spec,
  };
}

function buildParamSpec(param: WasmParamSpec): ParamSpec {
  const type =
    typeof param.ty === "string"
      ? param.ty
      : normalizeTypeId((param as Record<string, unknown>).type) || "any";
  const editorHints =
    (param as Record<string, unknown>).editor_hints ??
    (param as Record<string, unknown>).hints ??
    (param as Record<string, unknown>).editorHints;

  return {
    id: String(param.id ?? ""),
    name: String(param.label ?? param.id ?? ""),
    type,
    doc: param.doc ?? "",
    default_json: param.default_json,
    min: typeof param.min === "number" ? param.min : undefined,
    max: typeof param.max === "number" ? param.max : undefined,
    editorHints:
      editorHints && typeof editorHints === "object"
        ? (editorHints as Record<string, any>)
        : undefined,
    schema: param,
  };
}

function normalizeSignature(signature: NodeSignature): NormalizedNodeSchema {
  const inputs = Array.isArray(signature.inputs)
    ? signature.inputs.map((port) => buildPortSpec(port, "input"))
    : [];
  const outputs = Array.isArray(signature.outputs)
    ? signature.outputs.map((port) => buildPortSpec(port, "output"))
    : [];
  const params = Array.isArray(signature.params)
    ? signature.params.map(buildParamSpec)
    : [];
  const variadicInputs = buildVariadicSpec(signature.variadic_inputs);
  const variadicOutputs = buildVariadicSpec(signature.variadic_outputs);

  return {
    signature,
    inputs,
    outputs,
    params,
    variadicInputs,
    variadicOutputs,
  };
}

export const RegistryProvider: FC<PropsWithChildren> = ({ children }) => {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setVariadicPortGroups = useEditorStore((s) => s.setVariadicPortGroups);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await initGraphWasm?.();

        if (cancelled) return;

        if (typeof getNodeSchemas !== "function") {
          setRegistry(null);
          setError(
            "@vizij/node-graph-react is missing getNodeSchemas; update the dependency to a schema-aware version.",
          );
          setLoading(false);
          return;
        }

        const fetched = await getNodeSchemas();
        if (cancelled) return;

        setRegistry(fetched as Registry);
        setError(null);
      } catch (err: any) {
        if (cancelled) return;
        setRegistry(null);
        setError(err?.message ?? String(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const nodesByType = useMemo(() => {
    const map = new Map<string, NormalizedNodeSchema>();
    if (!registry?.nodes) return map;
    for (const signature of registry.nodes as NodeSignature[]) {
      const key =
        normalizeTypeId((signature as Record<string, unknown>).type_id) ||
        normalizeTypeId((signature as Record<string, unknown>).id);
      if (!key) continue;
      map.set(key, normalizeSignature(signature));
    }
    return map;
  }, [registry]);

  useEffect(() => {
    const groups: Record<string, string | null> = {};
    nodesByType.forEach((entry, typeId) => {
      const canonical =
        entry.variadicInputs && entry.variadicInputs.id
          ? String(entry.variadicInputs.id)
          : null;
      groups[typeId] = canonical;
    });
    setVariadicPortGroups(groups);
  }, [nodesByType, setVariadicPortGroups]);

  const getNormalized = useCallback(
    (typeId: string) => {
      if (!typeId) return null;
      const normalized = nodesByType.get(normalizeTypeId(typeId));
      return normalized ?? null;
    },
    [nodesByType],
  );

  const normalizeNodeSchema = useCallback(
    (schema: NodeSignature | string | null | undefined) => {
      if (!schema) return null;
      if (typeof schema === "string") {
        return getNormalized(schema);
      }
      return normalizeSignature(schema);
    },
    [getNormalized],
  );

  const getPortsForType = useCallback(
    (typeId: string) => {
      const entry = getNormalized(typeId);
      if (!entry) {
        return {
          inputs: [] as PortSpec[],
          outputs: [] as PortSpec[],
          variadicInputs: null,
          variadicOutputs: null,
        };
      }
      return {
        inputs: entry.inputs,
        outputs: entry.outputs,
        variadicInputs: entry.variadicInputs,
        variadicOutputs: entry.variadicOutputs,
      };
    },
    [getNormalized],
  );

  const getParamsForType = useCallback(
    (typeId: string) => {
      const entry = getNormalized(typeId);
      return entry ? entry.params : [];
    },
    [getNormalized],
  );

  const getNodeSummary = useCallback(
    (typeId: string) => {
      const entry = getNormalized(typeId);
      if (!entry) return null;
      const { signature } = entry;
      return {
        name: signature.name ?? String(signature.type_id ?? typeId),
        doc: signature.doc ?? "",
        category: signature.category ?? UNKNOWN_CATEGORY,
      };
    },
    [getNormalized],
  );

  const value = useMemo<RegistryState>(
    () => ({
      registry,
      loading,
      error,
      nodesByType,
      normalizeNodeSchema,
      getPortsForType,
      getParamsForType,
      getNodeSummary,
    }),
    [
      registry,
      loading,
      error,
      nodesByType,
      normalizeNodeSchema,
      getPortsForType,
      getParamsForType,
      getNodeSummary,
    ],
  );

  return (
    <RegistryContext.Provider value={value}>
      {children}
    </RegistryContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- TODO: Refactor
export function useRegistry() {
  return useContext(RegistryContext);
}
