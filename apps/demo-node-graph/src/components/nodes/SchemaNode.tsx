import React, { useEffect, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  useNodeGraph,
  useNodeOutputs,
  valueAsNumber,
  valueAsVector,
} from "@vizij/node-graph-react";
import type { HistoryPoint } from "./HistoryChart";
import { useRegistry } from "../../state/RegistryContext";
import { displayValue } from "../../lib/display";
import HistoryChart from "./HistoryChart";
import useGraphStore from "../../state/useGraphStore";

interface SchemaNodeData {
  label?: string;
  path?: string;
  [key: string]: unknown;
}

const HANDLE_HEIGHT = 24;
const HANDLE_ROW_GAP = 2;
const HANDLE_OFFSET = 6;

const MAX_HISTORY_POINTS = 200;

const historiesEqual = (a: HistoryPoint[], b: HistoryPoint[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const pointA = a[i];
    const pointB = b[i];
    if (!pointB || pointA.sample.length !== pointB.sample.length) return false;
    if (pointA.dt !== pointB.dt) return false;
    for (let j = 0; j < pointA.sample.length; j += 1) {
      const valA = pointA.sample[j];
      const valB = pointB.sample[j];
      if (Number.isNaN(valA) && Number.isNaN(valB)) continue;
      if (valA !== valB) return false;
    }
  }
  return true;
};

const deriveVariadicLabel = (
  handleId: string,
  baseLabel: string,
  ordinal: number,
) => {
  if (!handleId) {
    return `${baseLabel} ${ordinal}`;
  }
  const digitMatch = handleId.match(/(\d+)(?!.*\d)/);
  if (digitMatch) {
    return `${baseLabel} ${Number(digitMatch[1])}`;
  }
  if (handleId.length === 1) {
    return `${baseLabel} ${ordinal}`;
  }
  return handleId;
};

