import {
  useCallback,
  useEffect,
  useMemo,
  type FC,
  type ComponentType,
} from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";
import {
  defaultVariadicCount,
  formatVariadicPortId,
} from "@vizij/studio-support";
import type {
  ParamSpec,
  PortSpec,
  VariadicSpec,
  NormalizedNodeSchema,
} from "../contexts/RegistryProvider";
import { getPortColor } from "../utils/portColors";
import { useEditorStore } from "../store/useEditorStore";
import { unwrapDefault } from "./MgNodeInspector";

const FLOAT_TYPES = new Set(["f32", "float", "f64", "double"]);
const INT_TYPES = new Set(["i32", "int", "integer"]);
const BOOL_TYPES = new Set(["bool", "boolean"]);

type PortsForType = {
  inputs: PortSpec[];
  outputs: PortSpec[];
  variadicInputs: VariadicSpec | null;
  variadicOutputs: VariadicSpec | null;
};

/** Generate PortSpec entries for the current variadic input count. */
function buildVariadicPorts(spec: VariadicSpec, count: number): PortSpec[] {
  const ports: PortSpec[] = [];
  for (let i = 0; i < count; i++) {
    ports.push({
      id: formatVariadicPortId(spec.id, i),
      name: `${spec.label || spec.id} ${i + 1}`,
      type: spec.type,
      direction: "input",
    });
  }
  return ports;
}

const nodeCache = new Map<string, ComponentType<any>>();

