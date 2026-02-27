import { useCallback, useMemo } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { useRegistry, type ParamSpec } from "../contexts/RegistryProvider";
import { getPortColor } from "../utils/portColors";
import {
  OUTPUT_TARGET_TYPE,
  OUTPUT_TARGET_PORT_TYPE,
} from "./OutputTargetNode";
import { INPUT_SOURCE_TYPE } from "./InputSourceNode";
import InputSourceInspector from "./InputSourceInspector";
import { OutputValueChart } from "./OutputValueChart";

export default function MgNodeInspector() {
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const setNodes = useEditorStore((s) => s.setNodes);
  const plotActive = useEditorStore((s) => s.plotActive);
  const togglePlot = useEditorStore((s) => s.togglePlot);
  const { nodesByType, getPortsForType } = useRegistry();

  const updateParam = useCallback(
    (paramId: string, value: unknown) => {
      if (!selectedNodeId) return;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === selectedNodeId
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
    [selectedNodeId, setNodes],
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null),
    [selectedNodeId, nodes],
  );

  const schema = useMemo(() => {
    if (!selectedNode?.type) return null;
    return nodesByType.get(String(selectedNode.type).toLowerCase()) ?? null;
  }, [selectedNode?.type, nodesByType]);

  const ports = useMemo(() => {
    if (!selectedNode?.type) return null;
    return getPortsForType(selectedNode.type);
  }, [selectedNode?.type, getPortsForType]);

  if (!selectedNode) {
    return (
      <div className="p-4">
        <p className="text-sm text-text-muted">No graph node selected</p>
      </div>
    );
  }

  // Special case: output target nodes
  if (selectedNode.type === OUTPUT_TARGET_TYPE) {
    const outputPath = selectedNode.data?.outputPath ?? "";
    const portType = OUTPUT_TARGET_PORT_TYPE;
    const c = getPortColor(portType);
    return (
      <div className="p-4 space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
            Graph Node
          </div>
          <div className="text-base font-semibold text-text-primary">
            {selectedNode.data?.label ?? "Output Target"}
          </div>
          <div className="text-xs text-emerald-400 mt-0.5">Output Target</div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs text-neutral-500">
            <span className="text-neutral-600">Path:</span>{" "}
            <span className="font-mono">{outputPath}</span>
          </div>
          <div className="text-xs text-neutral-500">
            <span className="text-neutral-600">Value type:</span>{" "}
            <span className="flex items-center gap-1.5 inline-flex font-mono">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ background: c.bg, border: `1px solid ${c.border}` }}
              />
              {portType}
            </span>
          </div>
        </div>

        {/* Plot toggle + chart */}
        <div>
          <button
            onClick={togglePlot}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
              plotActive
                ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
                : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:text-neutral-300"
            }`}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: plotActive ? "#60a5fa" : "#525252" }}
            />
            {plotActive ? "Plot on" : "Plot off"}
          </button>
          <OutputValueChart active={plotActive} />
        </div>
      </div>
    );
  }

  // Special case: input source nodes
  if (selectedNode.type === INPUT_SOURCE_TYPE) {
    return <InputSourceInspector node={selectedNode} />;
  }

  const label =
    selectedNode.data?.label ??
    schema?.signature?.name ??
    selectedNode.type ??
    "Unknown";
  const doc = schema?.signature?.doc;
  const category = schema?.signature?.category;
  const typeId =
    schema?.signature?.type_id ?? schema?.signature?.id ?? selectedNode.type;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
          Graph Node
        </div>
        <div className="text-base font-semibold text-text-primary">{label}</div>
        {category && (
          <div className="text-xs text-neutral-500 mt-0.5">{category}</div>
        )}
        {doc && (
          <p className="text-sm text-neutral-400 mt-2 leading-relaxed">{doc}</p>
        )}
      </div>

      {/* Node ID & type */}
      <div className="space-y-1.5">
        <div className="text-xs text-neutral-500">
          <span className="text-neutral-600">ID:</span>{" "}
          <span className="font-mono">{selectedNode.id}</span>
        </div>
        <div className="text-xs text-neutral-500">
          <span className="text-neutral-600">Type:</span>{" "}
          <span className="font-mono">{typeId}</span>
        </div>
      </div>

      {/* Inputs */}
      {ports && ports.inputs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Inputs
          </h4>
          <div className="space-y-1">
            {ports.inputs.map((p) => {
              const c = getPortColor(p.type);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-neutral-300">{p.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{
                        background: c.bg,
                        border: `1px solid ${c.border}`,
                      }}
                    />
                    {p.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Outputs */}
      {ports && ports.outputs.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Outputs
          </h4>
          <div className="space-y-1">
            {ports.outputs.map((p) => {
              const c = getPortColor(p.type);
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-neutral-300">{p.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{
                        background: c.bg,
                        border: `1px solid ${c.border}`,
                      }}
                    />
                    {p.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Params */}
      {schema && schema.params.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            Parameters
          </h4>
          <div className="space-y-2">
            {schema.params.map((p) => (
              <ParamInput
                key={p.id}
                param={p}
                value={selectedNode.data?.params?.[p.id]}
                onChange={(v) => updateParam(p.id, v)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Plot toggle + chart */}
      <div>
        <button
          onClick={togglePlot}
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
            plotActive
              ? "bg-blue-600/20 text-blue-400 border border-blue-500/40"
              : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:text-neutral-300"
          }`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: plotActive ? "#60a5fa" : "#525252" }}
          />
          {plotActive ? "Plot on" : "Plot off"}
        </button>
        <OutputValueChart active={plotActive} />
      </div>
    </div>
  );
}

