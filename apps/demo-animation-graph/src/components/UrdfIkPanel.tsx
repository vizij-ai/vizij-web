import React, { useCallback, useMemo, useState } from "react";
import type { ValueJSON } from "@vizij/node-graph-wasm";
import {
  useGraphRuntime,
  useNodeOutput,
  valueAsNumber,
} from "@vizij/node-graph-react";
import { ParamEditor } from "./ParamEditor";

const MAX_URDF_BYTES = 1_000_000; // ~1 MB safeguard

export interface AppliedParams {
  urdf: string;
  root: string;
  tip: string;
  weights: number[];
  seed: number[];
  maxIters: number;
  tolPos: number;
}

interface UrdfIkPanelProps {
  nodeId: string;
  sampleUrdf?: string;
  defaultRoot?: string;
  defaultTip?: string;
  onParamsApplied?: (params: AppliedParams) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

function isRecord(
  value: ValueJSON,
): value is { record: Record<string, ValueJSON> } {
  return typeof value === "object" && value !== null && "record" in value;
}

function parseNumberList(source: string): number[] | null {
  const trimmed = source.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/[,\s]+/).filter(Boolean);
  const values: number[] = [];
  for (const token of tokens) {
    const parsed = Number(token);
    if (!Number.isFinite(parsed)) {
      return null;
    }
    values.push(parsed);
  }
  return values;
}

