import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useGraphRuntime, useNodeOutputs } from "@vizij/node-graph-react";
import { useDialogQueue } from "@vizij/authoring-shared";
import { cloneDeepSafe } from "@vizij/utils";
import type { JSX } from "react/jsx-runtime";
import { parseVariadicPortId } from "../store/useEditorStore";
import type { ParamSpec, PortSpec } from "../contexts/RegistryProvider";
import { useRegistry } from "../contexts/RegistryProvider";
import { useEditorStore } from "../store/useEditorStore";

const VARIADIC_DELIM = "_";

function formatVariadicPortId(groupId: string, index: number): string {
  return `${groupId}${VARIADIC_DELIM}${index}`;
}

const darkCardStyle: CSSProperties = {
  background: "rgba(17,24,39,0.85)",
  border: "1px solid rgba(148,163,184,0.35)",
  borderRadius: 8,
};

const darkSectionStyle: CSSProperties = {
  ...darkCardStyle,
  padding: 8,
};

const darkInputStyle: CSSProperties = {
  background: "rgba(15,23,42,0.85)",
  border: "1px solid rgba(148,163,184,0.45)",
  color: "#e2e8f0",
  borderRadius: 6,
  padding: "6px 8px",
};

const darkTextareaStyle: CSSProperties = {
  ...darkInputStyle,
  padding: "8px 10px",
  fontFamily: "monospace",
};

const darkButtonStyle: CSSProperties = {
  background: "rgba(37,99,235,0.22)",
  border: "1px solid rgba(59,130,246,0.45)",
  color: "#bfdbfe",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
};

const darkSecondaryButtonStyle: CSSProperties = {
  background: "rgba(148,163,184,0.18)",
  border: "1px solid rgba(148,163,184,0.4)",
  color: "#e2e8f0",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
};

const darkDangerButtonStyle: CSSProperties = {
  background: "rgba(248,113,113,0.2)",
  border: "1px solid rgba(248,113,113,0.4)",
  color: "#fecaca",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer",
};

const darkAccentBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: "#34d399",
  background: "rgba(52,211,153,0.15)",
  padding: "2px 6px",
  borderRadius: 999,
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const subtleTextColor = "#94a3b8";

function extractVariadicIndex(portId: string, groupId: string): number | null {
  const parsed = parseVariadicPortId(portId);
  if (!parsed) return null;
  if (parsed.groupId !== groupId) return null;
  return Number.isFinite(parsed.index) ? parsed.index : null;
}

function nextVariadicIndex(inputs: any[], groupId: string): number {
  const used = inputs
    .map((entry) => extractVariadicIndex(String(entry?.portId ?? ""), groupId))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
  let candidate = 0;
  for (const value of used) {
    if (value !== candidate) break;
    candidate += 1;
  }
  return candidate;
}

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
        style={{ ...darkInputStyle, width: "100%" }}
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
        style={{ accentColor: "#38bdf8" }}
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
        style={{ ...darkInputStyle, width: "100%" }}
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
          style={{ ...darkInputStyle, width: 60 }}
        />
        <input
          value={value[1] ?? ""}
          onChange={(e) =>
            onChange([value[0], Number(e.target.value), value[2]])
          }
          style={{ ...darkInputStyle, width: 60 }}
        />
        <input
          value={value[2] ?? ""}
          onChange={(e) =>
            onChange([value[0], value[1], Number(e.target.value)])
          }
          style={{ ...darkInputStyle, width: 60 }}
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
        style={{ ...darkTextareaStyle }}
      />
    );
  }

  return (
    <input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...darkInputStyle, width: "100%" }}
    />
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
    <div style={{ display: "grid", gap: 8, color: "#e2e8f0" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 12, color: subtleTextColor }}>Type</label>
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
          style={{ ...darkInputStyle }}
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
          style={{ ...darkInputStyle, width: 140 }}
        />
      )}

      {kind === "bool" && (
        <label
          style={{
            display: "inline-flex",
            gap: 6,
            alignItems: "center",
            fontSize: 12,
            color: subtleTextColor,
          }}
        >
          <input
            type="checkbox"
            checked={!!boolVal}
            onChange={(e) => {
              const b = e.target.checked;
              setBoolVal(b);
              onChange({ bool: b });
            }}
            style={{ accentColor: "#38bdf8" }}
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
            style={{ ...darkInputStyle, width: 60 }}
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
            style={{ ...darkInputStyle, width: 60 }}
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
            style={{ ...darkInputStyle, width: 60 }}
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
          style={{ ...darkInputStyle, width: "100%" }}
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
          style={{ ...darkInputStyle, width: "100%" }}
        />
      )}
    </div>
  );
}

