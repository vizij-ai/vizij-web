import React, { useEffect, useState } from "react";

interface ParamEditorProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  helpText?: string;
}

/**
 * Lightweight numeric editor that defers validation until commit (blur/enter).
 */
export function ParamEditor({
  label,
  value,
  onCommit,
  min,
  max,
  step,
  disabled,
  helpText,
}: ParamEditorProps) {
  const [draft, setDraft] = useState<string>(() =>
    value === undefined ? "" : Number(value).toString(),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value === undefined ? "" : Number(value).toString());
  }, [value]);

  const commit = (next: string) => {
    if (!next.trim()) {
      setError("Enter a number");
      return;
    }
    const parsed = Number(next);
    if (!Number.isFinite(parsed)) {
      setError("Not a valid number");
      return;
    }
    if (min !== undefined && parsed < min) {
      setError(`Minimum ${min}`);
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`Maximum ${max}`);
      return;
    }
    setError(null);
    onCommit(parsed);
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#cbd5f5" }}>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) {
            setError(null);
          }
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          }
        }}
        style={{
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid #1e293b",
          background: "#0f172a",
          color: "#e2e8f0",
          fontSize: 14,
        }}
      />
      {helpText ? (
        <span style={{ fontSize: 12, color: "#94a3b8" }}>{helpText}</span>
      ) : null}
      {error ? (
        <span style={{ fontSize: 12, color: "#fca5a5" }}>{error}</span>
      ) : null}
    </label>
  );
}
