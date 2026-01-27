import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent } from "react";
import { useGraphRuntime } from "@vizij/node-graph-react";
import { valueAsNumber } from "@vizij/value-json";
import type { JSX } from "react/jsx-runtime";
import { useRegistry } from "../contexts/RegistryProvider";
import { useEditorStore } from "../store/useEditorStore";

type SupportedKind = "float" | "bool";

type InputEntry = {
  nodeId: string;
  nodeLabel: string;
  path: string;
  kind: SupportedKind | "unsupported";
  description?: string | null;
  defaultValue: number | boolean;
  min?: number;
  max?: number;
  step?: number;
};

const FALLBACK_MIN = -1;
const FALLBACK_MAX = 1;
const FALLBACK_STEP = 0.01;

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (Array.isArray(value)) {
    const [first] = value;
    return toNumber(first);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("float" in record && typeof record.float === "number") {
      return record.float;
    }
    if ("value" in record) {
      return toNumber(record.value);
    }
    if ("data" in record) {
      return toNumber(record.data);
    }
  }
  return undefined;
}

export default function InputPanel(): JSX.Element {
  const nodes = useEditorStore((s) => s.nodes);
  const runtime = useGraphRuntime();
  const { getNodeSummary } = useRegistry();
  const runtimeReady = runtime.ready;

  const inputEntries = useMemo<InputEntry[]>(() => {
    if (!Array.isArray(nodes) || nodes.length === 0) return [];

    const results: InputEntry[] = [];

    nodes.forEach((node) => {
      const typeId = String(node.type ?? "").toLowerCase();
      if (typeId !== "input") return;

      const params = (node.data?.params ?? {}) as Record<string, unknown>;
      const rawPath = typeof params.path === "string" ? params.path.trim() : "";
      if (!rawPath) return;

      const summary = getNodeSummary?.(String(node.type ?? ""));
      const rawValue = params.value ?? null;

      let normalizedNumber: number | undefined;
      if (rawValue && typeof rawValue === "object") {
        normalizedNumber = valueAsNumber(rawValue as any);
      }
      const naiveNumber =
        normalizedNumber !== undefined ? normalizedNumber : toNumber(rawValue);

      let kind: InputEntry["kind"] = "unsupported";
      let defaultValue: number | boolean = 0;

      if (typeof rawValue === "boolean") {
        kind = "bool";
        defaultValue = rawValue;
      } else if (typeof naiveNumber === "number") {
        kind = "float";
        defaultValue = naiveNumber;
      } else if (rawValue && typeof rawValue === "object") {
        const rawRecord = rawValue as Record<string, unknown>;
        if ("bool" in rawRecord) {
          kind = "bool";
          defaultValue = Boolean(rawRecord.bool);
        } else if ("float" in rawRecord) {
          kind = "float";
          defaultValue = Number(rawRecord.float ?? 0);
        }
      }

      const min =
        typeof (params.min as number | undefined) === "number"
          ? (params.min as number)
          : undefined;
      const max =
        typeof (params.max as number | undefined) === "number"
          ? (params.max as number)
          : undefined;

      if (kind === "unsupported") {
        kind = "float";
        defaultValue = 0;
      }

      results.push({
        nodeId: node.id,
        nodeLabel:
          (node.data?.label as string) ??
          summary?.name ??
          String(node.id ?? rawPath),
        path: rawPath,
        kind,
        description: summary?.doc ?? null,
        defaultValue:
          kind === "bool"
            ? Boolean(defaultValue)
            : Number((defaultValue as number) ?? 0),
        min,
        max,
        step:
          typeof (params.step as number | undefined) === "number"
            ? (params.step as number)
            : undefined,
      });
    });

    return results;
  }, [nodes, getNodeSummary]);

  const [values, setValues] = useState<Record<string, number | boolean>>({});
  const stagedRef = useRef<Record<string, number | boolean>>({});

  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, number | boolean> = {};
      for (const entry of inputEntries) {
        const existing = prev[entry.path];
        if (typeof existing === "number" || typeof existing === "boolean") {
          next[entry.path] = existing;
        } else {
          next[entry.path] = entry.defaultValue;
        }
      }
      return next;
    });
  }, [inputEntries]);

  useEffect(() => {
    if (!runtimeReady) return;
    for (const entry of inputEntries) {
      const val = values[entry.path];
      if (val === undefined) continue;
      const prev = stagedRef.current[entry.path];
      if (prev === val) continue;
      stagedRef.current[entry.path] = val;
      if (entry.kind === "bool") {
        runtime.stageInput?.(entry.path, Boolean(val), undefined, true);
      } else if (entry.kind === "float") {
        runtime.stageInput?.(entry.path, Number(val), undefined, true);
      }
    }
  }, [inputEntries, runtime, runtimeReady, values]);

  const stageFloat = useCallback(
    (path: string, value: number) => {
      setValues((prev) => ({ ...prev, [path]: value }));
      runtime.stageInput?.(path, value, undefined, true);
      stagedRef.current[path] = value;
    },
    [runtime],
  );

  const stageBool = useCallback(
    (path: string, value: boolean) => {
      setValues((prev) => ({ ...prev, [path]: value }));
      runtime.stageInput?.(path, value, undefined, true);
      stagedRef.current[path] = value;
    },
    [runtime],
  );

  const handleSliderChange = useCallback(
    (path: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) return;
      stageFloat(path, next);
    },
    [stageFloat],
  );

  const handleNumberInputChange = useCallback(
    (path: string) => (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      if (!Number.isFinite(next)) return;
      stageFloat(path, next);
    },
    [stageFloat],
  );

  if (inputEntries.length === 0) {
    return (
      <aside className="nge-inputs">
        <h3 className="nge-inputs__title">Inputs</h3>
        <div className="nge-inputs__empty">
          No `input` nodes detected in the current graph.
        </div>
      </aside>
    );
  }

  return (
    <aside className="nge-inputs">
      <h3 className="nge-inputs__title">Inputs</h3>
      <div className="nge-inputs__body">
        {inputEntries.map((entry) => {
          const currentValue = values[entry.path] ?? entry.defaultValue;
          const key = `${entry.nodeId}:${entry.path}`;
          return (
            <div key={key} className="nge-inputs__item">
              <div className="nge-inputs__item-header">
                <div className="nge-inputs__item-label">{entry.nodeLabel}</div>
                <code className="nge-inputs__item-path">{entry.path}</code>
              </div>
              {entry.description ? (
                <div className="nge-inputs__item-doc">{entry.description}</div>
              ) : null}

              {entry.kind === "float" ? (
                <div className="nge-inputs__control">
                  <input
                    type="range"
                    min={entry.min !== undefined ? entry.min : FALLBACK_MIN}
                    max={entry.max !== undefined ? entry.max : FALLBACK_MAX}
                    step={entry.step ?? FALLBACK_STEP}
                    value={Number(currentValue ?? 0)}
                    onChange={handleSliderChange(entry.path)}
                    className="nge-inputs__slider"
                    disabled={!runtimeReady}
                  />
                  <div className="nge-inputs__control-row">
                    <input
                      type="number"
                      value={Number(currentValue ?? 0)}
                      onChange={handleNumberInputChange(entry.path)}
                      className="nge-inputs__number"
                      disabled={!runtimeReady}
                    />
                    <span className="nge-inputs__range">
                      [{entry.min ?? FALLBACK_MIN} … {entry.max ?? FALLBACK_MAX}
                      ]
                    </span>
                  </div>
                </div>
              ) : entry.kind === "bool" ? (
                <label className="nge-inputs__toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(currentValue)}
                    onChange={(event) =>
                      stageBool(entry.path, event.target.checked)
                    }
                    disabled={!runtimeReady}
                  />
                  <span>Active</span>
                </label>
              ) : (
                <div className="nge-inputs__control">
                  <input
                    type="number"
                    value={Number(currentValue ?? 0)}
                    onChange={handleNumberInputChange(entry.path)}
                    className="nge-inputs__number"
                    disabled={!runtimeReady}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