type InputDefaultEntry = {
  value: any;
  shape?: Record<string, any> | null;
};

const CASE_LABEL_PLACEHOLDER = ["case_0", "case_1", "case_2"];

function CaseLabelsEditor({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (values: string[]) => void;
}) {
  const safeLabels = labels.length ? labels : CASE_LABEL_PLACEHOLDER;
  return (
    <div style={{ display: "grid", gap: 6, color: "#e2e8f0" }}>
      {safeLabels.map((label, index) => (
        <div
          key={`${index}_${label}`}
          style={{ display: "flex", gap: 6, alignItems: "center" }}
        >
          <input
            value={label}
            onChange={(e) => {
              const next = [...safeLabels];
              next[index] = e.target.value;
              onChange(
                next
                  .map((entry) => entry.trim())
                  .filter((entry) => entry.length > 0),
              );
            }}
            style={{ ...darkInputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => {
              const next = safeLabels
                .filter((_, idx) => idx !== index)
                .map((entry) => entry.trim())
                .filter((entry) => entry.length > 0);
              onChange(next);
            }}
            style={{ ...darkDangerButtonStyle, padding: "4px 10px" }}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const next = [...labels, `case_${labels.length}`];
          onChange(next);
        }}
        style={{ ...darkButtonStyle, justifySelf: "flex-start" }}
      >
        Add label
      </button>
    </div>
  );
}

const TYPED_PATH_TYPES = [
  "float",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "quat",
  "color",
  "transform",
  "vector",
  "text",
] as const;

function normalizeTypedPath(value: string | undefined): {
  type: string;
  path: string;
} {
  if (!value) {
    return { type: "float", path: "" };
  }
  const trimmed = value.trim();
  const idx = trimmed.indexOf(":");
  if (idx > 0) {
    const type = trimmed.slice(0, idx).toLowerCase();
    const path = trimmed.slice(idx + 1);
    return {
      type: TYPED_PATH_TYPES.includes(type as any) ? type : "float",
      path,
    };
  }
  return { type: "float", path: trimmed };
}

function buildTypedPath(type: string, path: string): string {
  const cleaned = path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/");
  return `${type}:${cleaned}`;
}

function TypedPathEditor({
  value,
  onChange,
}: {
  value?: string;
  onChange: (next: string) => void;
}) {
  const { type, path } = normalizeTypedPath(value);
  const [kind, setKind] = useState<string>(type);
  const [pathText, setPathText] = useState<string>(path);

  useEffect(() => {
    const { type: nextType, path: nextPath } = normalizeTypedPath(value);
    setKind(nextType);
    setPathText(nextPath);
  }, [value]);

  const invalid =
    pathText.trim().length === 0 ||
    /\s/.test(pathText) ||
    pathText.includes("//");

  return (
    <div style={{ display: "grid", gap: 6, color: "#e2e8f0" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <select
          value={kind}
          onChange={(event) => {
            const nextKind = event.target.value;
            setKind(nextKind);
            onChange(buildTypedPath(nextKind, pathText));
          }}
          style={{ ...darkInputStyle }}
        >
          {TYPED_PATH_TYPES.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
        <input
          value={pathText}
          onChange={(event) => {
            const nextPath = event.target.value;
            setPathText(nextPath);
            if (!/\s/.test(nextPath)) {
              onChange(buildTypedPath(kind, nextPath));
            }
          }}
          placeholder="namespace/channel/field"
          style={{ ...darkInputStyle, flex: 1 }}
        />
      </div>
      {invalid ? (
        <div style={{ fontSize: 11, color: "#fca5a5" }}>
          Path must not be empty or contain whitespace. Use "/" to separate
          segments.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: subtleTextColor }}>
          Result: <code>{buildTypedPath(kind, pathText)}</code>
        </div>
      )}
    </div>
  );
}

function defaultValueForPortType(portType: string): any {
  const normalized = String(portType ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (normalized.includes("bool")) return false;
  if (normalized.includes("vec4") || normalized.includes("quat"))
    return { vector: [0, 0, 0, 0] };
  if (normalized.includes("vec3")) return { vec3: [0, 0, 0] };
  if (normalized.includes("vec2")) return { vector: [0, 0] };
  if (normalized.includes("color")) return { vector: [0, 0, 0, 1] };
  if (normalized.includes("text")) return { text: "" };
  if (normalized.includes("transform"))
    return {
      transform: {
        translation: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    };
  return 0;
}

function InputDefaultEditor({
  entry,
  portType,
  onChange,
}: {
  entry: InputDefaultEntry | undefined;
  portType: string;
  onChange: (next: InputDefaultEntry | null) => void;
}) {
  const currentValue =
    entry && entry.value !== undefined
      ? entry.value
      : defaultValueForPortType(portType);

  React.useEffect(() => {
    if (!entry) {
      const seeded =
        currentValue && typeof currentValue === "object"
          ? cloneDeepSafe(currentValue)
          : currentValue;
      onChange({
        value: seeded,
        shape: null,
      });
    }
  }, [entry, currentValue, onChange]);

  return (
    <div style={{ display: "grid", gap: 6, color: "#e2e8f0" }}>
      <ValueParamEditor
        value={currentValue}
        onChange={(next) =>
          onChange({
            value: next,
            shape: entry?.shape ?? null,
          })
        }
      />
      <div style={{ fontSize: 11, color: "#94a3b8" }}>
        Fallback applies when the input has no upstream link. Values stage into
        the runtime (and orchestrator mirrors when `mirrorWrites` is enabled).
      </div>
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
  const { registry, getParamsForType, getPortsForType, getNodeSummary } =
    useRegistry();
  const runtime = useGraphRuntime();
  const runtimeReady = runtime.ready;
  const controlsDisabled = !runtimeReady;
  const { alert: showAlert } = useDialogQueue();

  const nodeSummary = useMemo(() => {
    if (!node) return null;
    return getNodeSummary?.(String(node.type ?? ""));
  }, [node, getNodeSummary]);

  // Inspector runtime debug hooks (must be declared unconditionally before any early returns)
  const handleEvalNow = useCallback(() => {
    if (!runtimeReady) return;
    try {
      const res = runtime.evalAll?.();
      console.log("[Inspector] EvalNow ->", res);
    } catch (err) {
      console.error("[Inspector] EvalNow error:", err);
    }
  }, [runtime, runtimeReady]);

  const spec = useEditorStore((s) => s.spec);
  const handleReloadGraph = useCallback(async () => {
    if (!runtimeReady) return;
    try {
      console.log(
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
        console.log("[Inspector] ReloadGraph -> evalAll result:", res);
      } else {
        console.warn("[Inspector] No spec available to load.");
      }
    } catch (err) {
      console.error("[Inspector] ReloadGraph error:", err);
    }
  }, [runtime, spec, runtimeReady]);

  const snapshot = runtime.getSnapshot?.();
  const nodeKeys = useMemo(
    () => Object.keys((snapshot as any)?.evalResult?.nodes ?? {}),
    [snapshot],
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

  const updateInputDefault = useCallback(
    (nodeId: string, portId: string, entry: InputDefaultEntry | null) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const data = { ...(n.data || {}) };
          const defaults =
            data.input_defaults && typeof data.input_defaults === "object"
              ? {
                  ...(data.input_defaults as Record<string, InputDefaultEntry>),
                }
              : {};

          if (entry && entry.value !== undefined) {
            defaults[portId] = {
              value: entry.value,
              shape: entry.shape ?? null,
            };
          } else {
            delete defaults[portId];
          }

          if (Object.keys(defaults).length > 0) {
            data.input_defaults = defaults;
          } else {
            delete data.input_defaults;
          }

          return { ...n, data };
        }),
      );
    },
    [setNodes],
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
            data:
              typeof inp.selector === "string" && inp.selector.trim().length > 0
                ? { selector: inp.selector.trim() }
                : undefined,
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
        basePortId?: string | null;
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
          const basePortId =
            typeof mapping.basePortId === "string" && mapping.basePortId
              ? mapping.basePortId
              : (parseVariadicPortId(portId)?.groupId ?? portId);
          const entry = {
            portId,
            basePortId,
            sourceNodeId: mapping.sourceNodeId ?? null,
            sourceOutputKey: mapping.sourceOutputKey ?? null,
            selector:
              typeof mapping.selector === "string"
                ? mapping.selector.trim() || null
                : null,
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
      void showAlert(`Invalid JSON: ${parsed.error}`);
      return;
    }
    const obj = parsed.value;
    if (!obj || typeof obj !== "object" || !obj.id) {
      void showAlert("JSON must be an object with an 'id' field.");
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
  }, [node, rawJson, setNodes, setEdges, setSelected, showAlert]);

  // Live outputs snapshot for display
  const outputsSnapshot = useNodeOutputs(node?.id ?? "");
  console.log("[IP] Outputs Snapshot", node?.id, outputsSnapshot);

  if (!node) {
    return (
      <aside style={{ padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>Inspector</h3>
        <div style={{ color: subtleTextColor, fontSize: 13 }}>
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
          style={{
            marginLeft: "auto",
            ...darkSecondaryButtonStyle,
          }}
        >
          Deselect
        </button>
      </div>

      {/* Runtime debug controls */}
      <section
        style={{
          ...darkSectionStyle,
          marginBottom: 10,
        }}
      >
        <div style={{ fontSize: 12, color: "#e2e8f0", marginBottom: 6 }}>
          Runtime ready: <strong>{String(runtime.ready)}</strong> · Playback:{" "}
          <strong>{runtime.getPlaybackMode?.()}</strong> · Snapshot v
          <strong>{(snapshot as any)?.version ?? 0}</strong>
        </div>
        <div style={{ fontSize: 12, color: subtleTextColor, marginBottom: 6 }}>
          Eval nodes keys:{" "}
          <code>{nodeKeys.length ? nodeKeys.join(", ") : "(none)"}</code>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={handleEvalNow}
            style={{
              ...darkSecondaryButtonStyle,
              padding: "6px 10px",
              opacity: controlsDisabled ? 0.55 : 1,
              cursor: controlsDisabled ? "not-allowed" : "pointer",
            }}
            disabled={controlsDisabled}
          >
            Eval Now
          </button>
          <button
            onClick={handleReloadGraph}
            style={{
              ...darkSecondaryButtonStyle,
              padding: "6px 10px",
              opacity: controlsDisabled ? 0.55 : 1,
              cursor: controlsDisabled ? "not-allowed" : "pointer",
            }}
            disabled={controlsDisabled}
          >
            Reload Graph
          </button>
        </div>
      </section>

      {/* Identity */}
      <section style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>{node.data?.label ?? node.type}</div>
        <div
          style={{ color: subtleTextColor, fontSize: 12 }}
        >{`ID: ${node.id}`}</div>
        <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
          <label style={{ fontSize: 12, color: subtleTextColor }}>ID</label>
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
            style={{ ...darkInputStyle, width: "100%" }}
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
              style={{ ...darkButtonStyle }}
            >
              Apply ID (from JSON)
            </button>
          </div>
        </div>
      </section>

      {/* Type */}
      <section style={{ marginBottom: 12 }}>
        <label
          style={{
            display: "block",
            fontSize: 12,
            marginBottom: 6,
            color: subtleTextColor,
          }}
        >
          Type
        </label>
        {(() => {
          const originalType =
            typeof node.data?.originalType === "string" &&
            node.data.originalType.length > 0
              ? node.data.originalType
              : "";
          const selectValue = originalType || node.type || "";
          return (
            <select
              value={selectValue}
              onChange={(e) => {
                const newType = e.target.value;
                const normalized =
                  newType && newType.trim().length > 0
                    ? newType.trim().toLowerCase()
                    : "";
                setNodes((prev) =>
                  prev.map((n) => {
                    if (n.id !== node.id) return n;
                    const data = { ...(n.data || {}) };
                    data.originalType = newType;
                    return { ...n, type: normalized, data };
                  }),
                );
              }}
              style={{ ...darkInputStyle, width: "100%" }}
            >
              <option value={selectValue}>
                {selectValue || "(unknown type)"}
              </option>
              {registry?.nodes?.map((t: any) => {
                const optionVal =
                  (t.type_id && String(t.type_id)) ||
                  (t.id && String(t.id)) ||
                  "";
                if (!optionVal) return null;
                return (
                  <option key={optionVal} value={optionVal}>
                    {t.name ?? optionVal}
                  </option>
                );
              })}
            </select>
          );
        })()}
        {nodeSummary?.category ? (
          <div style={{ fontSize: 12, color: "#9aa0a6", marginTop: 6 }}>
            Category: {nodeSummary.category}
          </div>
        ) : null}
        {nodeSummary?.doc ? (
          <div style={{ fontSize: 12, color: subtleTextColor, marginTop: 6 }}>
            {nodeSummary.doc}
          </div>
        ) : null}
      </section>

      {/* Params */}
      <section style={{ marginBottom: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Params</h4>
        {paramsSpec.length === 0 ? (
          <div style={{ color: subtleTextColor }}>
            No structured params for this node type.
          </div>
        ) : (
          paramsSpec.map((p) => {
            const current = (node.data?.params ?? {})[p.id];
            let editor: ReactNode;
            if (p.id === "value") {
              editor = (
                <ValueParamEditor
                  value={current}
                  onChange={(v) => updateNodeParam(node.id, p.id, v)}
                />
              );
            } else if (p.id === "case_labels") {
              const labels = Array.isArray(current)
                ? (current as unknown[])
                    .map((entry) => String(entry ?? ""))
                    .filter((entry) => entry.length > 0)
                : [];
              editor = (
                <CaseLabelsEditor
                  labels={labels}
                  onChange={(next) => updateNodeParam(node.id, p.id, next)}
                />
              );
            } else if (p.id === "path") {
              editor = (
                <TypedPathEditor
                  value={typeof current === "string" ? current : ""}
                  onChange={(next) => updateNodeParam(node.id, p.id, next)}
                />
              );
            } else {
              editor = renderParamEditor(p, current, (v) =>
                updateNodeParam(node.id, p.id, v),
              );
            }
            return (
              <div key={p.id} style={{ marginBottom: 10 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 12,
                    marginBottom: 4,
                    color: subtleTextColor,
                  }}
                >
                  {p.name ?? p.id}
                </label>
                <div>{editor}</div>
                {(p.doc || p.editorHints?.description) && (
                  <div style={{ fontSize: 11, color: "#9aa0a6", marginTop: 4 }}>
                    {p.doc ?? p.editorHints?.description}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* Inputs */}
      <section style={{ marginBottom: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Inputs</h4>
        {portsSpec.inputs.length === 0 ? (
          <div style={{ color: subtleTextColor }}>
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
              const inputDefaultEntry =
                node.data?.input_defaults &&
                typeof node.data.input_defaults === "object"
                  ? (
                      node.data.input_defaults as Record<
                        string,
                        InputDefaultEntry
                      >
                    )[port.id]
                  : undefined;
              return (
                <div
                  key={port.id}
                  style={{
                    ...darkSectionStyle,
                    marginBottom: 8,
                    color: "#e2e8f0",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontWeight: 700,
                    }}
                  >
                    {port.label ?? port.name}
                    {port.optional ? (
                      <span style={darkAccentBadgeStyle}>optional</span>
                    ) : null}
                  </div>
                  <div
                    style={{ fontSize: 12, color: subtleTextColor }}
                  >{`port: ${port.id} — type: ${port.type}`}</div>
                  {port.doc ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: subtleTextColor,
                        marginTop: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {port.doc}
                    </div>
                  ) : null}

                  <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                    {(() => {
                      const hasSourceNode =
                        typeof mapping?.sourceNodeId === "string" &&
                        mapping.sourceNodeId.length > 0;
                      const hasSourceOutput =
                        typeof mapping?.sourceOutputKey === "string" &&
                        mapping.sourceOutputKey.length > 0;
                      return (
                        <>
                          <div>
                            <label
                              style={{ fontSize: 12, color: subtleTextColor }}
                            >
                              Source node
                            </label>
                            <select
                              value={mapping?.sourceNodeId ?? ""}
                              onChange={(e) =>
                                updateNodeInput(node.id, port.id, {
                                  sourceNodeId: e.target.value || null,
                                  sourceOutputKey: null,
                                  selector: null,
                                  basePortId: port.id,
                                })
                              }
                              style={{ ...darkInputStyle, width: "100%" }}
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

                          {hasSourceNode ? (
                            <div>
                              <label
                                style={{ fontSize: 12, color: subtleTextColor }}
                              >
                                Source output key
                              </label>
                              <select
                                value={mapping?.sourceOutputKey ?? ""}
                                onChange={(e) =>
                                  updateNodeInput(node.id, port.id, {
                                    sourceNodeId: mapping?.sourceNodeId ?? null,
                                    sourceOutputKey: e.target.value || null,
                                    selector: null,
                                    basePortId: port.id,
                                  })
                                }
                                style={{ ...darkInputStyle, width: "100%" }}
                              >
                                <option value="">(none)</option>
                                {mapping?.sourceNodeId
                                  ? (() => {
                                      const src = nodes.find(
                                        (nn) => nn.id === mapping.sourceNodeId,
                                      );
                                      const srcPorts = src
                                        ? (getPortsForType?.(
                                            String(src.type ?? ""),
                                          )?.outputs ?? [])
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
                          ) : null}

                          {hasSourceOutput ? (
                            <div>
                              <label
                                style={{ fontSize: 12, color: subtleTextColor }}
                              >
                                Selector (optional)
                              </label>
                              <input
                                value={mapping?.selector ?? ""}
                                onChange={(e) =>
                                  updateNodeInput(node.id, port.id, {
                                    sourceNodeId: mapping?.sourceNodeId ?? null,
                                    sourceOutputKey:
                                      mapping?.sourceOutputKey ?? null,
                                    selector: e.target.value || null,
                                    basePortId: port.id,
                                  })
                                }
                                style={{ ...darkInputStyle, width: "100%" }}
                              />
                            </div>
                          ) : null}
                        </>
                      );
                    })()}

                    <div>
                      <label style={{ fontSize: 12, color: subtleTextColor }}>
                        Fallback value
                      </label>
                      <InputDefaultEditor
                        entry={inputDefaultEntry}
                        portType={port.type}
                        onChange={(next) =>
                          updateInputDefault(node.id, port.id, next)
                        }
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
                ...darkSectionStyle,
                marginTop: 8,
                color: "#e2e8f0",
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {portsSpec.variadicInputs.label ?? portsSpec.variadicInputs.id}{" "}
                (variadic)
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: subtleTextColor,
                  marginBottom: 8,
                }}
              >
                {`type: ${portsSpec.variadicInputs.type}  min: ${portsSpec.variadicInputs.min ?? 0} ${portsSpec.variadicInputs.max ? `max: ${portsSpec.variadicInputs.max}` : ""}`}
              </div>
              {portsSpec.variadicInputs.doc ? (
                <div
                  style={{
                    fontSize: 12,
                    color: subtleTextColor,
                    marginBottom: 8,
                    lineHeight: 1.4,
                  }}
                >
                  {portsSpec.variadicInputs.doc}
                </div>
              ) : null}

              {/* list existing variadic mappings */}
              {Array.isArray(node.data?.inputs)
                ? node.data.inputs
                    .filter((i: any) => {
                      const portId = String(i.portId ?? "");
                      const baseId = String(
                        i.basePortId ?? portsSpec.variadicInputs!.id ?? portId,
                      );
                      const groupId = String(
                        portsSpec.variadicInputs!.id ?? "",
                      );
                      const parsed = parseVariadicPortId(portId);
                      return (
                        (parsed?.groupId === groupId &&
                          Number.isFinite(parsed?.index)) ||
                        baseId === groupId
                      );
                    })
                    .map((m: any, idx: number) => {
                      const hasSourceNode =
                        typeof m.sourceNodeId === "string" &&
                        m.sourceNodeId.length > 0;
                      const hasSourceOutput =
                        typeof m.sourceOutputKey === "string" &&
                        m.sourceOutputKey.length > 0;
                      return (
                        <div
                          key={m.portId}
                          style={{
                            ...darkCardStyle,
                            padding: 8,
                            marginBottom: 6,
                            color: "#e2e8f0",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              color: subtleTextColor,
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
                                  basePortId:
                                    m.basePortId ??
                                    portsSpec.variadicInputs?.id ??
                                    m.portId,
                                })
                              }
                              style={{ ...darkInputStyle, width: "100%" }}
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

                            {hasSourceNode ? (
                              <select
                                value={m.sourceOutputKey ?? ""}
                                onChange={(e) =>
                                  updateNodeInput(node.id, m.portId, {
                                    sourceNodeId: m.sourceNodeId ?? null,
                                    sourceOutputKey: e.target.value || null,
                                    selector: null,
                                    basePortId:
                                      m.basePortId ??
                                      portsSpec.variadicInputs?.id ??
                                      m.portId,
                                  })
                                }
                                style={{ ...darkInputStyle, width: "100%" }}
                              >
                                <option value="">(none)</option>
                                {m.sourceNodeId
                                  ? (() => {
                                      const src = nodes.find(
                                        (nn) => nn.id === m.sourceNodeId,
                                      );
                                      const srcPorts = src
                                        ? (getPortsForType?.(
                                            String(src.type ?? ""),
                                          )?.outputs ?? [])
                                        : [];
                                      return srcPorts.map((op: any) => (
                                        <option key={op.id} value={op.id}>
                                          {op.label ?? op.name ?? op.id}
                                        </option>
                                      ));
                                    })()
                                  : null}
                              </select>
                            ) : null}

                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              {hasSourceOutput ? (
                                <input
                                  value={m.selector ?? ""}
                                  onChange={(e) =>
                                    updateNodeInput(node.id, m.portId, {
                                      sourceNodeId: m.sourceNodeId ?? null,
                                      sourceOutputKey:
                                        m.sourceOutputKey ?? null,
                                      selector: e.target.value || null,
                                      basePortId:
                                        m.basePortId ??
                                        portsSpec.variadicInputs?.id ??
                                        m.portId,
                                    })
                                  }
                                  style={{ ...darkInputStyle, flex: 1 }}
                                  placeholder="selector (optional)"
                                />
                              ) : null}
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
                                  ...darkDangerButtonStyle,
                                  padding: "6px 10px",
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                : null}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => {
                    const groupId = String(portsSpec.variadicInputs!.id);
                    const nextIdx = nextVariadicIndex(
                      node.data?.inputs ?? [],
                      groupId,
                    );
                    const newPortId = formatVariadicPortId(groupId, nextIdx);
                    updateNodeInput(node.id, newPortId, {
                      sourceNodeId: null,
                      sourceOutputKey: null,
                      selector: null,
                      basePortId: groupId,
                    });
                  }}
                  style={{ ...darkButtonStyle }}
                >
                  Add {portsSpec.variadicInputs.label ?? "item"}
                </button>
              </div>
            </div>
          ) : null}
        </>
        <div style={{ fontSize: 12, color: subtleTextColor }}>
          Changes to inputs will update the node's NodeSpec mapping; use export
          to persist the canonical spec.
        </div>
        {String(node.type ?? "")
          .toLowerCase()
          .includes("input") ? (
          <div
            style={{
              fontSize: 11,
              color: subtleTextColor,
              marginTop: 8,
              background: "rgba(15,23,42,0.75)",
              border: "1px solid rgba(148,163,184,0.35)",
              padding: "8px 10px",
              borderRadius: 6,
            }}
          >
            Runtime defaults and staged values will mirror into orchestrator
            frames only when the controller enables{" "}
            <code>subs.mirrorWrites</code>. Keep this in mind when wiring graphs
            into shared blackboards.
          </div>
        ) : null}
      </section>

      {/* Output shape & live outputs */}
      <section style={{ marginTop: 12 }}>
        <h4 style={{ marginBottom: 8 }}>Output shape & Live outputs</h4>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: subtleTextColor }}>
            Declared outputs
          </div>
          {portsSpec.outputs.length === 0 ? (
            <div style={{ color: subtleTextColor }}>No declared outputs</div>
          ) : (
            portsSpec.outputs.map((o) => (
              <div key={o.id} style={{ marginBottom: 6 }}>
                <div>{`${o.id} : ${o.type}`}</div>
                {o.doc ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: subtleTextColor,
                      lineHeight: 1.35,
                    }}
                  >
                    {o.doc}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <div
            style={{ fontSize: 12, color: subtleTextColor, marginBottom: 6 }}
          >
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
                  <div style={{ color: subtleTextColor }}>{typeof v}</div>
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
            <div style={{ color: subtleTextColor }}>
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
          style={{ ...darkTextareaStyle, width: "100%" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={applyRawJsonToNode} style={{ ...darkButtonStyle }}>
            Apply JSON to Node
          </button>
          <button
            onClick={() => {
              // reset JSON to current node
              setRawJson(JSON.stringify(node, null, 2));
            }}
            style={{ ...darkSecondaryButtonStyle }}
          >
            Reset JSON
          </button>
        </div>
      </section>
    </aside>
  );
}
