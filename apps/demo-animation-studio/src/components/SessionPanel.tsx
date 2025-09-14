import React, { useRef, useState } from "react";
import type { StoredAnimation, Config } from "@vizij/animation-wasm";
import type { InstanceSpec } from "./PlayersPanel";
import type { PrebindRule } from "./PrebindPanel";

export type SessionState = {
  animations: StoredAnimation[];
  instances: InstanceSpec[];
  engineCfg?: Config;
  rules: PrebindRule[];
  updateHz: number;
  historyWindowSec: number;
};

export default function SessionPanel({
  value,
  onImport,
}: {
  value: SessionState;
  onImport: (next: SessionState) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");

  const doExport = () => {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = "vizij-animation-session.json";
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doOpenFile = () => {
    fileRef.current?.click();
  };

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = async (
    e,
  ) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    setText(txt);
  };

  const doApply = () => {
    try {
      const parsed = JSON.parse(text);
      // Minimal validation
      if (!Array.isArray(parsed.animations))
        throw new Error("Missing animations[]");
      if (!Array.isArray(parsed.instances))
        throw new Error("Missing instances[]");
      if (!Array.isArray(parsed.rules)) throw new Error("Missing rules[]");
      if (typeof parsed.updateHz !== "number")
        throw new Error("Missing updateHz");
      if (typeof parsed.historyWindowSec !== "number")
        throw new Error("Missing historyWindowSec");
      onImport(parsed as SessionState);
    } catch (e: any) {
      alert("Import failed: " + (e?.message ?? String(e)));
    }
  };

  return (
    <section
      style={{
        background: "#16191d",
        border: "1px solid #2a2d31",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <b>Session</b>
      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 8 }}>
        Export or import the demo session (animations, instances, engine config,
        prebind rules, chart prefs).
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={doExport}>Export JSON</button>
        <button onClick={doOpenFile}>Open File…</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={onFileChange}
        />
      </div>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        <textarea
          placeholder="Paste session JSON here or use Open File…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          style={{
            width: "100%",
            minHeight: 140,
            background: "#0f1113",
            color: "#eaeaea",
            border: "1px solid #2a2d31",
            borderRadius: 6,
            padding: 8,
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doApply}>Apply Import</button>
          <button onClick={() => setText("")}>Clear</button>
        </div>
      </div>
    </section>
  );
}
