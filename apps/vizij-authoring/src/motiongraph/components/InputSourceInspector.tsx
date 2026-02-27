import { useCallback } from "react";
import { useEditorStore, type EditorNode } from "../store/useEditorStore";
import { getPortColor } from "../utils/portColors";
import type {
  InputSourceNodeData,
  InputValueType,
  InputControlMode,
} from "./InputSourceNode";

// ─── Helpers ──────────────────────────────────────────────────────────

const VALUE_TYPE_OPTIONS: { value: InputValueType; label: string }[] = [
  { value: "f32", label: "Float (f32)" },
  { value: "i32", label: "Integer (i32)" },
  { value: "bool", label: "Boolean" },
];

const CONTROL_MODES: { value: InputControlMode; label: string }[] = [
  { value: "instant", label: "Instant" },
  { value: "trigger", label: "Trigger" },
  { value: "grouped", label: "Grouped" },
];

function resolveData(node: EditorNode): InputSourceNodeData & {
  resolvedValueType: InputValueType;
  resolvedDefault: number;
  resolvedMin: number;
  resolvedMax: number;
  resolvedMode: InputControlMode;
  resolvedTarget: number;
  resolvedApplied: number;
} {
  const d = node.data as InputSourceNodeData;
  const resolvedValueType = d.valueType ?? "f32";
  const resolvedDefault = d.defaultValue ?? 0;
  const resolvedMin = d.min ?? 0;
  const resolvedMax = d.max ?? 1;
  const resolvedMode = d.controlMode ?? "instant";
  const resolvedTarget = d.targetValue ?? resolvedDefault;
  const resolvedApplied = d.appliedValue ?? resolvedDefault;
  return {
    ...d,
    resolvedValueType,
    resolvedDefault,
    resolvedMin,
    resolvedMax,
    resolvedMode,
    resolvedTarget,
    resolvedApplied,
  };
}

// ─── Component ────────────────────────────────────────────────────────

/**
 * Inspector panel for Input Source nodes.
 *
 * This component only writes to the editor store — the actual orchestrator
 * communication is handled by `InputValueBridge` which runs inside the
 * VizijRuntimeProvider and watches the store for `appliedValue` changes.
 */
