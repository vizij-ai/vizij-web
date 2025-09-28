import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorStore } from "../store/useEditorStore";
import { ParamSpec, PortSpec, useRegistry } from "../contexts/RegistryProvider";
import { useGraphRuntime, useNodeOutputs } from "@vizij/node-graph-react";

/**
 * InspectorPanel (NodeSpec-first)
 *
 * Purpose:
 * - Render a transparent, editable view of the canonical NodeSpec for the selected node.
 * - Editable sections: id, type, params (structured), inputs (select source node + output key + selector),
 *   output_shape (inferred / shown), and raw JSON.
 *
 * Behavior:
 * - Param editors are driven by ParamSpec from the registry (via getParamsForType).
 * - Editing a param updates the editor store node data (node.data.params) and calls runtime.setParam if available.
 * - Inputs are represented in node.data.inputs as array entries { portId, sourceNodeId, sourceOutputKey, selector }.
 * - Raw JSON editor edits node (full JSON) and applies on Apply.
 *
 * Note: This component focuses on correctness and clarity rather than visual polish.
 */

function safeParseJSON<T = any>(text: string): { value?: T; error?: string } {
  try {
    const v = JSON.parse(text);
    return { value: v };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

function renderParamEditor(
  param: ParamSpec,
  value: any,
  onChange: (v: any) => void,
) {
  const type = (param.type ?? "any").toLowerCase();

  // enum from editorHints.options
  const options = param.editorHints?.options ?? param.editorHints?.enum ?? null;

  if (options && Array.isArray(options)) {
    return (
      <select
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">(none)</option>
        {options.map((o: any) => (
          <option key={String(o)} value={String(o)}>
            {String(o)}
          </option>
        ))}
      </select>
    );
  }

  if (type === "bool" || type === "boolean") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  if (
    type === "number" ||
    type === "float" ||
    type === "double" ||
    type === "int"
  ) {
    return (
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      />
    );
  }

  if (type === "vec3" && Array.isArray(value)) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={value[0] ?? ""}
          onChange={(e) =>
            onChange([Number(e.target.value), value[1], value[2]])
          }
          style={{ width: 60 }}
        />
        <input
          value={value[1] ?? ""}
          onChange={(e) =>
            onChange([value[0], Number(e.target.value), value[2]])
          }
          style={{ width: 60 }}
        />
        <input
          value={value[2] ?? ""}
          onChange={(e) =>
            onChange([value[0], value[1], Number(e.target.value)])
          }
          style={{ width: 60 }}
        />
      </div>
    );
  }

  // fallback JSON/text editor for structured values
  if (typeof value === "object") {
    return (
      <textarea
        rows={3}
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          const parsed = safeParseJSON(e.target.value);
          if (!parsed.error) onChange(parsed.value);
          else onChange(e.target.value);
        }}
      />
    );
  }

  return (
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  );
}