const SchemaNode: React.FC<NodeProps<SchemaNodeData>> = ({
  id,
  type,
  data,
}) => {
  const { registry } = useRegistry();
  const { subscribeToNode, getNodeOutput, getLastDt } = useNodeGraph();
  const edges = useGraphStore((state) => state.edges);
  const signature = useMemo(() => {
    const typeId = type?.toLowerCase();
    return registry?.nodes.find(
      (node) => node.type_id.toLowerCase() === typeId,
    );
  }, [registry, type]);

  const outputs = useNodeOutputs(id);
  const [historyMap, setHistoryMap] = useState<Record<string, HistoryPoint[]>>(
    {},
  );
  const [version, setVersion] = useState(0);

  const isGraphlessNode = useMemo(() => {
    const normalized = type?.toLowerCase();
    return normalized === "constant" || normalized === "vectorconstant";
  }, [type]);

  const incomingEdges = useMemo(
    () => edges.filter((edge) => edge.target === id),
    [edges, id],
  );

  useEffect(() => {
    setVersion((v) => v + 1);
    const unsubscribe = subscribeToNode(id, () => {
      setVersion((v) => v + 1);
    });
    return unsubscribe;
  }, [id, subscribeToNode]);

  useEffect(() => {
    const latest = getNodeOutput(id);
    // console.log(id, latest);
    if (!latest) return;

    setHistoryMap((prev) => {
      const next: Record<string, HistoryPoint[]> = {};
      let changed = false;

      for (const [key, snapshot] of Object.entries(latest)) {
        const previous = prev[key] ?? [];

        const vector = valueAsVector(snapshot);
        const numeric = valueAsNumber(snapshot);
        const sample =
          vector && vector.length > 0
            ? vector
            : typeof numeric === "number" && !Number.isNaN(numeric)
              ? [numeric]
              : undefined;

        if (!sample) {
          next[key] = previous;
          continue;
        }

        const dt = Math.max(0, getLastDt?.() ?? 0);
        const trimmed =
          previous.length >= MAX_HISTORY_POINTS
            ? previous.slice(previous.length - (MAX_HISTORY_POINTS - 1))
            : previous.slice();

        trimmed.push({ dt, sample });

        next[key] = trimmed;
        if (!historiesEqual(trimmed, previous)) {
          changed = true;
        }
      }

      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      if (
        prevKeys.length !== nextKeys.length ||
        prevKeys.some((key) => !(key in next))
      ) {
        changed = true;
      }
      // console.log(version, changed, next, prev)
      return changed ? next : prev;
    });
  }, [getNodeOutput, id, version]);

  const label = data.label ?? signature?.name ?? type;

  const derivedInputs = useMemo(() => {
    if (signature?.inputs?.length) {
      return signature.inputs.map((input, idx) => ({
        id: input.id,
        label: input.label ?? input.id ?? `In ${idx + 1}`,
      }));
    }

    if (signature?.variadic_inputs) {
      const variadic = signature.variadic_inputs;
      const prefix = variadic.id || "input";
      const baseLabel = variadic.label || "Input";
      const connectedHandles = incomingEdges
        .map((edge) => edge.targetHandle)
        .filter((handle): handle is string => Boolean(handle));

      const seen = new Set<string>();
      const handles: Array<{ id: string; label: string }> = [];

      connectedHandles
        .sort((a, b) => a.localeCompare(b))
        .forEach((handle) => {
          if (seen.has(handle)) return;
          seen.add(handle);
          handles.push({
            id: handle,
            label: deriveVariadicLabel(handle, baseLabel, handles.length + 1),
          });
        });

      const minCount = Math.max(variadic.min ?? 1, 1);
      let nextIndex = 1;
      while (handles.length < minCount) {
        const candidate = `${prefix}_${nextIndex++}`;
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        handles.push({
          id: candidate,
          label: `${baseLabel} ${handles.length + 1}`,
        });
      }

      let extraIndex = 1;
      let extraId = `${prefix}_${extraIndex}`;
      while (seen.has(extraId)) {
        extraId = `${prefix}_${++extraIndex}`;
      }
      handles.push({
        id: extraId,
        label: `${baseLabel} ${handles.length + 1}`,
      });

      return handles;
    }

    return [{ id: "in", label: "In" }];
  }, [incomingEdges, signature]);

  const derivedOutputs = useMemo(() => {
    if (signature?.outputs?.length) {
      return signature.outputs.map((output, idx) => ({
        id: output.id,
        label: output.label ?? output.id ?? `Out ${idx + 1}`,
      }));
    }
    if (outputs) {
      const keys = Object.keys(outputs);
      if (keys.length > 0) {
        return keys.map((key) => ({ id: key, label: key.toUpperCase() }));
      }
    }
    return [{ id: "out", label: "Out" }];
  }, [signature, outputs]);

  const renderHandles = (
    items: Array<{ id: string; label: string }>,
    direction: "input" | "output",
  ) =>
    items.map((item, index) => {
      const isInput = direction === "input";
      const handleCenter = HANDLE_OFFSET + index + HANDLE_HEIGHT / 6;
      return (
        <div
          key={`${direction}-${item.id}`}
          style={{
            position: "relative",
            paddingLeft: isInput ? 20 : 0,
            paddingRight: isInput ? 0 : 20,
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: isInput ? "flex-start" : "flex-end",
            color: "#ccc",
            fontSize: 12,
            height: HANDLE_HEIGHT,
          }}
        >
          {isInput ? (
            <Handle
              type="target"
              id={item.id}
              position={Position.Left}
              style={{ top: handleCenter, transform: "translateY(-50%)" }}
            />
          ) : null}
          <span>{item.label || item.id}</span>
          {!isInput ? (
            <Handle
              type="source"
              id={item.id}
              position={Position.Right}
              style={{ top: handleCenter, transform: "translateY(-50%)" }}
            />
          ) : null}
        </div>
      );
    });

  const renderOutputsPreview = () => {
    if (!outputs) return null;
    return Object.entries(outputs).map(([key, snapshot]) => {
      const history = historyMap[key];
      const hasHistory = history && history.length > 1;
      return (
        <div
          key={key}
          style={{
            marginBottom: 8,
            padding: 6,
            border: "1px solid #333",
            borderRadius: 4,
            background: "#1c1c1c",
          }}
        >
          <div style={{ fontSize: 12, color: "#9aa0a6" }}>
            {key}: {displayValue(snapshot)}
          </div>
          {hasHistory && !isGraphlessNode ? (
            <div style={{ marginTop: 6 }}>
              <HistoryChart history={history} width={180} height={48} />
            </div>
          ) : null}
        </div>
      );
    });
  };

  const isOutput = type === "output";

  return (
    <div
      style={{
        padding: 16,
        minWidth: 220,
        background: "#2a2a2a",
        borderRadius: 8,
        border: "1px solid #555",
        position: "relative",
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <strong>{label}</strong>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          columnGap: 12,
          rowGap: HANDLE_ROW_GAP,
          alignItems: "start",
        }}
      >
        <div>{renderHandles(derivedInputs, "input")}</div>
        <div>{renderHandles(derivedOutputs, "output")}</div>
      </div>

      <div style={{ marginTop: 12 }}>{renderOutputsPreview()}</div>

      {isOutput && data.path ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "#9aa0a6",
            wordBreak: "break-word",
          }}
        >
          Path: {data.path}
        </div>
      ) : null}
    </div>
  );
};

export default SchemaNode;
