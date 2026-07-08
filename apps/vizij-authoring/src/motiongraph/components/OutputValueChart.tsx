import { useEffect, useRef, useMemo } from "react";
import {
  useEditorStore,
  type EditorNode,
  type EditorEdge,
} from "../store/useEditorStore";
import { outputValueBridge } from "../hooks/useOutputValueBridge";
import { OUTPUT_TARGET_TYPE } from "./OutputTargetNode";

const BUFFER_CAPACITY = 300;
const CHART_HEIGHT = 120;
const PADDING = { top: 8, right: 8, bottom: 4, left: 44 };
const PALETTE = [
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
  "#22d3ee",
  "#e879f9",
];

// ─── Ring buffer ──────────────────────────────────────────────────────

type RingBuffer = {
  data: Float64Array;
  head: number;
  count: number;
};

function createRingBuffer(): RingBuffer {
  return { data: new Float64Array(BUFFER_CAPACITY), head: 0, count: 0 };
}

function pushSample(buf: RingBuffer, value: number | null): void {
  if (value === null) return; // skip gaps
  buf.data[buf.head] = value;
  buf.head = (buf.head + 1) % BUFFER_CAPACITY;
  if (buf.count < BUFFER_CAPACITY) buf.count++;
}

function readOrdered(buf: RingBuffer): Float64Array {
  if (buf.count === 0) return new Float64Array(0);
  const out = new Float64Array(buf.count);
  const start = (buf.head - buf.count + BUFFER_CAPACITY) % BUFFER_CAPACITY;
  for (let i = 0; i < buf.count; i++) {
    out[i] = buf.data[(start + i) % BUFFER_CAPACITY];
  }
  return out;
}

// ─── Forward edge tracing ─────────────────────────────────────────────

function findReachableOutputPaths(
  nodeId: string,
  nodes: EditorNode[],
  edges: EditorEdge[],
): string[] {
  const node = nodes.find((n) => n.id === nodeId);
  if (node?.type === OUTPUT_TARGET_TYPE && node.data?.outputPath) {
    return [node.data.outputPath as string];
  }

  // BFS forward through edges
  const forwardAdj = new Map<string, string[]>();
  for (const edge of edges) {
    let targets = forwardAdj.get(edge.source);
    if (!targets) {
      targets = [];
      forwardAdj.set(edge.source, targets);
    }
    targets.push(edge.target);
  }

  const visited = new Set<string>([nodeId]);
  const queue = [nodeId];
  const outputPaths: string[] = [];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const targets = forwardAdj.get(current);
    if (!targets) continue;
    for (const targetId of targets) {
      if (visited.has(targetId)) continue;
      visited.add(targetId);
      const targetNode = nodes.find((n) => n.id === targetId);
      if (
        targetNode?.type === OUTPUT_TARGET_TYPE &&
        targetNode.data?.outputPath
      ) {
        outputPaths.push(targetNode.data.outputPath as string);
      } else {
        queue.push(targetId);
      }
    }
  }

  return outputPaths;
}

// ─── Chart component ──────────────────────────────────────────────────

export interface OutputValueChartProps {
  active: boolean;
}

export function OutputValueChart({ active }: OutputValueChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const buffersRef = useRef<Map<string, RingBuffer>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);

  const trackedPaths = useMemo(() => {
    if (!selectedNodeId) return [];
    return findReachableOutputPaths(selectedNodeId, nodes, edges);
  }, [selectedNodeId, nodes, edges]);

  // Keep ref in sync for rAF loop
  const trackedPathsRef = useRef(trackedPaths);
  trackedPathsRef.current = trackedPaths;

  // Subscribe to bridge updates and push into ring buffers
  useEffect(() => {
    if (!active || trackedPaths.length === 0) return;

    const bufs = buffersRef.current;
    // Ensure buffers exist for tracked paths
    for (const path of trackedPaths) {
      if (!bufs.has(path)) bufs.set(path, createRingBuffer());
    }
    // Remove stale buffers
    for (const key of bufs.keys()) {
      if (!trackedPaths.includes(key)) bufs.delete(key);
    }

    const unsub = outputValueBridge.subscribe(() => {
      const snapshot = outputValueBridge.current;
      for (const path of trackedPathsRef.current) {
        const buf = bufs.get(path);
        if (buf) {
          pushSample(buf, snapshot.get(path) ?? null);
        }
      }
    });

    return unsub;
  }, [active, trackedPaths]);

  // Canvas rendering loop
  useEffect(() => {
    if (!active) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        rafIdRef.current = requestAnimationFrame(draw);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = CHART_HEIGHT;

      if (
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)
      ) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Clear
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, w, h);

      const plotW = w - PADDING.left - PADDING.right;
      const plotH = h - PADDING.top - PADDING.bottom;
      const bufs = buffersRef.current;

      if (bufs.size === 0) {
        ctx.fillStyle = "#525252";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No output paths connected", w / 2, h / 2);
        rafIdRef.current = requestAnimationFrame(draw);
        return;
      }

      // Compute global min/max for Y axis
      let globalMin = Infinity;
      let globalMax = -Infinity;
      const ordered = new Map<string, Float64Array>();
      for (const [path, buf] of bufs) {
        const arr = readOrdered(buf);
        ordered.set(path, arr);
        for (let i = 0; i < arr.length; i++) {
          if (arr[i] < globalMin) globalMin = arr[i];
          if (arr[i] > globalMax) globalMax = arr[i];
        }
      }

      if (!isFinite(globalMin)) {
        globalMin = 0;
        globalMax = 1;
      }
      const yRange = globalMax - globalMin;
      const margin = yRange * 0.1 || 0.5;
      const yMin = globalMin - margin;
      const yMax = globalMax + margin;

      // Grid lines
      ctx.strokeStyle = "#262626";
      ctx.lineWidth = 1;
      const gridLines = 4;
      for (let i = 0; i <= gridLines; i++) {
        const y = PADDING.top + (plotH * i) / gridLines;
        ctx.beginPath();
        ctx.moveTo(PADDING.left, y);
        ctx.lineTo(w - PADDING.right, y);
        ctx.stroke();

        const val = yMax - ((yMax - yMin) * i) / gridLines;
        ctx.fillStyle = "#525252";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillText(val.toFixed(2), PADDING.left - 4, y + 3);
      }

      // Draw each series
      let colorIdx = 0;
      for (const [, arr] of ordered) {
        if (arr.length < 2) {
          colorIdx++;
          continue;
        }
        const color = PALETTE[colorIdx % PALETTE.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        const xStep = plotW / (BUFFER_CAPACITY - 1);
        const xOffset = (BUFFER_CAPACITY - arr.length) * xStep;

        for (let i = 0; i < arr.length; i++) {
          const x = PADDING.left + xOffset + i * xStep;
          const y =
            PADDING.top + plotH - ((arr[i] - yMin) / (yMax - yMin)) * plotH;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        colorIdx++;
      }

      rafIdRef.current = requestAnimationFrame(draw);
    };

    rafIdRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [active]);

  // Legend
  const legend = useMemo(() => {
    return trackedPaths.map((path, i) => {
      const shortPath = path
        .replace(/^rig\/[^/]+\/standard\//, "")
        .replace(/\//g, ".");
      return { path, shortPath, color: PALETTE[i % PALETTE.length] };
    });
  }, [trackedPaths]);

  if (!active || trackedPaths.length === 0) return null;

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: CHART_HEIGHT }}
        className="rounded"
      />
      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-1">
          {legend.map(({ path, shortPath, color }) => (
            <div key={path} className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-[10px] text-text-muted font-mono truncate max-w-32">
                {shortPath}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
