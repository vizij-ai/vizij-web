import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, KeyboardEvent, SyntheticEvent } from "react";
import type { GraphSpec } from "@vizij/node-graph";
import {
  EXPRESSION_FUNCTION_VOCABULARY,
  RESERVED_EXPRESSION_VARIABLES,
  SCALAR_FUNCTIONS,
  parseControlExpression,
  type ControlExpressionNode,
  type ExpressionValueType,
  type ScalarFunctionDefinition,
  type ScalarFunctionVocabularyEntry,
} from "@vizij/node-graph-authoring";
import type { JSX } from "react/jsx-runtime";
import {
  buildExpressionGraph,
  type ExpressionGraphResult,
  type ExpressionSlotConfig,
} from "../utils/expressionAuthoring";
import { useEditorStore } from "../store/useEditorStore";

const MAX_SLOTS = 6;

type SlotFormState = ExpressionSlotConfig & { key: string };

type SelectionRange = {
  start: number;
  end: number;
};

type FlowNodeAccent =
  | "output"
  | "function"
  | "operator"
  | "reference"
  | "literal"
  | "vector";

interface FlowRenderableNode {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  accent: FlowNodeAccent;
  streamLabel?: string;
  children: FlowRenderableNode[];
}

interface FlowPreviewState {
  root: FlowRenderableNode | null;
  message: string | null;
}

type CompileState =
  | { state: "idle" }
  | { state: "working" }
  | { state: "error"; message: string }
  | { state: "success"; mode: IntegrationMode; result: ExpressionGraphResult };

type IntegrationMode = "replace" | "append";

function createSlot(index: number): SlotFormState {
  const alias = `s${index + 1}`;
  return {
    key: `${Date.now().toString(36)}_${index}`,
    alias,
    label: `Control ${String.fromCharCode(65 + index)}`,
    path: `/expression/${alias}`,
    group: "expression",
    min: -1,
    max: 1,
    defaultValue: 0,
    valueType: "scalar",
  };
}

const DEFAULT_SLOTS: SlotFormState[] = [createSlot(0), createSlot(1)];

const FLOW_ACCENT_COLORS: Record<FlowNodeAccent, string> = {
  output: "#34d399",
  function: "#818cf8",
  operator: "#f472b6",
  reference: "#38bdf8",
  literal: "#facc15",
  vector: "#f97316",
};

const FLOW_LINE_COLOR = "rgba(148,163,184,0.45)";

const BINARY_OPERATOR_METADATA: Record<
  string,
  { title: string; description: string }
> = {
  "+": { title: "Add", description: "Sum left and right inputs." },
  "-": { title: "Subtract", description: "Left minus right." },
  "*": { title: "Multiply", description: "Multiply operands." },
  "/": { title: "Divide", description: "Left divided by right." },
  ">": { title: "Greater Than", description: "1 when left > right." },
  "<": { title: "Less Than", description: "1 when left < right." },
  "==": { title: "Equal", description: "1 when values match." },
  "!=": { title: "Not Equal", description: "1 when values differ." },
  "&&": { title: "All True", description: "Logical AND." },
  "||": { title: "Any True", description: "Logical OR." },
};

const UNARY_OPERATOR_METADATA: Record<
  string,
  { title: string; description: string }
> = {
  "-": { title: "Negate", description: "Flip the sign of the input." },
  "+": { title: "Identity", description: "Pass input through." },
  "!": { title: "Not", description: "Logical NOT." },
};

