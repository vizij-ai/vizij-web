import { useCallback, useMemo, useState, useId, useRef } from "react";
import type { ChangeEvent } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

type RigInputOption = {
  path: string;
  label: string;
  id?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
};

/**
 * Any input of the face's rig, from `describe(glb).rigInputs`: search a
 * path, stage a value, and the slider writes it at
 * `runtime.path(input.path)`.
 */
export function RigControlPanel() {
  const { runtime, description, status } = useVizijRuntime();
  const ready = status === "ready";
  const rigInputOptions = useMemo<RigInputOption[]>(
    () =>
      (description?.rigInputs ?? [])
        .map((input) => ({
          path: input.path,
          label: input.label ?? input.path,
          id: input.id ?? undefined,
          min: input.min ?? undefined,
          max: input.max ?? undefined,
          defaultValue: input.defaultValue ?? undefined,
        }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [description],
  );

  const handleStageValue = useCallback(
    (path: string, value: number) => {
      runtime?.setValue(runtime.path(path), value);
    },
    [runtime],
  );

  return (
    <InputStager
      inputs={rigInputOptions}
      disabled={!ready}
      onStage={handleStageValue}
      constraintsCount={countWithConstraints(rigInputOptions)}
    />
  );
}

function countWithConstraints(options: RigInputOption[]): {
  total: number;
  resolved: number;
} {
  const total = options.length;
  const resolved = options.filter(
    (opt) =>
      opt.min !== undefined ||
      opt.max !== undefined ||
      opt.defaultValue !== undefined,
  ).length;
  return { total, resolved };
}

type InputStagerProps = {
  inputs: RigInputOption[];
  disabled: boolean;
  onStage: (path: string, value: number) => void;
  constraintsCount: { total: number; resolved: number };
};

function InputStager({
  inputs,
  disabled,
  onStage,
  constraintsCount,
}: InputStagerProps) {
  const FALLBACK_MIN = -1;
  const FALLBACK_MAX = 1;
  const FALLBACK_DEFAULT = 0;
  const [query, setQuery] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [stagedValues, setStagedValues] = useState<Record<string, number>>({});
  const [valueDraft, setValueDraft] = useState("");
  const listId = useId();
  const warnedMissingRef = useRef<Set<string>>(new Set());

  const getBounds = useCallback(
    (path: string) => {
      const option = inputs.find((opt) => opt.path === path);
      const min = option?.min ?? FALLBACK_MIN;
      const max = option?.max ?? FALLBACK_MAX;
      const defaultValue = option?.defaultValue ?? FALLBACK_DEFAULT;
      if (
        process.env.NODE_ENV !== "production" &&
        option?.min === undefined &&
        option?.max === undefined &&
        option?.defaultValue === undefined
      ) {
        if (!warnedMissingRef.current.has(path)) {
          warnedMissingRef.current.add(path);
          console.warn(
            "[vizij-showcase] No constraints for path; using fallback range",
            { path, min, max, defaultValue },
          );
        }
      }
      return { min, max, defaultValue };
    },
    [inputs],
  );

  const addPath = useCallback(
    (path: string) => {
      const existing = stagedValues[path];
      const { defaultValue, min, max } = getBounds(path);
      const clamped =
        existing != null
          ? existing
          : Math.min(max, Math.max(min, defaultValue));
      if (existing == null) {
        setStagedValues((prev) => ({ ...prev, [path]: clamped }));
        onStage(path, clamped);
      }
      setSelectedPath(path);
      setValueDraft(String(clamped));
      setQuery("");
    },
    [getBounds, onStage, stagedValues],
  );

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setQuery(value);
      const match = inputs.find((option) => option.path === value);
      if (match) {
        addPath(match.path);
      }
    },
    [inputs, addPath],
  );

  const clampValue = useCallback(
    (path: string, value: number) => {
      const { min, max } = getBounds(path);
      return Math.min(max, Math.max(min, value));
    },
    [getBounds],
  );

  const stageValue = useCallback(
    (path: string, numeric: number) => {
      const clamped = clampValue(path, numeric);
      setStagedValues((prev) => ({
        ...prev,
        [path]: clamped,
      }));
      onStage(path, clamped);
      if (path === selectedPath) {
        setValueDraft(String(clamped));
      }
    },
    [clampValue, onStage, selectedPath],
  );

  const handleValueChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setValueDraft(nextValue);
      if (!selectedPath || nextValue.trim() === "") {
        return;
      }
      const numeric = Number(nextValue);
      if (!Number.isFinite(numeric)) {
        return;
      }
      stageValue(selectedPath, numeric);
    },
    [selectedPath, stageValue],
  );

  const handleReset = useCallback(
    (path: string) => {
      if (!path) {
        return;
      }
      setStagedValues((prev) => {
        if (!(path in prev)) {
          return prev;
        }
        const next = { ...prev };
        delete next[path];
        return next;
      });
      if (selectedPath === path) {
        setValueDraft("");
      }
      const { defaultValue, min, max } = getBounds(path);
      const clamped = Math.min(max, Math.max(min, defaultValue));
      onStage(path, clamped);
    },
    [onStage, selectedPath],
  );

  const handleResetAll = useCallback(() => {
    const paths = Object.keys(stagedValues);
    if (paths.length === 0) {
      return;
    }
    paths.forEach((path) => {
      const { defaultValue, min, max } = getBounds(path);
      const clamped = Math.min(max, Math.max(min, defaultValue));
      onStage(path, clamped);
    });
    setStagedValues({});
    if (paths.includes(selectedPath)) {
      setValueDraft("");
    }
  }, [getBounds, onStage, stagedValues, selectedPath]);

  const filteredInputs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return inputs.slice(0, 20);
    }
    return inputs
      .filter((option) => option.path.toLowerCase().includes(term))
      .slice(0, 20);
  }, [inputs, query]);

  const selectedLabel =
    inputs.find((option) => option.path === selectedPath)?.label ??
    selectedPath;

  return (
    <div className="input-stage">
      <div className="input-stage__header">
        <div>
          <p className="input-stage__title">Direct feature overrides</p>
          <p className="input-stage__subtitle">
            Search any path on the face and set an exact value—color, opacity,
            transforms, anything the rig exposes.
          </p>
          <p className="input-stage__subtitle input-stage__subtitle--meta">
            Authored ranges resolved for {constraintsCount.resolved} of{" "}
            {constraintsCount.total} inputs.
          </p>
        </div>
        <button
          type="button"
          className="input-stage__reset-all"
          onClick={handleResetAll}
          disabled={disabled || Object.keys(stagedValues).length === 0}
        >
          Reset all
        </button>
      </div>

      <label className="input-stage__label">
        <span>Rig input path</span>
        <input
          type="search"
          list={listId}
          className="input-stage__search"
          placeholder={
            inputs.length > 0
              ? "Search any feature path (e.g. mouth/smile)"
              : "No feature paths available"
          }
          value={query}
          onChange={handleQueryChange}
          disabled={disabled || inputs.length === 0}
        />
        <datalist id={listId}>
          {filteredInputs.map((option) => (
            <option key={option.path} value={option.path}>
              {option.label}
            </option>
          ))}
        </datalist>
      </label>

      {selectedPath && (
        <div className="input-stage__value-row">
          <label className="input-stage__label">
            <span>Value for {selectedLabel || selectedPath}</span>
            <input
              type="number"
              className="input-stage__number"
              step="0.01"
              value={valueDraft}
              onChange={handleValueChange}
              disabled={disabled}
            />
          </label>
          <button
            type="button"
            className="input-stage__reset"
            onClick={() => handleReset(selectedPath)}
            disabled={disabled}
          >
            Reset
          </button>
        </div>
      )}

      {Object.keys(stagedValues).length > 0 && (
        <div className="input-stage__staged">
          <p className="input-stage__subtitle">Staged overrides</p>
          <ul>
            {Object.entries(stagedValues).map(([path, value]) => (
              <li key={path} className="input-stage__staged-item">
                <div className="input-stage__staged-meta">
                  <strong>{path}</strong>
                  <span> → {value.toFixed(2)}</span>
                </div>
                <div className="input-stage__staged-controls">
                  <input
                    type="range"
                    className="input-stage__slider"
                    min={getBounds(path).min}
                    max={getBounds(path).max}
                    step={0.01}
                    value={value}
                    onChange={(event) =>
                      stageValue(path, Number(event.target.value))
                    }
                    disabled={disabled}
                  />
                  <button
                    type="button"
                    className="input-stage__pill-reset"
                    onClick={() => handleReset(path)}
                    disabled={disabled}
                  >
                    Reset
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
