import {
  useCallback,
  useMemo,
  useState,
  useId,
  useRef,
  type ChangeEvent,
} from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

type RigInputOption = {
  path: string;
  label: string;
  id?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
};

export function RigControlPanel() {
  const { ready, assetBundle, setInput, step, inputConstraints, namespace } =
    useVizijRuntime();
  const rigSpec = assetBundle.rig?.spec;
  const rigInputOptions = useMemo(
    () => extractRigInputOptions(rigSpec, inputConstraints, namespace),
    [rigSpec, inputConstraints, namespace],
  );

  const handleStageValue = useCallback(
    (path: string, value: number) => {
      setInput(path, { float: value });
      step(1 / 30, { forceRuntime: true });
    },
    [setInput, step],
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

function namespaceTypedPath(path: string, namespace: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  const prefix = `${namespace}/`;
  if (trimmed.startsWith(prefix)) return trimmed;
  return `${prefix}${trimmed}`;
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
              ? "Search any feature path (e.g. rig/face/smile_left)"
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

function extractRigInputOptions(
  spec: unknown,
  constraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  > = {},
  namespace: string,
): RigInputOption[] {
  if (!spec || typeof spec !== "object") {
    return [];
  }
  const nodes = Array.isArray((spec as { nodes?: unknown }).nodes)
    ? ((spec as { nodes?: unknown }).nodes as unknown[])
    : [];
  const options: RigInputOption[] = [];
  nodes.forEach((node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const type = String((node as { type?: unknown }).type ?? "").toLowerCase();
    if (type !== "input") {
      return;
    }
    const params = (node as { params?: unknown }).params;
    const path =
      params && typeof params === "object"
        ? (params as { path?: unknown }).path
        : undefined;
    if (typeof path !== "string") {
      return;
    }
    const trimmed = path.trim();
    if (!trimmed) {
      return;
    }
    const label =
      typeof (node as { label?: unknown }).label === "string"
        ? ((node as { label?: string }).label as string)
        : trimmed;
    const numericOrUndefined = (val: unknown): number | undefined => {
      const num = Number(val);
      return Number.isFinite(num) ? num : undefined;
    };
    const namespaced = namespaceTypedPath(trimmed, namespace);
    const stripped =
      trimmed.startsWith("rig/") && trimmed.split("/").length > 2
        ? trimmed.split("/").slice(2).join("/")
        : trimmed.startsWith("/")
          ? trimmed.slice(1)
          : trimmed;
    const namespacedStripped = namespaceTypedPath(stripped, namespace);
    const fromConstraints =
      constraints[trimmed] ??
      constraints[namespaced] ??
      constraints[stripped] ??
      constraints[namespacedStripped];
    options.push({
      path: trimmed,
      label,
      id:
        typeof (node as { id?: unknown }).id === "string"
          ? String((node as { id?: unknown }).id)
          : undefined,
      min:
        fromConstraints?.min ??
        (params && typeof params === "object"
          ? numericOrUndefined((params as { min?: unknown }).min)
          : undefined),
      max:
        fromConstraints?.max ??
        (params && typeof params === "object"
          ? numericOrUndefined((params as { max?: unknown }).max)
          : undefined),
      defaultValue:
        fromConstraints?.defaultValue ??
        (params && typeof params === "object"
          ? numericOrUndefined(
              (params as { default?: unknown; value?: unknown }).default ??
                (params as { value?: unknown }).value,
            )
          : undefined),
    });
  });
  return options.sort((a, b) => a.path.localeCompare(b.path));
}