export default function InputSourceInspector({ node }: { node: EditorNode }) {
  const setNodes = useEditorStore((s) => s.setNodes);

  const d = resolveData(node);
  const portColor = getPortColor(d.resolvedValueType);

  // ─── Node data updater ────────────────────────────────────────────

  const updateData = useCallback(
    (patch: Partial<InputSourceNodeData>) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === node.id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [node.id, setNodes],
  );

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleSliderChange = (value: number) => {
    if (d.resolvedMode === "instant") {
      // In instant mode, set both target and applied so the bridge pushes it.
      updateData({ targetValue: value, appliedValue: value });
    } else {
      // In trigger/grouped mode, only set the target (staged, not applied).
      updateData({ targetValue: value });
    }
  };

  const handleTrigger = () => {
    // Apply the current target value — the bridge will push it.
    updateData({ appliedValue: d.resolvedTarget });
  };

  const handleModeChange = (mode: InputControlMode) => {
    updateData({ controlMode: mode });
    // When switching to instant, apply the current target immediately.
    if (mode === "instant") {
      updateData({ appliedValue: d.resolvedTarget });
    }
  };

  const handleValueTypeChange = (vt: InputValueType) => {
    const patch: Partial<InputSourceNodeData> = { valueType: vt };
    if (vt === "bool") {
      patch.min = 0;
      patch.max = 1;
      patch.defaultValue = 0;
      patch.targetValue = 0;
      patch.appliedValue = 0;
    }
    updateData(patch);
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
          Graph Node
        </div>
        <div className="text-base font-semibold text-text-primary">
          {d.label ?? "Input Source"}
        </div>
        <div className="text-xs text-sky-400 mt-0.5">Input Source</div>
      </div>

      {/* Path */}
      <div className="text-xs text-neutral-500">
        <span className="text-neutral-600">Path:</span>{" "}
        <span className="font-mono">{d.inputPath}</span>
      </div>

      {/* ─── Configuration ────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          Configuration
        </h4>
        <div className="space-y-2">
          {/* Value type */}
          <div className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-neutral-300">Value type</span>
              <span className="flex items-center gap-1.5 text-xs text-neutral-600 font-mono">
                <span
                  className="w-2 h-2 rounded-full inline-block"
                  style={{
                    background: portColor.bg,
                    border: `1px solid ${portColor.border}`,
                  }}
                />
                {d.resolvedValueType}
              </span>
            </div>
            <select
              value={d.resolvedValueType}
              onChange={(e) =>
                handleValueTypeChange(e.target.value as InputValueType)
              }
              className="w-full px-2 py-1 text-xs rounded bg-neutral-800 border border-neutral-700 text-neutral-300 focus:outline-none focus:border-sky-500"
            >
              {VALUE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Default value */}
          {d.resolvedValueType !== "bool" && (
            <div className="space-y-0.5">
              <span className="text-sm text-neutral-300">Default</span>
              <input
                type="number"
                value={d.resolvedDefault}
                step={d.resolvedValueType === "i32" ? 1 : "any"}
                onChange={(e) => {
                  const v =
                    d.resolvedValueType === "i32"
                      ? parseInt(e.target.value, 10) || 0
                      : parseFloat(e.target.value) || 0;
                  updateData({ defaultValue: v });
                }}
                className="w-full px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-sky-500 focus:outline-none"
              />
            </div>
          )}

          {/* Min / Max */}
          {d.resolvedValueType !== "bool" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <span className="text-sm text-neutral-300">Min</span>
                <input
                  type="number"
                  value={d.resolvedMin}
                  step={d.resolvedValueType === "i32" ? 1 : "any"}
                  onChange={(e) => {
                    const v =
                      d.resolvedValueType === "i32"
                        ? parseInt(e.target.value, 10) || 0
                        : parseFloat(e.target.value) || 0;
                    updateData({ min: v });
                  }}
                  className="w-full px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>
              <div className="space-y-0.5">
                <span className="text-sm text-neutral-300">Max</span>
                <input
                  type="number"
                  value={d.resolvedMax}
                  step={d.resolvedValueType === "i32" ? 1 : "any"}
                  onChange={(e) => {
                    const v =
                      d.resolvedValueType === "i32"
                        ? parseInt(e.target.value, 10) || 0
                        : parseFloat(e.target.value) || 0;
                    updateData({ max: v });
                  }}
                  className="w-full px-2 py-1 text-sm bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Control ──────────────────────────────────────────────── */}
      <div>
        <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
          Control
        </h4>

        {/* Mode selector */}
        <div className="flex gap-1 mb-3">
          {CONTROL_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => handleModeChange(m.value)}
              className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${
                d.resolvedMode === m.value
                  ? "bg-sky-600 text-white"
                  : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:text-neutral-300"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Value widget */}
        {d.resolvedValueType === "bool" ? (
          <BoolControl value={d.resolvedTarget} onChange={handleSliderChange} />
        ) : (
          <SliderControl
            value={d.resolvedTarget}
            min={d.resolvedMin}
            max={d.resolvedMax}
            step={d.resolvedValueType === "i32" ? 1 : 0.01}
            onChange={handleSliderChange}
          />
        )}

        {/* Applied value indicator */}
        <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-600">
          <span>
            Applied:{" "}
            <span className="font-mono text-neutral-400">
              {d.resolvedApplied.toFixed(3)}
            </span>
          </span>
          {d.resolvedMode === "trigger" &&
            d.resolvedTarget !== d.resolvedApplied && (
              <span className="text-amber-500">pending</span>
            )}
        </div>

        {/* Trigger button */}
        <button
          onClick={handleTrigger}
          disabled={d.resolvedMode === "instant"}
          className={`w-full mt-2 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            d.resolvedMode === "instant"
              ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
              : "bg-sky-600 text-white hover:bg-sky-500 active:bg-sky-700"
          }`}
        >
          Trigger
        </button>
      </div>
    </div>
  );
}

// ─── Slider control ──────────────────────────────────────────────────

function SliderControl({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-20 px-1.5 py-0.5 text-xs bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono focus:border-sky-500 focus:outline-none"
        />
        <span className="text-[10px] text-neutral-600 font-mono">
          [{min}, {max}]
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, #0ea5e9 0%, #0ea5e9 ${pct}%, #404040 ${pct}%, #404040 100%)`,
        }}
      />
    </div>
  );
}

// ─── Bool control ────────────────────────────────────────────────────

function BoolControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const isOn = value !== 0;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(isOn ? 0 : 1)}
        className={`w-10 h-5 rounded-full transition-colors relative ${
          isOn ? "bg-sky-600" : "bg-neutral-700"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            isOn ? "left-5" : "left-0.5"
          }`}
        />
      </button>
      <span className="text-xs text-neutral-400 font-mono">
        {isOn ? "true" : "false"}
      </span>
    </div>
  );
}
