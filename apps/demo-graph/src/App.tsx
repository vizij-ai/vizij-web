import React, { useEffect, useMemo, useState } from "react";
import {
  GraphProvider,
  useGraphRuntime,
  useNodeOutput,
  valueAsNumber,
  valueAsVector,
  useGraphLoaded,
  useGraphOutputs,
} from "@vizij/node-graph-react";
import type { GraphSpec, ValueJSON, ShapeJSON } from "@vizij/node-graph-wasm";
import { readFileAsText, parseGraphSpecJSON } from "./utils/file";
import { getDefaultGraphSpec } from "./utils/graph-default";
import { getLocalUrdfSpec } from "./assets/graph-presets";
import {
  oscillatorBasics,
  vectorPlayground,
  logicGate,
  tupleSpringDampSlew,
} from "@vizij/node-graph-wasm";

/* ---------- Value editors for Input nodes (leaf-focused) ---------- */

type OnValueChange = (next: ValueJSON) => void;

function isValueJSON(v: any): v is ValueJSON {
  return v && typeof v === "object";
}

function FloatField({
  v,
  onChange,
}: {
  v: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(v));
  useEffect(() => setText(String(v)), [v]);
  return (
    <input
      type="number"
      step="any"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const n = parseFloat(text);
        if (Number.isFinite(n)) onChange(n);
        else setText(String(v));
      }}
      style={{ width: 100 }}
    />
  );
}

function VecNField({
  arr,
  onChange,
}: {
  arr: number[];
  onChange: (next: number[]) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      {arr.map((x, i) => (
        <FloatField
          key={i}
          v={x}
          onChange={(n) => {
            const copy = arr.slice();
            copy[i] = n;
            onChange(copy);
          }}
        />
      ))}
    </div>
  );
}

/**
 * Render a minimal editor for common ValueJSON leaves:
 * - { float }, { vec3 }, { vector }, { tuple: [ ... ] } (best-effort)
 * Other variants render as read-only JSON for now.
 */
function ValueEditor({
  value,
  onChange,
}: {
  value: ValueJSON;
  onChange: OnValueChange;
}) {
  if ("float" in value) {
    return (
      <FloatField v={value.float} onChange={(n) => onChange({ float: n })} />
    );
  }
  if ("vec3" in value) {
    return (
      <VecNField
        arr={value.vec3}
        onChange={(next) =>
          onChange({ vec3: [next[0] ?? 0, next[1] ?? 0, next[2] ?? 0] })
        }
      />
    );
  }
  if ("vector" in value) {
    return (
      <VecNField
        arr={value.vector}
        onChange={(next) => onChange({ vector: next })}
      />
    );
  }
  if ("tuple" in value) {
    // Render editors for each tuple element recursively when recognizable
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {value.tuple.map((entry: ValueJSON, idx: number) => (
          <div
            key={idx}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <span>#{idx}:</span>
            {isValueJSON(entry) ? (
              <ValueEditor
                value={entry}
                onChange={(next) => {
                  const copy = value.tuple.slice();
                  copy[idx] = next;
                  onChange({ tuple: copy });
                }}
              />
            ) : (
              <code style={{ opacity: 0.7 }}>{JSON.stringify(entry)}</code>
            )}
          </div>
        ))}
      </div>
    );
  }
  if ("transform" in value) {
    // Show position editing only as a simple example
    const pos = value.transform.pos ?? [0, 0, 0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div>pos:</div>
        <VecNField
          arr={pos}
          onChange={(next) =>
            onChange({
              transform: {
                pos: [next[0] ?? 0, next[1] ?? 0, next[2] ?? 0],
                rot: value.transform.rot,
                scale: value.transform.scale,
              },
            })
          }
        />
      </div>
    );
  }
  // Fallback read-only renderer
  return <code style={{ opacity: 0.7 }}>{JSON.stringify(value)}</code>;
}

/* ---------- Output panel component (avoids hooks-in-loop) ---------- */