export function UrdfIkPanel({
  nodeId,
  sampleUrdf,
  defaultRoot = "base_link",
  defaultTip = "tool",
  onParamsApplied,
}: UrdfIkPanelProps) {
  const runtime = useGraphRuntime();
  const jointSnapshot = useNodeOutput(nodeId, "out");

  const jointList = useMemo(() => {
    if (!jointSnapshot?.value) return [];
    const value = jointSnapshot.value as ValueJSON;
    if (!isRecord(value)) return [];
    return Object.entries(value.record).map(([name, entry]) => ({
      name,
      value: valueAsNumber(entry) ?? 0,
    }));
  }, [jointSnapshot]);

  const [urdfText, setUrdfText] = useState<string>(sampleUrdf ?? "");
  const [rootLink, setRootLink] = useState(defaultRoot);
  const [tipLink, setTipLink] = useState(defaultTip);
  const [weightsText, setWeightsText] = useState("");
  const [seedText, setSeedText] = useState("");
  const [maxIters, setMaxIters] = useState<number>(128);
  const [tolPos, setTolPos] = useState<number>(0.005);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const ready = runtime.ready;

  const applyParam = useCallback(
    (key: string, value: any) => {
      if (!ready) return;
      runtime.setParam(nodeId, key, value);
    },
    [nodeId, ready, runtime],
  );

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_URDF_BYTES) {
      setStatus({
        kind: "error",
        message: "URDF file is larger than 1 MB. Please load a smaller model.",
      });
      return;
    }
    const text = await file.text();
    setUrdfText(text);
    setStatus({ kind: "idle" });
  };

  const handleLoad = async () => {
    if (!ready) {
      setStatus({ kind: "error", message: "Graph runtime not ready yet." });
      return;
    }
    if (!urdfText.trim()) {
      setStatus({ kind: "error", message: "Provide URDF XML before loading." });
      return;
    }
    const weightsParsed = parseNumberList(weightsText);
    if (weightsParsed === null) {
      setStatus({
        kind: "error",
        message: "Weights must be a comma or space separated list of numbers.",
      });
      return;
    }
    const seedParsed = parseNumberList(seedText);
    if (seedParsed === null) {
      setStatus({
        kind: "error",
        message: "Seed must be a comma or space separated list of numbers.",
      });
      return;
    }

    setStatus({ kind: "loading" });
    try {
      applyParam("urdf_xml", urdfText);
      applyParam("root_link", rootLink.trim());
      applyParam("tip_link", tipLink.trim());
      applyParam("max_iters", maxIters);
      applyParam("tol_pos", tolPos);

      if (weightsParsed.length > 0) {
        applyParam("weights", weightsParsed);
      } else {
        applyParam("weights", []);
      }

      if (seedParsed.length > 0) {
        applyParam("seed", seedParsed);
      }

      onParamsApplied?.({
        urdf: urdfText,
        root: rootLink.trim(),
        tip: tipLink.trim(),
        weights: weightsParsed,
        seed: seedParsed,
        maxIters,
        tolPos,
      });

      const result = runtime.evalAll();
      if (!result) {
        setStatus({
          kind: "error",
          message:
            "Graph evaluation failed. Check URDF links, seed length, and solver tolerances.",
        });
        return;
      }
      const nodeOutputs = result.nodes?.[nodeId];
      const port = nodeOutputs?.out;
      const successJoints =
        port?.value && isRecord(port.value)
          ? Object.keys(port.value.record)
          : [];
      setStatus({
        kind: "success",
        message:
          successJoints.length > 0
            ? `Loaded URDF. Solver exposed ${successJoints.length} joint(s).`
            : "URDF loaded. Provide a valid target to solve for joints.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus({ kind: "error", message });
    }
  };

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: "#0b1120",
        borderRadius: 12,
        padding: 20,
        border: "1px solid #1e293b",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h3 style={{ margin: 0, color: "#bfdbfe" }}>
          URDF Loader &amp; IK Controls
        </h3>
        <p
          style={{ margin: 0, color: "#cbd5f5", fontSize: 14, lineHeight: 1.6 }}
        >
          Load a URDF definition and configure solver parameters. The IK node
          will resolve joint angles for the current animation target. Leave
          weights and seed empty to use solver defaults.
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flex: "1 1 260px",
          }}
        >
          <span style={{ fontSize: 13, color: "#cbd5f5" }}>URDF XML</span>
          <textarea
            value={urdfText}
            onChange={(event) => {
              setUrdfText(event.target.value);
              if (status.kind !== "idle") setStatus({ kind: "idle" });
            }}
            placeholder="Paste URDF XML or load a file"
            rows={8}
            style={{
              resize: "vertical",
              padding: 10,
              borderRadius: 8,
              border: "1px solid #1e293b",
              background: "#0f172a",
              color: "#e2e8f0",
              fontFamily: "monospace",
              fontSize: 13,
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="file"
              accept=".urdf,.xml,text/xml"
              onChange={handleFile}
              disabled={!ready}
            />
            {sampleUrdf ? (
              <button
                type="button"
                onClick={() => {
                  setUrdfText(sampleUrdf);
                  setStatus({ kind: "idle" });
                }}
                style={{
                  background: "#1d4ed8",
                  color: "#e0f2fe",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                Use sample URDF
              </button>
            ) : null}
          </div>
        </label>

        <div
          style={{
            flex: "1 1 220px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "#cbd5f5" }}>Root link</span>
            <input
              type="text"
              value={rootLink}
              onChange={(event) => setRootLink(event.target.value)}
              placeholder="base_link"
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #1e293b",
                background: "#0f172a",
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "#cbd5f5" }}>Tip link</span>
            <input
              type="text"
              value={tipLink}
              onChange={(event) => setTipLink(event.target.value)}
              placeholder="tool"
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #1e293b",
                background: "#0f172a",
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </label>

          <ParamEditor
            label="Max iterations"
            value={maxIters}
            step={1}
            min={1}
            onCommit={(next) => {
              setMaxIters(next);
              applyParam("max_iters", next);
            }}
          />

          <ParamEditor
            label="Position tolerance (m)"
            value={tolPos}
            step={0.0005}
            min={0.00001}
            onCommit={(next) => {
              setTolPos(next);
              applyParam("tol_pos", next);
            }}
          />

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "#cbd5f5" }}>
              Joint weights (optional)
            </span>
            <input
              type="text"
              value={weightsText}
              placeholder="e.g. 1 0.5 0.5"
              onChange={(event) => setWeightsText(event.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #1e293b",
                background: "#0f172a",
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "#cbd5f5" }}>
              Seed guess (optional)
            </span>
            <input
              type="text"
              value={seedText}
              placeholder="e.g. 0 0 0"
              onChange={(event) => setSeedText(event.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #1e293b",
                background: "#0f172a",
                color: "#e2e8f0",
                fontSize: 14,
              }}
            />
          </label>

          <button
            type="button"
            onClick={handleLoad}
            disabled={!ready || status.kind === "loading"}
            style={{
              background: "#38bdf8",
              color: "#0f172a",
              border: "none",
              borderRadius: 8,
              padding: "10px 14px",
              fontWeight: 600,
              cursor: ready ? "pointer" : "not-allowed",
              opacity: status.kind === "loading" ? 0.7 : 1,
            }}
          >
            {status.kind === "loading" ? "Loading…" : "Load URDF"}
          </button>

          {status.kind === "error" ? (
            <div style={{ color: "#fca5a5", fontSize: 13 }}>
              {status.message}
            </div>
          ) : null}
          {status.kind === "success" ? (
            <div style={{ color: "#86efac", fontSize: 13 }}>
              {status.message}
            </div>
          ) : null}
        </div>
      </div>

      <div
        style={{
          background: "#0f172a",
          borderRadius: 10,
          padding: 16,
          border: "1px solid #1e293b",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <strong style={{ color: "#e2e8f0", fontSize: 14 }}>
          Solver joints (latest evaluation)
        </strong>
        {jointList.length === 0 ? (
          <span style={{ color: "#94a3b8", fontSize: 13 }}>
            Load a URDF and provide a reachable target to populate joint angles.
          </span>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
            {jointList.map(({ name, value }) => (
              <li key={name} style={{ color: "#cbd5f5", fontSize: 13 }}>
                <code style={{ color: "#e0f2fe" }}>{name}</code>:{" "}
                {value.toFixed(3)} rad
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