export default function ExpressionAuthoringPanel(): JSX.Element {
  const [expression, setExpression] = useState("s1");
  const [slots, setSlots] = useState<SlotFormState[]>(DEFAULT_SLOTS);
  const [mode, setMode] = useState<IntegrationMode>("replace");
  const [state, setState] = useState<CompileState>({ state: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [selectionRange, setSelectionRange] = useState<SelectionRange>({
    start: 0,
    end: 0,
  });
  const [isHintSuppressed, setIsHintSuppressed] = useState(false);
  const [highlightedHintIndex, setHighlightedHintIndex] = useState(0);

  const functionToken = useMemo(
    () => deriveFunctionToken(expression, selectionRange),
    [expression, selectionRange],
  );
  const enclosingFunctionToken = useMemo(
    () => deriveEnclosingFunctionToken(expression, selectionRange),
    [expression, selectionRange],
  );
  const helperFunctionToken = functionToken ?? enclosingFunctionToken;
  const tokenAnchor = helperFunctionToken
    ? `${helperFunctionToken.token}:${helperFunctionToken.start}`
    : "__none__";
  const functionSuggestions = useMemo(() => {
    if (!functionToken || isHintSuppressed) {
      return [];
    }
    return buildFunctionSuggestions(functionToken.token);
  }, [functionToken, isHintSuppressed]);
  const helperSuggestion = useMemo(() => {
    if (!helperFunctionToken) {
      return null;
    }
    return buildHelperSuggestion(helperFunctionToken.token);
  }, [helperFunctionToken]);
  const showFunctionHints =
    Boolean(functionToken) && functionSuggestions.length > 0;

  useEffect(() => {
    if (highlightedHintIndex >= functionSuggestions.length) {
      setHighlightedHintIndex(0);
    }
  }, [functionSuggestions.length, highlightedHintIndex]);

  useEffect(() => {
    setHighlightedHintIndex(0);
    setIsHintSuppressed(false);
  }, [tokenAnchor]);

  const setSpec = useEditorStore((s) => s.setSpec);
  const specToNodes = useEditorStore((s) => s.specToNodes);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setEdges = useEditorStore((s) => s.setEdges);

  const aliasList = useMemo(
    () => slots.map((slot, idx) => slot.alias?.trim() || `s${idx + 1}`),
    [slots],
  );

  const flowPreview = useMemo<FlowPreviewState>(() => {
    const trimmed = expression.trim();
    if (!trimmed.length) {
      return { root: null, message: "Start typing to preview the flow." };
    }
    const parsed = parseControlExpression(trimmed);
    if (!parsed.node || parsed.errors.length) {
      return {
        root: null,
        message: parsed.errors[0]?.message ?? "Expression has syntax errors.",
      };
    }
    return {
      root: buildExpressionFlowTree(parsed.node, aliasList),
      message: null,
    };
  }, [aliasList, expression]);

  const flowDiagramRoot = flowPreview.root;
  const flowPreviewMessage = flowPreview.message;

  const syncSelectionFromTarget = useCallback((target: HTMLTextAreaElement) => {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? start;
    setSelectionRange({ start, end });
  }, []);

  const handleExpressionChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setExpression(event.target.value);
      syncSelectionFromTarget(event.target);
      setIsHintSuppressed(false);
    },
    [syncSelectionFromTarget],
  );

  const handleExpressionPointer = useCallback(
    (event: SyntheticEvent<HTMLTextAreaElement>) => {
      syncSelectionFromTarget(event.currentTarget);
    },
    [syncSelectionFromTarget],
  );

  const commitFunctionSuggestion = useCallback(
    (suggestion: FunctionHintSuggestion) => {
      if (!functionToken) {
        return;
      }
      const insertionName = suggestion.entry.name;
      const snippet = `${insertionName}()`;
      const nextCaretPosition = functionToken.start + insertionName.length + 1;
      const nextValue =
        expression.slice(0, functionToken.start) +
        snippet +
        expression.slice(functionToken.end);
      setExpression(nextValue);
      scheduleSelectionUpdate(() => {
        if (!textareaRef.current) {
          return;
        }
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          nextCaretPosition,
          nextCaretPosition,
        );
        setSelectionRange({ start: nextCaretPosition, end: nextCaretPosition });
      });
      setHighlightedHintIndex(0);
    },
    [expression, functionToken],
  );

  const handleExpressionKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showFunctionHints || !functionSuggestions.length) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlightedHintIndex(
          (prev) => (prev + 1) % functionSuggestions.length,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlightedHintIndex(
          (prev) =>
            (prev - 1 + functionSuggestions.length) %
            functionSuggestions.length,
        );
        return;
      }
      if (
        event.key === "Enter" ||
        (event.key === "Tab" && !event.shiftKey && !event.altKey)
      ) {
        const candidate =
          functionSuggestions[highlightedHintIndex] ?? functionSuggestions[0];
        if (candidate) {
          event.preventDefault();
          commitFunctionSuggestion(candidate);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setIsHintSuppressed(true);
      }
    },
    [
      commitFunctionSuggestion,
      functionSuggestions,
      highlightedHintIndex,
      showFunctionHints,
    ],
  );

  const resetForm = useCallback(() => {
    setSlots([createSlot(0), createSlot(1)]);
    setExpression("s1");
    setState({ state: "idle" });
  }, []);

  const updateSlot = useCallback(
    (key: string, field: keyof SlotFormState, value: string | number) => {
      setSlots((prev) =>
        prev.map((slot) => {
          if (slot.key !== key) return slot;
          let nextValue: unknown = value;
          if (field === "min" || field === "max" || field === "defaultValue") {
            if (value === "" || value === null) {
              nextValue = undefined;
            } else {
              const numeric = typeof value === "number" ? value : Number(value);
              nextValue = Number.isFinite(numeric) ? numeric : slot[field];
            }
          } else if (typeof value !== "string") {
            nextValue = String(value ?? "");
          }
          return {
            ...slot,
            [field]: nextValue,
          };
        }),
      );
    },
    [],
  );

  const removeSlot = useCallback((key: string) => {
    setSlots((prev) =>
      prev.length > 1 ? prev.filter((slot) => slot.key !== key) : prev,
    );
  }, []);

  const addSlot = useCallback(() => {
    setSlots((prev) => {
      if (prev.length >= MAX_SLOTS) return prev;
      return [...prev, createSlot(prev.length)];
    });
  }, []);

  const appendGraphSpec = useCallback(
    (graph: GraphSpec) => {
      const converted = specToNodes(graph);
      if (!converted.nodes.length) {
        return { appended: false };
      }
      const prefix = `expr_${Math.random().toString(36).slice(2, 7)}`;
      const idMap = new Map<string, string>();
      converted.nodes.forEach((node, idx) => {
        const originalId = String(node.id ?? idx);
        idMap.set(originalId, `${prefix}_${originalId}`);
      });

      const existingNodes = useEditorStore.getState().nodes ?? [];
      const maxX = existingNodes.reduce((acc, node) => {
        const x = typeof node.position?.x === "number" ? node.position!.x : acc;
        return Math.max(acc, x);
      }, 0);
      const offsetX = existingNodes.length > 0 ? maxX + 280 : 0;

      const remappedNodes = converted.nodes.map((node, idx) => {
        const newId = idMap.get(String(node.id ?? idx)) ?? `${prefix}_${idx}`;
        const remappedInputs = Array.isArray(node.data?.inputs)
          ? node.data.inputs.map((entry: any) => {
              if (!entry || typeof entry !== "object") return entry;
              const nextSource = entry.sourceNodeId
                ? (idMap.get(String(entry.sourceNodeId)) ?? entry.sourceNodeId)
                : entry.sourceNodeId;
              return {
                ...entry,
                sourceNodeId: nextSource,
              };
            })
          : [];
        return {
          ...node,
          id: newId,
          position: {
            x: (node.position?.x ?? 0) + offsetX,
            y: node.position?.y ?? 0,
          },
          positionAbsolute: undefined,
          data: {
            ...node.data,
            inputs: remappedInputs,
          },
        };
      });

      const remappedEdges = converted.edges.map((edge, idx) => ({
        ...edge,
        id: `${prefix}_${edge.id ?? idx}`,
        source: idMap.get(String(edge.source)) ?? edge.source,
        target: idMap.get(String(edge.target)) ?? edge.target,
      }));

      setNodes((prev) => [...prev, ...remappedNodes]);
      setEdges((prev) => [...prev, ...remappedEdges]);
      return { appended: true, nodeCount: remappedNodes.length };
    },
    [setEdges, setNodes, specToNodes],
  );

  const compileExpression = useCallback(() => {
    setState({ state: "working" });
    try {
      const slotPayloads: ExpressionSlotConfig[] = slots.map((slot, idx) => ({
        alias: slot.alias?.trim() || `s${idx + 1}`,
        label: slot.label,
        path: slot.path,
        group: slot.group,
        min: typeof slot.min === "number" ? slot.min : undefined,
        max: typeof slot.max === "number" ? slot.max : undefined,
        defaultValue:
          typeof slot.defaultValue === "number" ? slot.defaultValue : undefined,
        valueType: slot.valueType,
        id: slot.id,
      }));

      const result = buildExpressionGraph({
        expression,
        slots: slotPayloads,
      });

      if (mode === "replace") {
        setSpec(result.spec);
        setState({ state: "success", mode, result });
        return;
      }
      const appendResult = appendGraphSpec(result.spec);
      if (!appendResult.appended) {
        throw new Error("Graph emitted no nodes.");
      }
      setState({ state: "success", mode, result });
    } catch (err) {
      setState({
        state: "error",
        message:
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Failed to build expression graph.",
      });
    }
  }, [appendGraphSpec, expression, mode, setSpec, slots]);

  const disabled = state.state === "working";

  const issueList = useMemo(() => {
    if (state.state !== "success") return [];
    const fatal = state.result.issues?.fatal ?? [];
    const targetedEntries = Object.entries(
      (state.result.issues?.byTarget ?? {}) as Record<string, string[]>,
    );
    const targeted = targetedEntries.flatMap(([target, messages]) =>
      (messages ?? []).map((msg) => `${target}: ${msg}`),
    );
    return [...fatal, ...targeted];
  }, [state]);

  const irStats = useMemo(() => {
    if (state.state !== "success" || !state.result.ir?.graph) return null;
    const irGraph = state.result.ir.graph;
    const nodeCount = irGraph.nodes?.length ?? 0;
    const edgeCount = irGraph.edges?.length ?? 0;
    return `${nodeCount} IR nodes • ${edgeCount} IR edges`;
  }, [state]);

  return (
    <section
      style={{
        background: "rgba(15,23,42,0.85)",
        border: "1px solid rgba(148,163,184,0.35)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        color: "#e2e8f0",
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <div
          style={{ fontSize: 13, textTransform: "uppercase", color: "#38bdf8" }}
        >
          IR Authoring
        </div>
        <h3 style={{ margin: "4px 0 0", fontSize: 16 }}>Expression Builder</h3>
        <p style={{ marginTop: 6, fontSize: 12, color: "#94a3b8" }}>
          Describe control expressions with node-graph authoring utilities and
          push the generated IR / GraphSpec directly onto the canvas.
        </p>
      </header>

      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="expression-textarea"
          style={{ display: "block", fontSize: 12 }}
        >
          Expression ({aliasList.join(", ")})
        </label>
        <div style={{ position: "relative", marginTop: 4 }}>
          <textarea
            ref={textareaRef}
            id="expression-textarea"
            value={expression}
            onChange={handleExpressionChange}
            onSelect={handleExpressionPointer}
            onClick={handleExpressionPointer}
            onMouseUp={handleExpressionPointer}
            onKeyDown={handleExpressionKeyDown}
            onKeyUp={handleExpressionPointer}
            rows={3}
            style={{
              width: "100%",
              borderRadius: 6,
              border: "1px solid rgba(148,163,184,0.45)",
              background: "rgba(2,6,23,0.65)",
              color: "inherit",
              padding: 8,
              fontFamily: "monospace",
            }}
          />
          {!isHintSuppressed && helperFunctionToken && helperSuggestion ? (
            <FunctionHintOverlay
              suggestions={showFunctionHints ? functionSuggestions : []}
              highlightedIndex={highlightedHintIndex}
              onHighlight={setHighlightedHintIndex}
              onSelect={commitFunctionSuggestion}
              fallbackSuggestion={helperSuggestion}
            />
          ) : null}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            color: "#38bdf8",
            letterSpacing: 0.4,
            marginBottom: 6,
          }}
        >
          Flow Visualizer
        </div>
        {flowDiagramRoot ? (
          <ExpressionFlowDiagram root={flowDiagramRoot} />
        ) : (
          <div
            style={{
              borderRadius: 8,
              border: "1px dashed rgba(148,163,184,0.5)",
              padding: "10px 12px",
              background: "rgba(2,6,23,0.35)",
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            {flowPreviewMessage ??
              "Flow preview will appear once the expression parses successfully."}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {slots.map((slot, idx) => (
          <div
            key={slot.key}
            style={{
              border: "1px solid rgba(71,85,105,0.6)",
              borderRadius: 8,
              padding: 8,
              background: "rgba(15,23,42,0.9)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <strong style={{ fontSize: 13 }}>Slot {idx + 1}</strong>
              <button
                type="button"
                onClick={() => removeSlot(slot.key)}
                disabled={slots.length <= 1}
                style={{
                  background: "transparent",
                  border: "none",
                  color: slots.length <= 1 ? "#475569" : "#f87171",
                  cursor: slots.length <= 1 ? "not-allowed" : "pointer",
                  fontSize: 12,
                }}
              >
                Remove
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input
                placeholder="Alias"
                value={slot.alias ?? ``}
                onChange={(e) => updateSlot(slot.key, "alias", e.target.value)}
                style={{
                  borderRadius: 6,
                  border: "1px solid rgba(51,65,85,0.8)",
                  background: "rgba(15,23,42,0.6)",
                  color: "inherit",
                  padding: "4px 6px",
                }}
              />
              <input
                placeholder="Path (/expression/alpha)"
                value={slot.path ?? ""}
                onChange={(e) => updateSlot(slot.key, "path", e.target.value)}
                style={{
                  borderRadius: 6,
                  border: "1px solid rgba(51,65,85,0.8)",
                  background: "rgba(15,23,42,0.6)",
                  color: "inherit",
                  padding: "4px 6px",
                }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  placeholder="Default"
                  value={slot.defaultValue ?? 0}
                  onChange={(e) =>
                    updateSlot(slot.key, "defaultValue", e.target.value)
                  }
                  style={{ ...numberInputStyle }}
                />
                <input
                  type="number"
                  placeholder="Min"
                  value={slot.min ?? -1}
                  onChange={(e) => updateSlot(slot.key, "min", e.target.value)}
                  style={{ ...numberInputStyle }}
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={slot.max ?? 1}
                  onChange={(e) => updateSlot(slot.key, "max", e.target.value)}
                  style={{ ...numberInputStyle }}
                />
              </div>
              <select
                value={slot.valueType ?? "scalar"}
                onChange={(e) =>
                  updateSlot(slot.key, "valueType", e.target.value)
                }
                style={{
                  borderRadius: 6,
                  border: "1px solid rgba(51,65,85,0.8)",
                  background: "rgba(15,23,42,0.6)",
                  color: "inherit",
                  padding: "4px 6px",
                }}
              >
                <option value="scalar">Scalar</option>
                <option value="vector">Vector</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={addSlot}
          disabled={slots.length >= MAX_SLOTS}
          style={{
            flex: 1,
            borderRadius: 6,
            border: "1px solid rgba(59,130,246,0.4)",
            background: "rgba(59,130,246,0.2)",
            color: "#bfdbfe",
            cursor: slots.length >= MAX_SLOTS ? "not-allowed" : "pointer",
            padding: "6px 8px",
          }}
        >
          + Slot
        </button>
        <button
          type="button"
          onClick={resetForm}
          style={{
            flex: 1,
            borderRadius: 6,
            border: "1px solid rgba(148,163,184,0.4)",
            background: "rgba(148,163,184,0.1)",
            color: "#e2e8f0",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 12 }}>Load Mode</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {(["replace", "append"] as IntegrationMode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              style={{
                flex: 1,
                borderRadius: 6,
                border:
                  mode === value
                    ? "1px solid rgba(16,185,129,0.7)"
                    : "1px solid rgba(51,65,85,0.8)",
                background:
                  mode === value
                    ? "rgba(16,185,129,0.25)"
                    : "rgba(15,23,42,0.6)",
                color: "inherit",
                cursor: "pointer",
                padding: "6px 8px",
              }}
            >
              {value === "replace" ? "Replace Graph" : "Append Graph"}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={compileExpression}
        disabled={disabled}
        style={{
          width: "100%",
          marginTop: 12,
          borderRadius: 6,
          border: "1px solid rgba(251,191,36,0.5)",
          background: disabled
            ? "rgba(251,191,36,0.1)"
            : "rgba(251,191,36,0.25)",
          color: "#fde68a",
          padding: "8px 10px",
          cursor: disabled ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        {disabled ? "Building…" : "Build Expression"}
      </button>

      {state.state === "error" ? (
        <div style={{ marginTop: 10, color: "#fecaca", fontSize: 12 }}>
          {state.message}
        </div>
      ) : null}

      {state.state === "success" ? (
        <div style={{ marginTop: 12, fontSize: 12, color: "#cbd5f5" }}>
          <div>
            Loaded via <strong>{state.mode}</strong> •{" "}
            {state.result.spec.nodes?.length ?? 0} graph nodes
          </div>
          {irStats ? <div>{irStats}</div> : null}
          {issueList.length ? (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "#f87171", marginBottom: 2 }}>Issues</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {issueList.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div style={{ marginTop: 6, color: "#34d399" }}>
              No compilation issues.
            </div>
          )}
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: "pointer" }}>Inputs</summary>
            <ul style={{ margin: 4, paddingLeft: 16 }}>
              {state.result.inputs.map((input) => (
                <li key={input.id}>
                  {input.label} — {input.path}
                </li>
              ))}
            </ul>
          </details>
          {state.result.ir?.graph ? (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer" }}>IR Graph JSON</summary>
              <pre
                style={{
                  marginTop: 6,
                  maxHeight: 150,
                  overflow: "auto",
                  background: "rgba(2,6,23,0.9)",
                  padding: 8,
                  borderRadius: 6,
                }}
              >
                {JSON.stringify(state.result.ir.graph, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const numberInputStyle = {
  flex: 1,
  borderRadius: 6,
  border: "1px solid rgba(51,65,85,0.8)",
  background: "rgba(15,23,42,0.6)",
  color: "#e2e8f0",
  padding: "4px 6px",
};

function ExpressionFlowDiagram({
  root,
}: {
  root: FlowRenderableNode;
}): JSX.Element {
  return (
    <div
      style={{
        borderRadius: 8,
        border: "1px solid rgba(59,130,246,0.25)",
        background: "rgba(2,6,23,0.6)",
        padding: 10,
        overflowX: "auto",
      }}
    >
      <FlowStreamNode node={root} depth={0} />
    </div>
  );
}

interface FlowStreamNodeProps {
  node: FlowRenderableNode;
  depth: number;
}

function FlowStreamNode({ node, depth }: FlowStreamNodeProps): JSX.Element {
  const hasChildren = node.children.length > 0;
  const laneWidth = computeLaneWidth(depth);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: laneWidth,
        flex: "0 0 auto",
      }}
    >
      <FlowNodeBlock node={node} minWidth={laneWidth} />
      {hasChildren ? (
        <>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: 2,
                height: 8,
                background: FLOW_LINE_COLOR,
                opacity: 0.8,
              }}
            />
          </div>
          <FlowStreamChildren node={node} depth={depth + 1} />
        </>
      ) : null}
    </div>
  );
}

function FlowStreamChildren({
  node,
  depth,
}: {
  node: FlowRenderableNode;
  depth: number;
}): JSX.Element | null {
  const childCount = node.children.length;
  if (!childCount) {
    return null;
  }
  const columnWidth = computeLaneWidth(depth);
  return (
    <div
      style={{
        borderTop: `1px solid ${FLOW_LINE_COLOR}`,
        paddingTop: 8,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${childCount}, minmax(${columnWidth}px, 1fr))`,
          gap: 6,
        }}
      >
        {node.children.map((child) => (
          <div
            key={child.id}
            style={{
              position: "relative",
              paddingTop: child.streamLabel ? 14 : 10,
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -12,
                left: "50%",
                transform: "translate(-50%, -100%)",
                width: 2,
                height: 12,
                background: FLOW_LINE_COLOR,
                opacity: 0.8,
                borderRadius: 2,
              }}
            />
            <FlowStreamLabel label={child.streamLabel} />
            <FlowStreamNode node={child} depth={depth + 1} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FlowStreamLabel({ label }: { label?: string }): JSX.Element | null {
  if (!label) {
    return null;
  }
  return (
    <div
      style={{
        position: "absolute",
        top: -14,
        left: "50%",
        transform: "translate(-50%, -100%)",
        padding: "0px 4px",
        fontSize: 9,
        borderRadius: 4,
        border: "1px solid rgba(148,163,184,0.45)",
        background: "rgba(15,23,42,0.9)",
        color: "#dbeafe",
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </div>
  );
}

function FlowNodeBlock({
  node,
  minWidth,
}: {
  node: FlowRenderableNode;
  minWidth: number;
}): JSX.Element {
  const accentHex = FLOW_ACCENT_COLORS[node.accent];
  const borderColor = hexToRgba(accentHex, 0.6);
  return (
    <div
      style={{
        borderRadius: 6,
        border: `1px solid ${borderColor}`,
        background: `linear-gradient(140deg, ${hexToRgba(accentHex, 0.12)}, rgba(8,11,31,0.85))`,
        padding: "4px 6px",
        minWidth,
        boxShadow: "0 4px 12px rgba(2,6,23,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#f8fafc",
            letterSpacing: 0.1,
          }}
        >
          {node.title}
        </span>
        {node.badge ? (
          <span
            style={{
              fontSize: 9,
              borderRadius: 4,
              border: `1px solid ${borderColor}`,
              padding: "0px 4px",
              color: "#e0e7ff",
              background: "rgba(15,23,42,0.9)",
              letterSpacing: 0.3,
            }}
          >
            {node.badge}
          </span>
        ) : null}
      </div>
      {node.subtitle ? (
        <span
          style={{
            fontSize: 9,
            color: "#c7d2fe",
            opacity: 0.85,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          {node.subtitle}
        </span>
      ) : null}
    </div>
  );
}

function computeLaneWidth(depth: number): number {
  const base = 140 - depth * 8;
  return Math.max(96, base);
}

function buildExpressionFlowTree(
  rootNode: ControlExpressionNode,
  aliases: string[],
): FlowRenderableNode {
  let counter = 0;
  const nextId = () => {
    counter += 1;
    return `flow_${counter}`;
  };
  const aliasSet = new Set(aliases.map((alias) => alias.toLowerCase()));
  const reservedMap = new Map(
    RESERVED_EXPRESSION_VARIABLES.map((entry) => [
      entry.name.toLowerCase(),
      entry,
    ]),
  );
  const vocabularyMap = new Map<string, ScalarFunctionVocabularyEntry>();
  EXPRESSION_FUNCTION_VOCABULARY.forEach((entry) => {
    vocabularyMap.set(entry.name.toLowerCase(), entry);
    entry.aliases.forEach((alias) =>
      vocabularyMap.set(alias.toLowerCase(), entry),
    );
  });

  const visit = (
    node: ControlExpressionNode,
    streamLabel?: string,
  ): FlowRenderableNode => {
    switch (node.type) {
      case "Literal":
        return {
          id: nextId(),
          title: formatLiteral(node.value),
          subtitle: "Literal",
          description: "Fixed numeric value.",
          badge: "#",
          accent: "literal",
          streamLabel,
          children: [],
        };
      case "VectorLiteral":
        return {
          id: nextId(),
          title: `vector(${node.values.length})`,
          subtitle: "Vector literal",
          description: formatVectorPreview(node.values),
          badge: "vec",
          accent: "vector",
          streamLabel,
          children: [],
        };
      case "Reference": {
        const details = describeReferenceDetails(
          node.name,
          aliasSet,
          reservedMap,
        );
        return {
          id: nextId(),
          title: node.name,
          subtitle: details.subtitle,
          description: details.description,
          badge: details.badge,
          accent: "reference",
          streamLabel,
          children: [],
        };
      }
      case "Unary": {
        const meta = UNARY_OPERATOR_METADATA[node.operator] ?? {
          title: `Unary ${node.operator}`,
          description: "Unary operator.",
        };
        return {
          id: nextId(),
          title: meta.title,
          subtitle: "Unary operator",
          description: meta.description,
          badge: node.operator,
          accent: "operator",
          streamLabel,
          children: [visit(node.operand, "input")],
        };
      }
      case "Binary": {
        const meta = BINARY_OPERATOR_METADATA[node.operator] ?? {
          title: `Binary ${node.operator}`,
          description: "Binary operator.",
        };
        return {
          id: nextId(),
          title: meta.title,
          subtitle: "Binary operator",
          description: meta.description,
          badge: node.operator,
          accent: "operator",
          streamLabel,
          children: [visit(node.left, "left"), visit(node.right, "right")],
        };
      }
      case "Function": {
        const normalized = node.name.toLowerCase();
        const lookup = vocabularyMap.get(normalized);
        const definition =
          SCALAR_FUNCTIONS.get(normalized) ??
          (lookup
            ? SCALAR_FUNCTIONS.get(lookup.nodeType.toLowerCase())
            : null) ??
          null;
        const argLabels = buildFunctionStreamLabels(
          node.args.length,
          definition,
        );
        return {
          id: nextId(),
          title: `${node.name}()`,
          subtitle: lookup
            ? `${titleCase(lookup.category)} function`
            : "Function call",
          description: lookup?.description
            ? lookup.description
            : "Evaluates helper node.",
          badge: "fn",
          accent: "function",
          streamLabel,
          children: node.args.map((arg, index) =>
            visit(arg, argLabels[index] ?? `arg ${index + 1}`),
          ),
        };
      }
      default:
        return {
          id: nextId(),
          title: "Expression",
          subtitle: "Unknown node",
          description: "Unable to visualize this segment.",
          badge: "?",
          accent: "operator",
          streamLabel,
          children: [],
        };
    }
  };

  return {
    id: nextId(),
    title: "Expression Output",
    subtitle: "Binding result",
    description: "Feeds the graph node input.",
    badge: "out",
    accent: "output",
    children: [visit(rootNode)],
  };
}

function describeReferenceDetails(
  name: string,
  aliasSet: Set<string>,
  reservedMap: Map<string, (typeof RESERVED_EXPRESSION_VARIABLES)[number]>,
): { subtitle: string; description: string; badge: string } {
  const normalized = name.toLowerCase();
  if (aliasSet.has(normalized)) {
    return {
      subtitle: "Slot input",
      description: "Value provided by the slot list.",
      badge: "slot",
    };
  }
  const reserved = reservedMap.get(normalized);
  if (reserved) {
    return {
      subtitle: "Reserved variable",
      description: reserved.description,
      badge: reserved.scope === "binding" ? "binding" : "graph",
    };
  }
  return {
    subtitle: "Reference",
    description: "Resolved from another binding or variable.",
    badge: "ref",
  };
}

function buildFunctionStreamLabels(
  argCount: number,
  definition: ScalarFunctionDefinition | null,
): string[] {
  if (argCount <= 0) {
    return [];
  }
  if (!definition) {
    return Array.from({ length: argCount }, (_, index) => `arg ${index + 1}`);
  }
  const labels: string[] = [];
  for (let index = 0; index < argCount; index += 1) {
    if (index < definition.inputs.length) {
      labels.push(definition.inputs[index]?.id ?? `arg ${index + 1}`);
      continue;
    }
    if (definition.variadic) {
      const offset = index - definition.inputs.length + 1;
      const baseLabel =
        offset === 1 && definition.variadic.min <= 1
          ? definition.variadic.id
          : `${definition.variadic.id} ${offset}`;
      labels.push(baseLabel);
      continue;
    }
    labels.push(`arg ${index + 1}`);
  }
  return labels;
}

function formatLiteral(value: number): string {
  if (Number.isInteger(value)) {
    return value.toFixed(0);
  }
  const magnitude = Math.abs(value);
  if ((magnitude >= 1000 || magnitude < 0.01) && magnitude !== 0) {
    return value.toExponential(2);
  }
  return Number(value.toFixed(3)).toString();
}

function formatVectorPreview(values: number[]): string {
  const preview = values
    .slice(0, 4)
    .map((value) => formatLiteral(value))
    .join(", ");
  const suffix = values.length > 4 ? ", …" : "";
  return `[${preview}${suffix}]`;
}

function hexToRgba(hex: string, alpha: number): string {
  const sanitized = hex.replace("#", "");
  const bigint = Number.parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function titleCase(value: string): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface FunctionHintOverlayProps {
  suggestions: FunctionHintSuggestion[];
  highlightedIndex: number;
  onHighlight: (index: number) => void;
  onSelect: (suggestion: FunctionHintSuggestion) => void;
  fallbackSuggestion: FunctionHintSuggestion | null;
}

function FunctionHintOverlay({
  suggestions,
  highlightedIndex,
  onHighlight,
  onSelect,
  fallbackSuggestion,
}: FunctionHintOverlayProps): JSX.Element | null {
  if (!suggestions.length && !fallbackSuggestion) {
    return null;
  }
  const active =
    suggestions[highlightedIndex] ??
    suggestions[0] ??
    fallbackSuggestion ??
    null;
  const argumentDetails = buildArgumentDetails(active?.definition ?? null);
  const hasSuggestions = suggestions.length > 0;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "100%",
        marginTop: 6,
        background: "rgba(15,23,42,0.97)",
        borderRadius: 8,
        border: "1px solid rgba(59,130,246,0.35)",
        boxShadow: "0 12px 30px rgba(2,6,23,0.65)",
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", maxHeight: 240 }}>
        {hasSuggestions ? (
          <div
            style={{
              width: "45%",
              borderRight: "1px solid rgba(59,130,246,0.25)",
              overflowY: "auto",
            }}
          >
            {suggestions.map((suggestion, index) => {
              const isActive = index === highlightedIndex;
              return (
                <button
                  key={suggestion.entry.name}
                  type="button"
                  onMouseEnter={() => onHighlight(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(suggestion);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    border: "none",
                    background: isActive
                      ? "rgba(59,130,246,0.25)"
                      : "transparent",
                    color: "#e2e8f0",
                    textAlign: "left",
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontFamily: "monospace",
                    }}
                  >
                    <span>{suggestion.entry.name}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      {suggestion.entry.category}
                    </span>
                  </div>
                  {suggestion.entry.description ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(148,163,184,0.9)",
                        marginTop: 2,
                      }}
                    >
                      {suggestion.entry.description}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <div
          style={{
            flex: 1,
            padding: 10,
            overflowY: "auto",
            minWidth: hasSuggestions ? "55%" : "100%",
          }}
        >
          {active ? (
            <>
              <div
                style={{
                  fontFamily: "monospace",
                  color: "#e2e8f0",
                  fontSize: 13,
                }}
              >
                {active.signature}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                Returns {active.definition?.resultValueType ?? "scalar"} value.
              </div>
              {argumentDetails.length ? (
                <div style={{ marginTop: 8 }}>
                  {argumentDetails.map((arg) => (
                    <div
                      key={`${arg.kind}-${arg.id}`}
                      style={{
                        fontSize: 11,
                        color: "#cbd5f5",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                          alignItems: "center",
                        }}
                      >
                        <code
                          style={{
                            fontFamily: "monospace",
                            background: "rgba(2,6,23,0.65)",
                            borderRadius: 4,
                            padding: "2px 4px",
                          }}
                        >
                          {arg.label}
                          {arg.optional ? "?" : ""}
                        </code>
                        <span style={{ color: "#bfdbfe" }}>
                          {arg.valueType}
                          {arg.kind === "variadic" ? " (variadic)" : ""}
                        </span>
                        {arg.range ? (
                          <span style={{ color: "#94a3b8" }}>
                            range {arg.range}
                          </span>
                        ) : null}
                      </div>
                      {arg.doc ? (
                        <div style={{ color: "#e2e8f0", marginTop: 2 }}>
                          {arg.doc}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8 }}>
                  No additional arguments required.
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Start typing a function name to see hints.
            </div>
          )}
        </div>
      </div>
      {hasSuggestions ? (
        <div
          style={{
            borderTop: "1px solid rgba(30,41,59,0.85)",
            padding: "6px 10px",
            fontSize: 11,
            color: "#94a3b8",
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>Enter or Tab to insert • Esc to hide</span>
          <span>Arrow keys to navigate</span>
        </div>
      ) : null}
    </div>
  );
}

const MAX_FUNCTION_SUGGESTIONS = 8;

type FunctionHintSuggestion = {
  entry: ScalarFunctionVocabularyEntry;
  definition: ScalarFunctionDefinition | null;
  signature: string;
};

type FunctionArgumentDetail = {
  id: string;
  label: string;
  optional: boolean;
  valueType: ExpressionValueType;
  kind: "input" | "variadic" | "param";
  doc?: string;
  range?: string;
};

type FunctionTokenInfo = {
  token: string;
  start: number;
  end: number;
};

function buildFunctionSuggestions(query: string): FunctionHintSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) {
    return [];
  }
  const scored: Array<FunctionHintSuggestion & { priority: number }> = [];
  for (const entry of EXPRESSION_FUNCTION_VOCABULARY) {
    const name = entry.name.toLowerCase();
    const nameIndex = name.indexOf(normalized);
    let aliasIndex = -1;
    let aliasMatch: string | undefined;
    for (const alias of entry.aliases) {
      const index = alias.toLowerCase().indexOf(normalized);
      if (index !== -1) {
        aliasMatch = alias;
        aliasIndex = index;
        break;
      }
    }
    if (nameIndex === -1 && aliasIndex === -1) {
      continue;
    }
    const priority =
      aliasMatch !== undefined
        ? aliasIndex === 0
          ? 0.4
          : 0.7 + aliasIndex / Math.max(1, aliasMatch.length)
        : nameIndex === 0
          ? 0
          : 1 + nameIndex / Math.max(1, entry.name.length);
    const definition =
      SCALAR_FUNCTIONS.get(name) ??
      SCALAR_FUNCTIONS.get(entry.nodeType.toLowerCase()) ??
      null;
    scored.push({
      entry,
      definition,
      signature: buildFunctionSignature(entry, definition),
      priority,
    });
  }
  return scored
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.entry.name.localeCompare(b.entry.name);
    })
    .slice(0, MAX_FUNCTION_SUGGESTIONS)
    .map(({ priority: _priority, ...rest }) => rest);
}

function buildHelperSuggestion(token: string): FunctionHintSuggestion | null {
  const normalized = token.trim().toLowerCase();
  if (normalized.length < 2) {
    return null;
  }
  const suggestions = buildFunctionSuggestions(token);
  if (!suggestions.length) {
    return null;
  }
  const exact = suggestions.find((suggestion) => {
    const name = suggestion.entry.name.toLowerCase();
    if (name === normalized) {
      return true;
    }
    return suggestion.entry.aliases.some(
      (alias) => alias.toLowerCase() === normalized,
    );
  });
  return exact ?? suggestions[0];
}

function buildFunctionSignature(
  entry: ScalarFunctionVocabularyEntry,
  definition: ScalarFunctionDefinition | null,
): string {
  if (!definition) {
    return `${entry.name}()`;
  }
  const parts: string[] = [];
  definition.inputs.forEach((input) => {
    parts.push(input.optional ? `[${input.id}]` : input.id);
  });
  if (definition.variadic) {
    parts.push(
      definition.variadic.min === 0
        ? `[${definition.variadic.id}…]`
        : `${definition.variadic.id}…`,
    );
  }
  definition.params.forEach((param) => {
    const label = param.label ?? param.id;
    parts.push(param.optional ? `${label}?` : label);
  });
  return `${entry.name}(${parts.join(", ")})`;
}

function buildArgumentDetails(
  definition: ScalarFunctionDefinition | null,
): FunctionArgumentDetail[] {
  if (!definition) {
    return [];
  }
  const rows: FunctionArgumentDetail[] = definition.inputs.map((input) => ({
    id: input.id,
    label: input.id,
    optional: input.optional,
    valueType: input.valueType,
    kind: "input",
  }));

  if (definition.variadic) {
    rows.push({
      id: definition.variadic.id,
      label: `${definition.variadic.id}…`,
      optional: definition.variadic.min === 0,
      valueType: definition.variadic.valueType,
      kind: "variadic",
      range:
        definition.variadic.max === null
          ? `${definition.variadic.min}+`
          : `${definition.variadic.min}-${definition.variadic.max}`,
    });
  }

  definition.params.forEach((param) => {
    rows.push({
      id: param.id,
      label: param.label ?? param.id,
      optional: param.optional,
      valueType: param.valueType,
      kind: "param",
      doc: param.doc,
      range:
        param.min !== undefined || param.max !== undefined
          ? `${param.min ?? "-inf"}..${param.max ?? "inf"}`
          : undefined,
    });
  });

  return rows;
}

function deriveFunctionToken(
  value: string,
  selection: SelectionRange,
): FunctionTokenInfo | null {
  if (selection.start !== selection.end) {
    return null;
  }
  const caret = selection.start;
  const before = value.slice(0, caret);
  const match = /([A-Za-z_][A-Za-z0-9_]*)$/.exec(before);
  if (!match) {
    return null;
  }
  const token = match[1];
  if (!isValidFunctionTokenCandidate(token)) {
    return null;
  }
  const start = caret - token.length;
  return {
    token,
    start,
    end: caret,
  };
}

function deriveEnclosingFunctionToken(
  value: string,
  selection: SelectionRange,
): FunctionTokenInfo | null {
  if (selection.start !== selection.end) {
    return null;
  }
  const caret = selection.start;
  let depth = 0;
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (char === "(") {
      if (depth === 0) {
        let end = index;
        while (end > 0 && /\s/.test(value[end - 1] ?? "")) {
          end -= 1;
        }
        let start = end;
        while (start > 0 && /[A-Za-z0-9_]/.test(value[start - 1] ?? "")) {
          start -= 1;
        }
        const token = value.slice(start, end);
        if (isValidFunctionTokenCandidate(token)) {
          return {
            token,
            start,
            end,
          };
        }
      } else {
        depth -= 1;
      }
      continue;
    }
    if (char === ")") {
      depth += 1;
    }
  }
  return null;
}

function isValidFunctionTokenCandidate(token: string | undefined): boolean {
  if (!token || token.length < 2) {
    return false;
  }
  return !/\d/.test(token);
}

function scheduleSelectionUpdate(callback: () => void): void {
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    window.requestAnimationFrame(callback);
    return;
  }
  setTimeout(callback, 0);
}