function OutputPanel({ nodeId }: { nodeId: string }) {
  const snapshot = useNodeOutput(nodeId, "out");
  const asNum = valueAsNumber(snapshot);
  const asVec = valueAsVector(snapshot);

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.debug("[demo-graph] Output snapshot", nodeId, snapshot);
  }, [snapshot, nodeId]);

  return (
    <div
      style={{
        border: "1px solid #333",
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{nodeId}</div>
      <div style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
        {asVec
          ? `[${asVec.map((x) => (Number.isFinite(x) ? x.toFixed(3) : String(x))).join(", ")}]`
          : asNum !== undefined
            ? asNum.toFixed(4)
            : JSON.stringify(snapshot?.value)}
      </div>
    </div>
  );
}

/* ---------- Graph UI: Lists input editors and output values ---------- */

function GraphUI({
  spec,
  autostart,
}: {
  spec: GraphSpec;
  autostart?: boolean;
}) {
  const rt = useGraphRuntime() as any;
  const { graphLoaded } = useGraphLoaded();
  const frameVersion = useGraphOutputs((snap: any) => snap?.version ?? 0);

  // Detect Input and Output nodes from current spec
  const inputNodes = useMemo(
    () =>
      Array.isArray(spec.nodes)
        ? spec.nodes.filter(
            (n: any) => n.type === "input" || n.type === "Input",
          )
        : [],
    [spec],
  );
  const outputNodes = useMemo(
    () =>
      Array.isArray(spec.nodes)
        ? spec.nodes.filter(
            (n: any) => n.type === "output" || n.type === "Output",
          )
        : [],
    [spec],
  );

  // Track local state for all Input nodes (keyed by path) and stage all on changes.
  const [inputState, setInputState] = useState<
    Record<string, { value: ValueJSON; declared?: ShapeJSON }>
  >({});

  // Initialize local state from spec and seed provider staging.
  useEffect(() => {
    const nextState: Record<
      string,
      { value: ValueJSON; declared?: ShapeJSON }
    > = {};
    inputNodes.forEach((node: any) => {
      const path = node.params?.path as string | undefined;
      if (!path) return;
      const value = (node.params?.value ?? { float: 0 }) as ValueJSON;
      const declared: ShapeJSON | undefined =
        node.output_shapes && typeof node.output_shapes === "object"
          ? (node.output_shapes["out"] as ShapeJSON | undefined)
          : undefined;
      nextState[path] = { value, declared };
    });
    setInputState(nextState);

    if (graphLoaded) {
      const entries = Object.entries(nextState);
      entries.forEach(([p, entry], i) => {
        const immediate = !autostart && i === entries.length - 1;
        rt.stageInput?.(p, entry.value, entry.declared, immediate);
      });
    }
  }, [spec, inputNodes, graphLoaded]);

  // When pausing, restage all current state and perform a single immediate eval to lock outputs.
  useEffect(() => {
    if (autostart === false) {
      if (graphLoaded) {
        const entries = Object.entries(inputState);
        if (entries.length > 0) {
          entries.forEach(([p, entry], i) => {
            rt.stageInput?.(
              p,
              entry.value,
              entry.declared,
              i === entries.length - 1,
            );
          });
        }
      }
    }
  }, [autostart, inputState, graphLoaded]);

  // While playing, re-stage current input values each frame so host inputs
  // are always registered before the provider's eval tick.
  useEffect(() => {
    if (autostart && graphLoaded) {
      const entries = Object.entries(inputState);
      if (entries.length > 0) {
        entries.forEach(([p, entry]) => {
          rt.stageInput?.(p, entry.value, entry.declared, false);
        });
      }
    }
  }, [autostart, graphLoaded, frameVersion, inputState]);

  // // Debug: observe writes and current IO node lists
  // const writes = useGraphWrites();
  // useEffect(() => {
  //   if (writes && writes.length) {
  //     // eslint-disable-next-line no-console
  //     console.debug("[demo-graph] Writes batch", JSON.stringify(writes));
  //   }
  // }, [writes]);

  // useEffect(() => {
  //   // eslint-disable-next-line no-console
  //   console.debug("[demo-graph] IO nodes", {
  //     inputs: inputNodes.map((n: any) => ({ id: n.id, path: n.params?.path })),
  //     outputs: outputNodes.map((n: any) => ({ id: n.id })),
  //   });
  // }, [inputNodes, outputNodes]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <section>
        <h3>Inputs</h3>
        {inputNodes.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No Input nodes</div>
        ) : (
          inputNodes.map((node: any) => {
            const path = node.params?.path as string | undefined;
            const defaultValue = (node.params?.value ?? {
              float: 0,
            }) as ValueJSON;
            const declared: ShapeJSON | undefined =
              node.output_shapes && typeof node.output_shapes === "object"
                ? (node.output_shapes["out"] as ShapeJSON | undefined)
                : undefined;

            // Prefer local state over spec defaults so the editor reflects live changes
            const stateEntry = path ? inputState[path] : undefined;
            const displayValue = (stateEntry?.value ??
              defaultValue) as ValueJSON;
            const displayDeclared = (stateEntry?.declared ?? declared) as
              | ShapeJSON
              | undefined;

            return (
              <div
                key={node.id}
                style={{
                  border: "1px solid #333",
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6 }}>
                  {node.id}{" "}
                  {path ? (
                    <small style={{ opacity: 0.7 }}>({path})</small>
                  ) : null}
                </div>
                <ValueEditor
                  value={displayValue}
                  onChange={(next) => {
                    if (!path) return;
                    // Update local state and stage all inputs so unchanged inputs don't fall back to defaults.
                    setInputState((prev) => {
                      const nextState = {
                        ...prev,
                        [path]: { value: next, declared: displayDeclared },
                      };
                      const entries = Object.entries(nextState);
                      entries.forEach(([p, entry]) => {
                        const immediate = !autostart && p === path; // avoid forcing extra evals while playing
                        rt.stageInput?.(
                          p,
                          entry.value,
                          entry.declared,
                          immediate,
                        );
                      });
                      return nextState;
                    });
                  }}
                />
              </div>
            );
          })
        )}
      </section>

      <section>
        <h3>Outputs</h3>
        {outputNodes.length === 0 ? (
          <div style={{ opacity: 0.7 }}>No Output nodes</div>
        ) : (
          outputNodes.map((node: any) => (
            <OutputPanel key={node.id} nodeId={node.id} />
          ))
        )}
      </section>
    </div>
  );
}