export function createNodeRenderer(
  typeId: string,
  schema: NormalizedNodeSchema,
  getPortsForType?: (typeId: string) => PortsForType,
): ComponentType<{ id: string; data: any; selected?: boolean }> {
  const cached = nodeCache.get(typeId);
  if (cached) return cached;

  const ports: PortsForType =
    typeof getPortsForType === "function"
      ? getPortsForType(typeId)
      : {
          inputs: schema.inputs ?? [],
          outputs: schema.outputs ?? [],
          variadicInputs: schema.variadicInputs ?? null,
          variadicOutputs: schema.variadicOutputs ?? null,
        };

  const GraphNode: FC<{ id: string; data: any; selected?: boolean }> = ({
    id,
    data,
    selected,
  }) => {
    const setNodes = useEditorStore((s) => s.setNodes);
    const edges = useEditorStore((s) => s.edges);
    const updateNodeInternals = useUpdateNodeInternals();

    // ── Variadic inputs ────────────────────────────────────────────
    const variadicSpec = ports.variadicInputs;
    const variadicCount: number = variadicSpec
      ? typeof data?.variadicInputCount === "number"
        ? data.variadicInputCount
        : defaultVariadicCount(variadicSpec)
      : 0;

    const variadicPorts = useMemo(
      () =>
        variadicSpec ? buildVariadicPorts(variadicSpec, variadicCount) : [],
      [variadicSpec, variadicCount],
    );

    // ── Variadic outputs ───────────────────────────────────────────
    const variadicOutputSpec = ports.variadicOutputs;
    const variadicOutputCount: number = variadicOutputSpec
      ? typeof data?.variadicOutputCount === "number"
        ? data.variadicOutputCount
        : defaultVariadicCount(variadicOutputSpec)
      : 0;

    const variadicOutputPorts = useMemo(
      () =>
        variadicOutputSpec
          ? buildVariadicPorts(variadicOutputSpec, variadicOutputCount)
          : [],
      [variadicOutputSpec, variadicOutputCount],
    );

    // Notify ReactFlow when the number of handles changes
    useEffect(() => {
      updateNodeInternals(id);
    }, [id, updateNodeInternals, variadicCount, variadicOutputCount]);

    // Set of input port IDs that have an incoming edge
    const connectedInputs = useMemo(() => {
      const set = new Set<string>();
      for (const e of edges) {
        if (e.target === id && e.targetHandle) set.add(e.targetHandle);
      }
      return set;
    }, [edges, id]);

    const updateParam = useCallback(
      (paramId: string, value: unknown) => {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === id
              ? {
                  ...n,
                  data: {
                    ...n.data,
                    params: { ...n.data.params, [paramId]: value },
                  },
                }
              : n,
          ),
        );
      },
      [id, setNodes],
    );

    const updateInputDefault = useCallback(
      (portId: string, value: unknown) => {
        setNodes((prev) => {
          let changed = false;
          const next = prev.map((n) => {
            if (n.id !== id) {
              return n;
            }
            const inputDefaults = n.data.inputDefaults ?? {};
            if (Object.is(inputDefaults[portId], value)) {
              return n;
            }
            changed = true;
            return {
              ...n,
              data: {
                ...n.data,
                inputDefaults: { ...inputDefaults, [portId]: value },
              },
            };
          });
          return changed ? next : prev;
        });
      },
      [id, setNodes],
    );

    const addVariadicInput = useCallback(() => {
      if (variadicSpec?.max != null && variadicCount >= variadicSpec.max)
        return;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const newData: typeof n.data = {
            ...n.data,
            variadicInputCount: variadicCount + 1,
          };
          if (variadicSpec?.keyed) {
            newData.params = {
              ...n.data.params,
              record_keys: [...(n.data.params?.record_keys ?? []), ""],
            };
          }
          return { ...n, data: newData };
        }),
      );
    }, [id, setNodes, variadicCount, variadicSpec]);

    const removeVariadicInput = useCallback(() => {
      const minCount = variadicSpec?.min ?? 0;
      if (variadicCount <= minCount) return;

      const removedPortId = formatVariadicPortId(
        variadicSpec!.id,
        variadicCount - 1,
      );

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const newData = { ...n.data, variadicInputCount: variadicCount - 1 };
          // Clean up inputDefaults for the removed port
          if (newData.inputDefaults?.[removedPortId] != null) {
            const { [removedPortId]: _, ...rest } = newData.inputDefaults;
            newData.inputDefaults = rest;
          }
          if (variadicSpec?.keyed) {
            newData.params = {
              ...newData.params,
              record_keys: (newData.params?.record_keys ?? []).slice(0, -1),
            };
          }
          return { ...n, data: newData };
        }),
      );
      // Remove edges connected to the removed port
      useEditorStore
        .getState()
        .setEdges((prev) =>
          prev.filter(
            (e) => !(e.target === id && e.targetHandle === removedPortId),
          ),
        );
    }, [id, setNodes, variadicCount, variadicSpec]);

    const addVariadicOutput = useCallback(() => {
      if (
        variadicOutputSpec?.max != null &&
        variadicOutputCount >= variadicOutputSpec.max
      )
        return;
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const newData: typeof n.data = {
            ...n.data,
            variadicOutputCount: variadicOutputCount + 1,
          };
          if (variadicOutputSpec?.keyed) {
            newData.params = {
              ...n.data.params,
              record_keys: [...(n.data.params?.record_keys ?? []), ""],
            };
          }
          return { ...n, data: newData };
        }),
      );
    }, [id, setNodes, variadicOutputCount, variadicOutputSpec]);

    const removeVariadicOutput = useCallback(() => {
      const minCount = variadicOutputSpec?.min ?? 0;
      if (variadicOutputCount <= minCount) return;

      const removedPortId = formatVariadicPortId(
        variadicOutputSpec!.id,
        variadicOutputCount - 1,
      );

      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const newData = {
            ...n.data,
            variadicOutputCount: variadicOutputCount - 1,
          };
          if (variadicOutputSpec?.keyed) {
            newData.params = {
              ...newData.params,
              record_keys: (newData.params?.record_keys ?? []).slice(0, -1),
            };
          }
          return { ...n, data: newData };
        }),
      );
      // Remove edges connected to the removed port
      useEditorStore
        .getState()
        .setEdges((prev) =>
          prev.filter(
            (e) => !(e.source === id && e.sourceHandle === removedPortId),
          ),
        );
    }, [id, setNodes, variadicOutputCount, variadicOutputSpec]);

    const label =
      data?.label ??
      schema.signature?.name ??
      schema.signature?.type_id ??
      typeId;
    const doc = schema.signature?.doc;

    return (
      <div
        data-testid="motiongraph-node"
        data-node-id={id}
        data-node-type={typeId}
        className={`relative rounded-lg border-2 bg-gradient-to-br from-neutral-800 to-neutral-900 text-neutral-100 w-56 shadow-lg transition-colors ${
          selected ? "border-blue-500 shadow-blue-500/25" : "border-neutral-600"
        }`}
      >
        {/* Title */}
        <div className="px-3 py-2 border-b border-neutral-700">
          <div className="text-sm font-semibold text-center">{label}</div>
          {doc && (
            <div className="text-xs text-neutral-400 text-center mt-1 line-clamp-2 leading-tight">
              {doc}
            </div>
          )}
        </div>

        {/* Ports */}
        <div className="flex justify-between px-1 py-2 min-h-8">
          {/* Inputs (left) */}
          <div className="flex flex-col gap-2">
            {ports.inputs.map((p) => {
              const c = getPortColor(p.type);
              const isConnected = connectedInputs.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-1.5 relative">
                  <Handle
                    id={p.id}
                    type="target"
                    position={Position.Left}
                    style={{
                      background: c.bg,
                      border: `2px solid ${c.border}`,
                      width: 10,
                      height: 10,
                    }}
                  />
                  <span className="text-xs text-neutral-300 pl-2">
                    {p.name}
                    <span className="ml-1 text-[10px] text-neutral-500">
                      {p.type}
                    </span>
                    {p.optional && (
                      <span className="ml-1 text-[10px] text-sky-400 bg-sky-400/20 px-1 rounded-full">
                        opt
                      </span>
                    )}
                  </span>
                  {!isConnected && (
                    <InlinePortDefault
                      nodeId={id}
                      portId={p.id}
                      portType={p.type}
                      value={data?.inputDefaults?.[p.id]}
                      onChange={(v) => updateInputDefault(p.id, v)}
                    />
                  )}
                </div>
              );
            })}
            {/* Variadic inputs */}
            {variadicPorts.map((p, i) => {
              const c = getPortColor(p.type);
              const isConnected = connectedInputs.has(p.id);
              return (
                <div key={p.id} className="flex items-center gap-1.5 relative">
                  <Handle
                    id={p.id}
                    type="target"
                    position={Position.Left}
                    style={{
                      background: c.bg,
                      border: `2px solid ${c.border}`,
                      width: 10,
                      height: 10,
                    }}
                  />
                  <span className="text-xs text-neutral-300 pl-2">
                    {p.name}
                    <span className="ml-1 text-[10px] text-neutral-500">
                      {p.type}
                    </span>
                  </span>
                  {variadicSpec?.keyed && (
                    <input
                      type="text"
                      className="nopan nodrag ml-1 w-16 text-[10px] bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                      placeholder="key"
                      value={(data?.params?.record_keys ?? [])[i] ?? ""}
                      onChange={(e) => {
                        const keys = [...(data?.params?.record_keys ?? [])];
                        keys[i] = e.target.value;
                        updateParam("record_keys", keys);
                      }}
                    />
                  )}
                  {!isConnected && !variadicSpec?.keyed && (
                    <InlinePortDefault
                      nodeId={id}
                      portId={p.id}
                      portType={p.type}
                      value={data?.inputDefaults?.[p.id]}
                      onChange={(v) => updateInputDefault(p.id, v)}
                    />
                  )}
                </div>
              );
            })}
            {variadicSpec && (
              <div className="flex items-center gap-1 pl-2 mt-0.5 nopan nodrag">
                <button
                  onClick={addVariadicInput}
                  disabled={
                    variadicSpec.max != null &&
                    variadicCount >= variadicSpec.max
                  }
                  className="w-5 h-5 rounded text-[11px] font-bold leading-none bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Add input"
                >
                  +
                </button>
                <button
                  onClick={removeVariadicInput}
                  disabled={variadicCount <= (variadicSpec.min ?? 0)}
                  className="w-5 h-5 rounded text-[11px] font-bold leading-none bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Remove input"
                >
                  −
                </button>
              </div>
            )}
          </div>

          {/* Outputs (right) */}
          <div className="flex flex-col gap-2 items-end">
            {ports.outputs.map((p) => {
              const c = getPortColor(p.type);
              return (
                <div key={p.id} className="flex items-center gap-1.5 relative">
                  <span className="text-xs text-neutral-400 pr-2">
                    {p.name}
                    <span className="ml-1 text-[10px] text-neutral-500">
                      {p.type}
                    </span>
                  </span>
                  <Handle
                    id={p.id}
                    type="source"
                    position={Position.Right}
                    style={{
                      background: c.bg,
                      border: `2px solid ${c.border}`,
                      width: 10,
                      height: 10,
                    }}
                  />
                </div>
              );
            })}
            {/* Variadic outputs */}
            {variadicOutputPorts.map((p, i) => {
              const c = getPortColor(p.type);
              return (
                <div key={p.id} className="flex items-center gap-1.5 relative">
                  {variadicOutputSpec?.keyed && (
                    <input
                      type="text"
                      className="nopan nodrag mr-1 w-16 text-[10px] bg-neutral-700 border border-neutral-600 rounded px-1 py-0.5 text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                      placeholder="key"
                      value={(data?.params?.record_keys ?? [])[i] ?? ""}
                      onChange={(e) => {
                        const keys = [...(data?.params?.record_keys ?? [])];
                        keys[i] = e.target.value;
                        updateParam("record_keys", keys);
                      }}
                    />
                  )}
                  <span className="text-xs text-neutral-400 pr-2">
                    {p.name}
                    <span className="ml-1 text-[10px] text-neutral-500">
                      {p.type}
                    </span>
                  </span>
                  <Handle
                    id={p.id}
                    type="source"
                    position={Position.Right}
                    style={{
                      background: c.bg,
                      border: `2px solid ${c.border}`,
                      width: 10,
                      height: 10,
                    }}
                  />
                </div>
              );
            })}
            {variadicOutputSpec && (
              <div className="flex items-center gap-1 pr-2 mt-0.5 nopan nodrag">
                <button
                  onClick={addVariadicOutput}
                  disabled={
                    variadicOutputSpec.max != null &&
                    variadicOutputCount >= variadicOutputSpec.max
                  }
                  className="w-5 h-5 rounded text-[11px] font-bold leading-none bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Add output"
                >
                  +
                </button>
                <button
                  onClick={removeVariadicOutput}
                  disabled={
                    variadicOutputCount <= (variadicOutputSpec.min ?? 0)
                  }
                  className="w-5 h-5 rounded text-[11px] font-bold leading-none bg-neutral-700 hover:bg-neutral-600 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Remove output"
                >
                  −
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline parameter editors */}
        {schema.params.length > 0 && (
          <div className="px-2 py-1.5 border-t border-neutral-700 space-y-1">
            {schema.params.map((p) => (
              <InlineParam
                nodeId={id}
                key={p.id}
                param={p}
                value={data?.params?.[p.id]}
                onChange={(v) => updateParam(p.id, v)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  nodeCache.set(typeId, GraphNode);
  return GraphNode;
}

// ─── Compact inline parameter editor ─────────────────────────────────

function InlineParam({
  nodeId,
  param,
  value,
  onChange,
}: {
  nodeId: string;
  param: ParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = param.type.toLowerCase();
  const resolved = value ?? unwrapDefault(param.default_json);

  if (BOOL_TYPES.has(type)) {
    const checked = resolved === true || resolved === "true";
    return (
      <div className="flex items-center justify-between gap-2 nopan nodrag">
        <span className="text-[10px] text-neutral-500 truncate">
          {param.name}
        </span>
        <button
          data-testid="motiongraph-param-input"
          data-node-id={nodeId}
          data-param-id={param.id}
          onClick={() => onChange(!checked)}
          className={`w-6 h-3 rounded-full transition-colors relative flex-shrink-0 ${
            checked ? "bg-blue-600" : "bg-neutral-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-transform ${
              checked ? "left-3.5" : "left-0.5"
            }`}
          />
        </button>
      </div>
    );
  }

  if (FLOAT_TYPES.has(type) || INT_TYPES.has(type)) {
    const num = typeof resolved === "number" ? resolved : 0;
    const step = INT_TYPES.has(type) ? 1 : "any";
    const parse = INT_TYPES.has(type)
      ? (s: string) => parseInt(s, 10) || 0
      : (s: string) => parseFloat(s) || 0;
    return (
      <div className="flex items-center justify-between gap-2 nopan nodrag">
        <span className="text-[10px] text-neutral-500 truncate">
          {param.name}
        </span>
        <input
          data-testid="motiongraph-param-input"
          data-node-id={nodeId}
          data-param-id={param.id}
          type="number"
          value={num}
          step={step}
          min={param.min}
          max={param.max}
          onChange={(e) => onChange(parse(e.target.value))}
          className="w-16 px-1 py-0 text-[10px] font-mono text-amber-400/80 bg-neutral-800 border border-neutral-700 rounded text-right focus:border-blue-500 focus:outline-none nowheel"
        />
      </div>
    );
  }

  // Fallback: string/any
  const str = resolved != null ? String(resolved) : "";
  return (
    <div className="flex items-center justify-between gap-2 nopan nodrag">
      <span className="text-[10px] text-neutral-500 truncate">
        {param.name}
      </span>
      <input
        data-testid="motiongraph-param-input"
        data-node-id={nodeId}
        data-param-id={param.id}
        type="text"
        value={str}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-1 py-0 text-[10px] font-mono text-amber-400/80 bg-neutral-800 border border-neutral-700 rounded text-right focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

// ─── Inline default value for unconnected input ports ────────────────

function InlinePortDefault({
  nodeId,
  portId,
  portType,
  value,
  onChange,
}: {
  nodeId: string;
  portId: string;
  portType: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = portType.toLowerCase();

  if (BOOL_TYPES.has(type)) {
    const checked = value === true || value === "true";
    return (
      <button
        data-testid="motiongraph-port-default-input"
        data-node-id={nodeId}
        data-port-id={portId}
        onClick={() => onChange(!checked)}
        className={`nopan nodrag ml-1 w-6 h-3 rounded-full transition-colors relative flex-shrink-0 ${
          checked ? "bg-blue-600" : "bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-transform ${
            checked ? "left-3.5" : "left-0.5"
          }`}
        />
      </button>
    );
  }

  if (FLOAT_TYPES.has(type) || INT_TYPES.has(type)) {
    const num = typeof value === "number" ? value : 0;
    const step = INT_TYPES.has(type) ? 1 : "any";
    const parse = INT_TYPES.has(type)
      ? (s: string) => parseInt(s, 10) || 0
      : (s: string) => parseFloat(s) || 0;
    return (
      <input
        data-testid="motiongraph-port-default-input"
        data-node-id={nodeId}
        data-port-id={portId}
        type="number"
        value={num}
        step={step}
        onChange={(e) => onChange(parse(e.target.value))}
        className="nopan nodrag nowheel ml-1 w-14 px-1 py-0 text-[10px] font-mono text-amber-400/80 bg-neutral-800 border border-neutral-700 rounded text-right focus:border-blue-500 focus:outline-none"
      />
    );
  }

  // Fallback: string/any
  const str = value != null ? String(value) : "";
  return (
    <input
      data-testid="motiongraph-port-default-input"
      data-node-id={nodeId}
      data-port-id={portId}
      type="text"
      value={str}
      onChange={(e) => onChange(e.target.value)}
      className="nopan nodrag ml-1 w-14 px-1 py-0 text-[10px] font-mono text-amber-400/80 bg-neutral-800 border border-neutral-700 rounded text-right focus:border-blue-500 focus:outline-none"
    />
  );
}