// Specialized editor for the common "value" param: lets the user choose a type and edits ValueJSON accordingly.
function ValueParamEditor({
  value,
  onChange,
}: {
  value: any;
  onChange: (v: any) => void;
}) {
  const detectKind = (
    v: any,
  ): "float" | "bool" | "vec3" | "vector" | "text" => {
    if (v && typeof v === "object") {
      if ("float" in v) return "float";
      if ("bool" in v) return "bool";
      if ("vec3" in v) return "vec3";
      if ("vector" in v) return "vector";
      if ("text" in v) return "text";
    }
    if (typeof v === "number") return "float";
    if (typeof v === "boolean") return "bool";
    if (Array.isArray(v)) return v.length === 3 ? "vec3" : "vector";
    if (typeof v === "string") return "text";
    return "float";
  };

  const [kind, setKind] = useState<
    "float" | "bool" | "vec3" | "vector" | "text"
  >(detectKind(value));
  const [floatVal, setFloatVal] = useState<number>(() => {
    if (value && typeof value === "object" && "float" in value)
      return Number((value as any).float) || 0;
    if (typeof value === "number") return value;
    return 0;
  });
  const [boolVal, setBoolVal] = useState<boolean>(() => {
    if (value && typeof value === "object" && "bool" in value)
      return !!(value as any).bool;
    if (typeof value === "boolean") return value;
    return false;
  });
  const [vec3Val, setVec3Val] = useState<[number, number, number]>(() => {
    if (value && typeof value === "object" && "vec3" in value)
      return (value as any).vec3 as [number, number, number];
    if (Array.isArray(value) && value.length === 3)
      return [
        Number(value[0]) || 0,
        Number(value[1]) || 0,
        Number(value[2]) || 0,
      ];
    return [0, 0, 0];
  });
  const [vectorStr, setVectorStr] = useState<string>(() => {
    if (value && typeof value === "object" && "vector" in value)
      return ((value as any).vector as number[]).join(", ");
    if (Array.isArray(value)) return (value as number[]).join(", ");
    return "";
  });
  const [textVal, setTextVal] = useState<string>(() => {
    if (value && typeof value === "object" && "text" in value)
      return String((value as any).text ?? "");
    if (typeof value === "string") return value;
    return "";
  });

  useEffect(() => {
    // Re-sync UI when external value changes (e.g., switching selected node)
    const k = detectKind(value);
    setKind(k);
    if (k === "float") {
      setFloatVal(
        value && typeof value === "object" && "float" in value
          ? Number((value as any).float) || 0
          : typeof value === "number"
            ? value
            : 0,
      );
    } else if (k === "bool") {
      setBoolVal(
        value && typeof value === "object" && "bool" in value
          ? !!(value as any).bool
          : typeof value === "boolean"
            ? value
            : false,
      );
    } else if (k === "vec3") {
      const v =
        value && typeof value === "object" && "vec3" in value
          ? (value as any).vec3
          : Array.isArray(value)
            ? value
            : [0, 0, 0];
      setVec3Val([Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]);
    } else if (k === "vector") {
      const arr =
        value && typeof value === "object" && "vector" in value
          ? (value as any).vector
          : Array.isArray(value)
            ? value
            : [];
      setVectorStr((arr as number[]).join(", "));
    } else if (k === "text") {
      const t =
        value && typeof value === "object" && "text" in value
          ? (value as any).text
          : typeof value === "string"
            ? value
            : "";
      setTextVal(String(t ?? ""));
    }
  }, [value]);

  // TODO: Evaluate if needed.
  // const emit = (k: typeof kind) => {
  //   let next: any = undefined;
  //   if (k === "float") next = { float: Number(floatVal) || 0 };
  //   else if (k === "bool") next = { bool: !!boolVal };
  //   else if (k === "vec3")
  //     next = {
  //       vec3: [
  //         Number(vec3Val[0]) || 0,
  //         Number(vec3Val[1]) || 0,
  //         Number(vec3Val[2]) || 0,
  //       ],
  //     };
  //   else if (k === "vector") {
  //     const nums = vectorStr
  //       .split(/[,\s]+/)
  //       .map((s) => s.trim())
  //       .filter((s) => s.length > 0)
  //       .map((s) => Number(s))
  //       .filter((n) => Number.isFinite(n));
  //     next = { vector: nums };
  //   } else if (k === "text") next = { text: String(textVal ?? "") };
  //   onChange(next);
  // };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: "#666" }}>Type</label>
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as typeof kind;
            setKind(k);
            // Initialize sensible defaults and emit new ValueJSON immediately
            if (k === "float") {
              setFloatVal(0);
              onChange({ float: 0 });
            } else if (k === "bool") {
              setBoolVal(false);
              onChange({ bool: false });
            } else if (k === "vec3") {
              const def: [number, number, number] = [0, 0, 0];
              setVec3Val(def);
              onChange({ vec3: def });
            } else if (k === "vector") {
              setVectorStr("");
              onChange({ vector: [] });
            } else if (k === "text") {
              setTextVal("");
              onChange({ text: "" });
            }
          }}
          style={{ padding: 6 }}
        >
          <option value="float">float</option>
          <option value="bool">bool</option>
          <option value="vec3">vec3</option>
          <option value="vector">vector</option>
          <option value="text">text</option>
        </select>
      </div>

      {kind === "float" && (
        <input
          type="number"
          value={Number.isFinite(floatVal) ? String(floatVal) : ""}
          onChange={(e) => {
            const n = e.target.value === "" ? 0 : Number(e.target.value);
            setFloatVal(n);
            onChange({ float: n });
          }}
          style={{ width: 140, padding: 6 }}
        />
      )}

      {kind === "bool" && (
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={!!boolVal}
            onChange={(e) => {
              const b = e.target.checked;
              setBoolVal(b);
              onChange({ bool: b });
            }}
          />
          <span>true/false</span>
        </label>
      )}

      {kind === "vec3" && (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="number"
            value={vec3Val[0]}
            onChange={(e) => {
              const n = Number(e.target.value);
              const next: [number, number, number] = [
                n,
                vec3Val[1],
                vec3Val[2],
              ];
              setVec3Val(next);
              onChange({ vec3: next });
            }}
            style={{ width: 60 }}
          />
          <input
            type="number"
            value={vec3Val[1]}
            onChange={(e) => {
              const n = Number(e.target.value);
              const next: [number, number, number] = [
                vec3Val[0],
                n,
                vec3Val[2],
              ];
              setVec3Val(next);
              onChange({ vec3: next });
            }}
            style={{ width: 60 }}
          />
          <input
            type="number"
            value={vec3Val[2]}
            onChange={(e) => {
              const n = Number(e.target.value);
              const next: [number, number, number] = [
                vec3Val[0],
                vec3Val[1],
                n,
              ];
              setVec3Val(next);
              onChange({ vec3: next });
            }}
            style={{ width: 60 }}
          />
        </div>
      )}

      {kind === "vector" && (
        <input
          value={vectorStr}
          placeholder="e.g. 1, 2, 3"
          onChange={(e) => {
            const str = e.target.value;
            setVectorStr(str);
            const nums = str
              .split(/[,\s]+/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
              .map((s) => Number(s))
              .filter((n) => Number.isFinite(n));
            onChange({ vector: nums });
          }}
          style={{ width: "100%", padding: 6 }}
        />
      )}

      {kind === "text" && (
        <input
          value={textVal}
          onChange={(e) => {
            const t = e.target.value;
            setTextVal(t);
            onChange({ text: t });
          }}
          style={{ width: "100%", padding: 6 }}
        />
      )}
    </div>
  );
}