/* ---------- Controls: load/save, pick sample, play/pause ---------- */

function Controls({
  spec,
  setSpec,
}: {
  spec: GraphSpec;
  setSpec: (spec: GraphSpec) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sampleId, setSampleId] = useState<string>("vector-playground");

  const sampleMap = useMemo<Record<string, GraphSpec>>(
    () => ({
      "vector-playground": vectorPlayground as GraphSpec,
      "oscillator-basics": oscillatorBasics as GraphSpec,
      "logic-gate": logicGate as GraphSpec,
      "tuple-spring-damp-slew": tupleSpringDampSlew as GraphSpec,
    }),
    [],
  );

  const samplesList = useMemo(() => {
    return Object.entries(sampleMap).sort(([a], [b]) => a.localeCompare(b));
  }, [sampleMap]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const text = await readFileAsText(f);
      const parsed = parseGraphSpecJSON(text);
      setSpec(parsed);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      e.currentTarget.value = "";
    }
  };

  const onSave = () => {
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "graph-spec.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSample = (id: string) => {
    setSampleId(id);
    if (id === "urdf-ik-position") {
      setSpec(getLocalUrdfSpec());
    } else {
      const found = sampleMap[id];
      if (found) setSpec(found);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
        marginBottom: 12,
      }}
    >
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>Graph file</strong>
        <input
          type="file"
          accept=".json,application/json"
          onChange={onFileChange}
        />
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <strong>Sample</strong>
        <select value={sampleId} onChange={(e) => loadSample(e.target.value)}>
          {samplesList.map(([id]) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
          <option value="urdf-ik-position">urdf-ik-position (local)</option>
        </select>
      </label>

      <button onClick={onSave}>Save</button>

      {error ? <div style={{ color: "salmon" }}>Error: {error}</div> : null}
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [autostart, setAutostart] = useState(true);
  const [spec, setSpec] = useState<GraphSpec>(() => getDefaultGraphSpec());

  return (
    <div
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        maxWidth: 960,
        margin: "2rem auto",
        padding: "0 1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h1 style={{ margin: 0 }}>Vizij Demo Graph</h1>
        <button
          onClick={() => setAutostart((s) => !s)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #444",
            background: autostart ? "#1f8cff" : "#2a2a2a",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {autostart ? "Pause" : "Play"}
        </button>
      </div>

      <GraphProvider spec={spec} autoStart={autostart} updateHz={60}>
        <Controls spec={spec} setSpec={setSpec} />
        <GraphUI spec={spec} autostart={autostart} />
      </GraphProvider>
    </div>
  );
}