// ─── Parameter input ─────────────────────────────────────────────────

const FLOAT_TYPES = new Set(["f32", "float", "f64", "double"]);
const INT_TYPES = new Set(["i32", "int", "integer"]);
const BOOL_TYPES = new Set(["bool", "boolean"]);

/**
 * Unwrap a WASM-style typed default value.
 *
 * The node-graph WASM may return `default_json` as a single-key object like
 * `{ f32: 0.0 }` or `{ bool: true }`.  This helper extracts the inner
 * primitive so the inspector and node creation code always work with plain
 * JS values.  Plain primitives and `null`/`undefined` pass through as-is.
 */
export function unwrapDefault(val: unknown): unknown {
  if (val == null || typeof val !== "object" || Array.isArray(val)) {
    return val;
  }
  const keys = Object.keys(val as Record<string, unknown>);
  if (keys.length === 1) {
    const inner = (val as Record<string, unknown>)[keys[0]];
    if (inner == null || typeof inner !== "object") {
      return inner; // primitive or null
    }
  }
  return val;
}

function ParamInput({
  param,
  value,
  onChange,
}: {
  param: ParamSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const type = param.type.toLowerCase();
  const defaultVal = unwrapDefault(param.default_json);
  const resolved = value ?? defaultVal;

  if (BOOL_TYPES.has(type)) {
    const checked = resolved === true || resolved === "true";
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-300">{param.name}</span>
        <button
          onClick={() => onChange(!checked)}
          className={`w-8 h-4 rounded-full transition-colors relative ${
            checked ? "bg-blue-600" : "bg-neutral-700"
          }`}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
              checked ? "left-4" : "left-0.5"
            }`}
          />
        </button>
      </div>
    );
  }

  if (FLOAT_TYPES.has(type)) {
    const num = typeof resolved === "number" ? resolved : 0;
    return (
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">{param.name}</span>
          <span className="text-[10px] text-neutral-600 font-mono">
            {param.type}
          </span>
        </div>
        <input
          type="number"
          value={num}
          step="any"
          min={param.min}
          max={param.max}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-blue-500 focus:outline-none"
        />
      </div>
    );
  }

  if (INT_TYPES.has(type)) {
    const num = typeof resolved === "number" ? resolved : 0;
    return (
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-300">{param.name}</span>
          <span className="text-[10px] text-neutral-600 font-mono">
            {param.type}
          </span>
        </div>
        <input
          type="number"
          value={num}
          step={1}
          min={param.min}
          max={param.max}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
          className="w-full px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-blue-500 focus:outline-none"
        />
      </div>
    );
  }

  // Fallback: string/any — text input
  const str = resolved != null ? String(resolved) : "";
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-300">{param.name}</span>
        <span className="text-[10px] text-neutral-600 font-mono">
          {param.type}
        </span>
      </div>
      <input
        type="text"
        value={str}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}