export default function InspectorPanel(): JSX.Element {
  const selectedId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setEdges = useEditorStore((s) => s.setEdges);
  const setSelected = useEditorStore((s) => s.setSelected);

  const node = nodes.find((n) => n.id === selectedId) ?? null;
  const { registry, getParamsForType, getPortsForType } = useRegistry();
  const runtime = useGraphRuntime();
  const runtimeReady = runtime.ready;
  const controlsDisabled = !runtimeReady;

  // Inspector runtime debug hooks (must be declared unconditionally before any early returns)
  const handleEvalNow = useCallback(() => {
    if (!runtimeReady) return;
    try {
      const res = runtime.evalAll?.();
      // eslint-disable-next-line no-console
      console.info("[Inspector] EvalNow ->", res);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Inspector] EvalNow error:", err);
    }
  }, [runtime, runtimeReady]);

  const spec = useEditorStore((s) => s.spec);
  const handleReloadGraph = useCallback(async () => {
    if (!runtimeReady) return;
    try {
      // eslint-disable-next-line no-console
      console.info(
        "[Inspector] ReloadGraph clicked. runtime.ready=",
        runtime?.ready,
        "spec nodes=",
        (spec as any)?.nodes?.length ?? 0,
      );
      runtime.stopPlayback?.();
      runtime.unloadGraph?.();
      if (spec) {
        await runtime.loadGraph?.(spec as any);
        const res = runtime.evalAll?.();
        // eslint-disable-next-line no-console
        console.info("[Inspector] ReloadGraph -> evalAll result:", res);
      } else {
        // eslint-disable-next-line no-console
        console.warn("[Inspector] No spec available to load.");
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[Inspector] ReloadGraph error:", err);
    }
  }, [runtime, spec, runtimeReady]);

  const snapshot = runtime.getSnapshot?.();
  const nodeKeys = useMemo(
    () => Object.keys((snapshot as any)?.evalResult?.nodes ?? {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO Evaluate dependency needs here
    [snapshot?.version],
  );

  // Local raw JSON editor state
  const [rawJson, setRawJson] = useState<string>("");

  useEffect(() => {
    if (node) {
      setRawJson(JSON.stringify(node, null, 2));
    } else {
      setRawJson("");
    }
  }, [node]);

  // Params spec for selected node type
  const paramsSpec = useMemo(() => {
    if (!node || !getParamsForType) return [];
    try {
      return getParamsForType(String(node.type ?? ""));
    } catch {
      return [];
    }
  }, [node, getParamsForType]);

  // Ports for selected node type
  const portsSpec = useMemo(() => {
    if (!node || !getPortsForType)
      return { inputs: [], outputs: [] as PortSpec[] };
    try {
      const p = getPortsForType(String(node.type ?? ""));
      return p;
    } catch {
      return { inputs: [], outputs: [] as PortSpec[] };
    }
  }, [node, getPortsForType]);

  // Helper: update node params in store and call runtime.setParam if available
  const updateNodeParam = useCallback(
    (nodeId: string, paramId: string, value: any) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const params = { ...(n.data?.params ?? {}) };
          params[paramId] = value;
          const next = { ...n, data: { ...(n.data || {}), params } };
          return next;
        }),
      );

      // runtime live update
      if (runtimeReady) {
        try {
          runtime?.setParam?.(nodeId, paramId, value);
        } catch {
          // ignore runtime failures in editor
        }
      }
    },
    [setNodes, runtime, runtimeReady],
  );

  // Optionally reconcile NodeSpec.inputs -> RF edges (create edge)
  const reconcileInputsToEdges = useCallback(
    (n: any) => {
      if (!n || !Array.isArray(n.data?.inputs)) return;
      const newEdges: any[] = [];
      for (const inp of n.data.inputs) {
        if (inp.sourceNodeId && inp.sourceOutputKey) {
          const id = `e_${inp.sourceNodeId}_${inp.sourceOutputKey}_${n.id}_${inp.portId}_${Date.now()}`;
          newEdges.push({
            id,
            source: inp.sourceNodeId,
            target: n.id,
            sourceHandle: inp.sourceOutputKey,
            targetHandle: inp.portId,
          });
        }
      }
      if (newEdges.length > 0) {
        setEdges((prev) => {
          // remove edges that target this node for same port ids then append newEdges
          const filtered = prev.filter(
            (e) =>
              !(
                e.target === n.id &&
                n.data?.inputs?.some(
                  (i: any) => String(i.portId) === String(e.targetHandle),
                )
              ),
          );
          return [...filtered, ...newEdges];
        });
      }
    },
    [setEdges],
  );

  // Helper: update node inputs mapping (node.data.inputs)
  const updateNodeInput = useCallback(
    (
      nodeId: string,
      portId: string,
      mapping: {
        sourceNodeId?: string | null;
        sourceOutputKey?: string | null;
        selector?: string | null;
      },
    ) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const inputs = Array.isArray(n.data?.inputs)
            ? [...n.data!.inputs]
            : [];
          const idx = inputs.findIndex(
            (i: any) => String(i.portId) === String(portId),
          );
          const entry = {
            portId,
            sourceNodeId: mapping.sourceNodeId ?? null,
            sourceOutputKey: mapping.sourceOutputKey ?? null,
            selector: mapping.selector ?? null,
          };
          if (idx >= 0) inputs[idx] = entry;
          else inputs.push(entry);
          const nextNode = { ...n, data: { ...(n.data || {}), inputs } };
          // Reconcile RF edges asynchronously after store update
          setTimeout(() => reconcileInputsToEdges(nextNode), 0);
          return nextNode;
        }),
      );
    },
    [setNodes, reconcileInputsToEdges],
  );

  // Apply raw JSON to node (replace node object in store)
  const applyRawJsonToNode = useCallback(() => {
    if (!node) return;
    const parsed = safeParseJSON(rawJson);
    if (parsed.error) {
      window.alert(`Invalid JSON: ${parsed.error}`);
      return;
    }
    const obj = parsed.value;
    if (!obj || typeof obj !== "object" || !obj.id) {
      window.alert("JSON must be an object with an 'id' field.");
      return;
    }
    // apply: replace node (preserve position if missing)
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== node.id) return n;
        const pos = n.position ?? { x: 0, y: 0 };
        return { ...obj, position: obj.position ?? pos } as any;
      }),
    );
    // if id changed, update edges
    if (obj.id && obj.id !== node.id) {
      setEdges((prev) =>
        prev.map((e) => ({
          ...e,
          source: e.source === node.id ? obj.id : e.source,
          target: e.target === node.id ? obj.id : e.target,
        })),
      );
      setSelected(obj.id);
    }
  }, [node, rawJson, setNodes, setEdges, setSelected]);

  // Live outputs snapshot for display
  const outputsSnapshot = useNodeOutputs(node?.id ?? "");
  console.log("[IP] Outputs Snapshot", node?.id, outputsSnapshot);

  if (!node) {
    return (
      <aside style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Inspector</h3>
        <div style={{ color: "#888", fontSize: 13 }}>
          Select a node on the canvas to inspect its details.
        </div>
      </aside>
    );
  }

  return (
    <aside style={{ padding: 12, width: 360 }}>
      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <h3 style={{ margin: 0 }}>Inspector</h3>
        <button
          onClick={() => setSelected(null)}
          style={{ marginLeft: "auto" }}
        >
          Deselect
        </button>
      </div>

      {/* Runtime debug controls */}
      <section
        style={{
          marginBottom: 10,
          padding: 8,
          background: "#f7fafc",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
        }}
      >
        <div style={{ fontSize: 12, color: "#333", marginBottom: 6 }}>
          Runtime ready: <strong>{String(runtime.ready)}</strong> · Playback:{" "}
          <strong>{runtime.getPlaybackMode?.()}</strong> · Snapshot v
          <strong>{(snapshot as any)?.version ?? 0}</strong>
        </div>
        <div style={{ fontSize: 12, color: "#333", marginBottom: 6 }}>
          Eval nodes keys:{" "}
          <code>{nodeKeys.length ? nodeKeys.join(", ") : "(none)"}</code>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={handleEvalNow}
            style={{ padding: "4px 8px" }}
            disabled={controlsDisabled}
          >
            Eval Now
          </button>
          <button
            onClick={handleReloadGraph}
            style={{ padding: "4px 8px" }}
            disabled={controlsDisabled}
          >
            Reload Graph
          </button>
        </div>
      </section>

      {/* Identity */}
      <section style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>{node.data?.label ?? node.type}</div>
        <div style={{ color: "#9aa0a6", fontSize: 12 }}>{`ID: ${node.id}`}</div>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <label style={{ fontSize: 12 }}>ID</label>
          <input
            value={node.id}
            onChange={(e) => {
              // live edit id draft in raw json area only; use rename flow to change id safely
              setRawJson((r) => {
                try {
                  const obj = JSON.parse(r);
                  obj.id = e.target.value;
                  return JSON.stringify(obj, null, 2);
                } catch {
                  return r;
                }
              });
            }}
            style={{ width: "100%", padding: 6 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                const parsed = safeParseJSON(rawJson);
                if (parsed.error) {
                  alert("Please fix JSON before applying ID rename.");
                  return;
                }
                const obj = parsed.value;
                if (!obj.id) {
                  alert("JSON must include id");
                  return;
                }
                // perform rename via existing renameNode flow: setSelected + update nodes/edges
                const newId = String(obj.id);
                if (nodes.some((n) => n.id === newId && n.id !== node.id)) {
                  alert("A node with that ID already exists.");
                  return;
                }
                setNodes((prev) =>
                  prev.map((n) => (n.id === node.id ? { ...n, id: newId } : n)),
                );
                setEdges((prev) =>
                  prev.map((e) => ({
                    ...e,
                    source: e.source === node.id ? newId : e.source,
                    target: e.target === node.id ? newId : e.target,
                  })),
                );
                setSelected(newId);
              }}
            >
              Apply ID (from JSON)
            </button>
          </div>
        </div>
      </section>

      {/* Type */}
      <section style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 6 }}>
          Type
        </label>
        <select
          value={node.type ?? ""}
          onChange={(e) => {
            const newType = e.target.value;
            setNodes((prev) =>
              prev.map((n) => (n.id === node.id ? { ...n, type: newType } : n)),
            );
          }}
          style={{ width: "100%", padding: 6 }}
        >
          <option value={node.type}>{node.type}</option>
          {registry?.nodes?.map((t: any) => (
            <option key={t.type_id ?? t.id} value={t.type_id ?? t.id}>
              {t.name ?? t.type_id ?? t.id}
            </option>
          ))}
        </select>
      </section>

      {/* Params */}
      <section style={{ marginBottom: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Params</h4>
        {paramsSpec.length === 0 ? (
          <div style={{ color: "#888" }}>
            No structured params for this node type.
          </div>
        ) : (
          paramsSpec.map((p) => {
            const current = (node.data?.params ?? {})[p.id];
            return (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <label
                  style={{ display: "block", fontSize: 12, marginBottom: 4 }}
                >
                  {p.name ?? p.id}
                </label>
                <div>
                  {p.id === "value" ? (
                    <ValueParamEditor
                      value={current}
                      onChange={(v) => updateNodeParam(node.id, p.id, v)}
                    />
                  ) : (
                    renderParamEditor(p, current, (v) =>
                      updateNodeParam(node.id, p.id, v),
                    )
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#9aa0a6", marginTop: 4 }}>
                  {p.editorHints?.description ?? ""}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Inputs */}
      <section style={{ marginBottom: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Inputs</h4>
        {portsSpec.inputs.length === 0 ? (
          <div style={{ color: "#888" }}>
            No declared inputs for this node type.
          </div>
        ) : (
          <>
            {portsSpec.inputs.map((port) => {
              const mapping = Array.isArray(node.data?.inputs)
                ? node.data.inputs.find(
                    (i: any) => String(i.portId) === String(port.id),
                  )
                : null;
              return (
                <div
                  key={port.id}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    background: "#fafafa",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    {port.label ?? port.name}
                  </div>
                  <div
                    style={{ fontSize: 12, color: "#666" }}
                  >{`port: ${port.id} — type: ${port.type}`}</div>

                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    <div>
                      <label style={{ fontSize: 12 }}>Source node</label>
                      <select
                        value={mapping?.sourceNodeId ?? ""}
                        onChange={(e) =>
                          updateNodeInput(node.id, port.id, {
                            sourceNodeId: e.target.value || null,
                            sourceOutputKey: null,
                            selector: null,
                          })
                        }
                        style={{ width: "100%", padding: 6 }}
                      >
                        <option value="">(none)</option>
                        {nodes
                          .filter((nn) => nn.id !== node.id)
                          .map((nn) => (
                            <option key={nn.id} value={nn.id}>
                              {nn.data?.label ?? nn.id}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 12 }}>Source output key</label>
                      <select
                        value={mapping?.sourceOutputKey ?? ""}
                        onChange={(e) =>
                          updateNodeInput(node.id, port.id, {
                            sourceNodeId: mapping?.sourceNodeId ?? null,
                            sourceOutputKey: e.target.value || null,
                            selector: null,
                          })
                        }
                        style={{ width: "100%", padding: 6 }}
                      >
                        <option value="">(none)</option>
                        {mapping?.sourceNodeId
                          ? (() => {
                              const src = nodes.find(
                                (nn) => nn.id === mapping.sourceNodeId,
                              );
                              const srcPorts = src
                                ? (getPortsForType?.(String(src.type ?? ""))
                                    ?.outputs ?? [])
                                : [];
                              return srcPorts.map((op: any) => (
                                <option key={op.id} value={op.id}>
                                  {op.label ?? op.name ?? op.id}
                                </option>
                              ));
                            })()
                          : null}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 12 }}>
                        Selector (optional)
                      </label>
                      <input
                        value={mapping?.selector ?? ""}
                        onChange={(e) =>
                          updateNodeInput(node.id, port.id, {
                            sourceNodeId: mapping?.sourceNodeId ?? null,
                            sourceOutputKey: mapping?.sourceOutputKey ?? null,
                            selector: e.target.value || null,
                          })
                        }
                        style={{ width: "100%", padding: 6 }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <>
          {/* Variadic inputs handling */}
          {portsSpec.variadicInputs ? (
            <div
              style={{
                padding: 8,
                borderRadius: 6,
                background: "#f8faf8",
                marginTop: 8,
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {portsSpec.variadicInputs.label ?? portsSpec.variadicInputs.id}{" "}
                (variadic)
              </div>
              <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                {`type: ${portsSpec.variadicInputs.type}  min: ${portsSpec.variadicInputs.min ?? 0} ${portsSpec.variadicInputs.max ? `max: ${portsSpec.variadicInputs.max}` : ""}`}
              </div>

              {/* list existing variadic mappings */}
              {Array.isArray(node.data?.inputs)
                ? node.data.inputs
                    .filter((i: any) =>
                      String(i.portId).startsWith(
                        `${portsSpec.variadicInputs!.id}_`,
                      ),
                    )
                    .map((m: any, idx: number) => (
                      <div
                        key={m.portId}
                        style={{
                          padding: 6,
                          background: "#fff",
                          borderRadius: 6,
                          marginBottom: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "#333",
                            marginBottom: 6,
                          }}
                        >{`Item ${idx + 1} (id: ${m.portId})`}</div>

                        <div style={{ display: "grid", gap: 8 }}>
                          <select
                            value={m.sourceNodeId ?? ""}
                            onChange={(e) =>
                              updateNodeInput(node.id, m.portId, {
                                sourceNodeId: e.target.value || null,
                                sourceOutputKey: null,
                                selector: null,
                              })
                            }
                            style={{ width: "100%", padding: 6 }}
                          >
                            <option value="">(none)</option>
                            {nodes
                              .filter((nn) => nn.id !== node.id)
                              .map((nn) => (
                                <option key={nn.id} value={nn.id}>
                                  {nn.data?.label ?? nn.id}
                                </option>
                              ))}
                          </select>

                          <select
                            value={m.sourceOutputKey ?? ""}
                            onChange={(e) =>
                              updateNodeInput(node.id, m.portId, {
                                sourceNodeId: m.sourceNodeId ?? null,
                                sourceOutputKey: e.target.value || null,
                                selector: null,
                              })
                            }
                            style={{ width: "100%", padding: 6 }}
                          >
                            <option value="">(none)</option>
                            {m.sourceNodeId
                              ? (() => {
                                  const src = nodes.find(
                                    (nn) => nn.id === m.sourceNodeId,
                                  );
                                  const srcPorts = src
                                    ? (getPortsForType?.(String(src.type ?? ""))
                                        ?.outputs ?? [])
                                    : [];
                                  return srcPorts.map((op: any) => (
                                    <option key={op.id} value={op.id}>
                                      {op.label ?? op.name ?? op.id}
                                    </option>
                                  ));
                                })()
                              : null}
                          </select>

                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              value={m.selector ?? ""}
                              onChange={(e) =>
                                updateNodeInput(node.id, m.portId, {
                                  sourceNodeId: m.sourceNodeId ?? null,
                                  sourceOutputKey: m.sourceOutputKey ?? null,
                                  selector: e.target.value || null,
                                })
                              }
                              style={{ flex: 1, padding: 6 }}
                              placeholder="selector (optional)"
                            />
                            <button
                              onClick={() => {
                                // remove this variadic mapping
                                setNodes((prev) =>
                                  prev.map((n) => {
                                    if (n.id !== node.id) return n;
                                    const inputs = (
                                      n.data?.inputs ?? []
                                    ).filter(
                                      (i: any) =>
                                        String(i.portId) !== String(m.portId),
                                    );
                                    return {
                                      ...n,
                                      data: { ...(n.data || {}), inputs },
                                    };
                                  }),
                                );
                              }}
                              style={{
                                padding: "6px 8px",
                                background: "#ffdddd",
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                : null}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    // add new variadic mapping with generated port id
                    const idx =
                      ((node.data?.inputs ?? []).filter((i: any) =>
                        String(i.portId).startsWith(
                          `${portsSpec.variadicInputs!.id}_`,
                        ),
                      ).length ?? 0) + 1;
                    const newPortId = `${portsSpec.variadicInputs!.id}_${Date.now()}_${idx}`;
                    updateNodeInput(node.id, newPortId, {
                      sourceNodeId: null,
                      sourceOutputKey: null,
                      selector: null,
                    });
                  }}
                  style={{ padding: "6px 8px" }}
                >
                  Add {portsSpec.variadicInputs.label ?? "item"}
                </button>
              </div>
            </div>
          ) : null}
        </>
        <div style={{ fontSize: 12, color: "#9aa0a6" }}>
          Changes to inputs will update the node's NodeSpec mapping; use export
          to persist the canonical spec.
        </div>
      </section>

      {/* Output shape & live outputs */}
      <section style={{ marginTop: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Output shape & Live outputs</h4>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#9aa0a6" }}>Declared outputs</div>
          {portsSpec.outputs.length === 0 ? (
            <div style={{ color: "#888" }}>No declared outputs</div>
          ) : (
            portsSpec.outputs.map((o) => (
              <div key={o.id}>{`${o.id} : ${o.type}`}</div>
            ))
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: "#9aa0a6", marginBottom: 6 }}>
            Live outputs
          </div>
          {outputsSnapshot && Object.keys(outputsSnapshot).length > 0 ? (
            Object.entries(outputsSnapshot).map(([k, v]) => (
              <div
                key={k}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  background: "#0b1220",
                  color: "#fff",
                  marginBottom: 8,
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div style={{ fontWeight: 700 }}>{k}</div>
                  <div style={{ color: "#9aa0a6" }}>{typeof v}</div>
                </div>
                <pre
                  style={{
                    marginTop: 8,
                    whiteSpace: "pre-wrap",
                    color: "#e6eef8",
                  }}
                >
                  {JSON.stringify(v, null, 2)}
                </pre>
              </div>
            ))
          ) : (
            <div style={{ color: "#888" }}>
              No runtime outputs available. Run the graph to produce outputs.
            </div>
          )}
        </div>
      </section>

      {/* Raw JSON (full NodeSpec) */}
      <section style={{ marginTop: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Raw NodeSpec JSON</h4>
        <textarea
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          rows={12}
          style={{ width: "100%", padding: 8, fontFamily: "monospace" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={applyRawJsonToNode} style={{ padding: "6px 8px" }}>
            Apply JSON to Node
          </button>
          <button
            onClick={() => {
              // reset JSON to current node
              setRawJson(JSON.stringify(node, null, 2));
            }}
            style={{ padding: "6px 8px" }}
          >
            Reset JSON
          </button>
        </div>
      </section>
    </aside>
  );
}
