import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ValueJSON } from "@vizij/node-graph-wasm";
import MultiSeriesChart from "./MultiSeriesChart";

/**
 * Convert a single ValueJSON into one or more numeric series samples.
 * - float -> { [label]: number }
 * - bool  -> { [label]: 0|1 }
 * - vec3  -> { x:number, y:number, z:number } (label is split into x/y/z)
 * The 'label' parameter is used only for scalar/boolean values; vec3 uses x/y/z fixed labels.
 */
function valueToSamples(v?: ValueJSON, label: string = "out"): Record<string, number> {
  if (!v) return {};
  if ("float" in v) return { [label]: v.float };
  if ("bool" in v) return { [label]: v.bool ? 1 : 0 };
  if ("vec3" in v) {
    const [x, y, z] = v.vec3;
    return { x, y, z };
  }
  return {};
}

/**
 * NodeSeriesPanel accumulates time-series for a node's outputs and renders
 * a small inline toggle + MultiSeriesChart. The chart is off by default.
 *
 * Usage:
 *  - For single-output nodes: samples={{ out: useNodeOutput(id, "out") }}
 *  - For multi-output nodes (x/y/z): samples={{ x: useNodeOutput(id,"x"), ... }}
 *
 * Notes:
 *  - Histories are local to the component instance and reset on unmount.
 *  - Max history length default is 100 samples.
 */
export default function NodeSeriesPanel({
  samples,
  width = 180,
  height = 60,
  maxPoints = 100,
  defaultOpen = false,
}: {
  samples: Record<string, ValueJSON | undefined>;
  width?: number;
  height?: number;
  maxPoints?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  // historyRef: seriesName -> number[]
  const historyRef = useRef<Record<string, number[]>>({});

  // Build a normalized numeric sample set for this tick
  const numericSamples = useMemo(() => {
    const merged: Record<string, number> = {};
    for (const key of Object.keys(samples)) {
      const v = samples[key];
      const part = valueToSamples(v, key);
      for (const k of Object.keys(part)) {
        merged[k] = part[k];
      }
    }
    return merged;
  }, [samples]);

  // Update historyRef using latest numericSamples
  const seriesForChart = useMemo(() => {
    const next = { ...historyRef.current };
    const names = Object.keys(numericSamples);
    // Ensure series arrays exist
    for (const name of names) {
      if (!next[name]) next[name] = [];
      const arr = next[name].slice();
      arr.push(numericSamples[name]);
      if (arr.length > maxPoints) arr.shift();
      next[name] = arr;
    }
    // Optionally, we could prune series that disappeared; for now keep them.
    historyRef.current = next;
    return next;
  }, [numericSamples, maxPoints]);

  const onToggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#ccc", cursor: "pointer" }}>
        <input type="checkbox" checked={open} onChange={onToggle} />
        Show Graph
      </label>
      {open && (
        <div style={{ marginTop: 6 }}>
          <MultiSeriesChart series={seriesForChart} width={width} height={height} maxPoints={maxPoints} />
        </div>
      )}
    </div>
  );
}
