import React, { useMemo, useState } from "react";

export type PrebindRule = {
  id: string;
  enabled: boolean;
  kind: "exact" | "regex";
  pattern: string; // exact path or regex source
  replacement: string; // replacement or mapped key
};

function applyRules(rules: PrebindRule[], path: string): string | undefined {
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.kind === "exact") {
      if (path === r.pattern) return r.replacement;
    } else {
      try {
        const re = new RegExp(r.pattern);
        if (re.test(path)) {
          return path.replace(re, r.replacement);
        }
      } catch {
        // ignore invalid regex at runtime
      }
    }
  }
  // default: identity
  return path;
}

export function makeResolver(rules: PrebindRule[]) {
  return (path: string) => {
    const res = applyRules(rules, path);
    // numbers allowed by engine; we keep string for UI simplicity
    return res ?? path;
  };
}

export default function PrebindPanel({
  keys,
  rules,
  setRules,
}: {
  keys: string[];
  rules: PrebindRule[];
  setRules: (r: PrebindRule[]) => void;
}) {
  const [newKind, setNewKind] = useState<"exact" | "regex">("exact");
  const [newPattern, setNewPattern] = useState("");
  const [newReplacement, setNewReplacement] = useState("");

  const preview = useMemo(() => {
    const mapping: { path: string; key: string }[] = [];
    const collisions = new Map<string, number>();
    for (const p of keys) {
      const k = applyRules(rules, p) ?? p;
      mapping.push({ path: p, key: String(k) });
      collisions.set(String(k), (collisions.get(String(k)) ?? 0) + 1);
    }
    const dupKeys = new Set<string>([...collisions.entries()].filter(([, n]) => n > 1).map(([k]) => k));
    return { mapping, dupKeys };
  }, [keys, rules]);

  const addRule = () => {
    if (!newPattern) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setRules([
      ...rules,
      { id, enabled: true, kind: newKind, pattern: newPattern, replacement: newReplacement || "$&" },
    ]);
    setNewPattern("");
    setNewReplacement("");
    setNewKind("exact");
  };

  const removeRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
  };

  const updateRule = (id: string, patch: Partial<PrebindRule>) => {
    setRules(
      rules.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const moveRule = (id: string, dir: -1 | 1) => {
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const next = rules.slice();
    const [item] = next.splice(idx, 1);
    next.splice(j, 0, item);
    setRules(next);
  };

  return (
    <section style={{ background: "#16191d", border: "1px solid #2a2d31", borderRadius: 8, padding: 10 }}>
      <b>Prebind Manager</b>
      <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 8 }}>
        Map canonical target paths to user-friendly keys. Rules apply in order; first match wins.
        Collisions are highlighted. Leave empty to use identity mapping.
      </div>

      {/* Rule editor */}
      <div style={{ display: "grid", gap: 6, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as any)}>
            <option value="exact">Exact</option>
            <option value="regex">Regex</option>
          </select>
          <input
            placeholder={newKind === "exact" ? "path (e.g. studio/vec3)" : "regex (e.g. ^studio/(.+)$)"}
            value={newPattern}
            onChange={(e) => setNewPattern(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            placeholder={newKind === "regex" ? "replacement (e.g. my/$1)" : "replacement key"}
            value={newReplacement}
            onChange={(e) => setNewReplacement(e.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button onClick={addRule}>Add Rule</button>
        </div>

        {rules.length > 0 && (
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {rules.map((r, i) => (
              <div key={r.id} style={{ display: "grid", gap: 6, border: "1px solid #2a2d31", borderRadius: 6, padding: 8, background: "#1a1d21" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input type="checkbox" checked={r.enabled} onChange={(e) => updateRule(r.id, { enabled: e.target.checked })} />
                    <span style={{ opacity: 0.8, fontSize: 12 }}>Enabled</span>
                  </label>
                  <select value={r.kind} onChange={(e) => updateRule(r.id, { kind: e.target.value as any })}>
                    <option value="exact">Exact</option>
                    <option value="regex">Regex</option>
                  </select>
                  <input
                    value={r.pattern}
                    onChange={(e) => updateRule(r.id, { pattern: e.target.value })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <input
                    value={r.replacement}
                    onChange={(e) => updateRule(r.id, { replacement: e.target.value })}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <button onClick={() => moveRule(r.id, -1)} disabled={i === 0}>↑</button>
                    <button onClick={() => moveRule(r.id, +1)} disabled={i === rules.length - 1}>↓</button>
                    <button onClick={() => removeRule(r.id)}>Remove</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview */}
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
          <span>Preview</span>
          {preview.dupKeys.size > 0 && (
            <span style={{ fontSize: 12, color: "#f87171" }}>
              {preview.dupKeys.size} collision key(s)
            </span>
          )}
        </div>
        <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid #2a2d31", borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#0f1113" }}>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #2a2d31" }}>Path</th>
                <th style={{ textAlign: "left", padding: 6, borderBottom: "1px solid #2a2d31" }}>Key</th>
              </tr>
            </thead>
            <tbody>
              {preview.mapping.map(({ path, key }) => (
                <tr key={path} style={{ background: preview.dupKeys.has(key) ? "#271b1b" : undefined }}>
                  <td style={{ padding: 6, borderBottom: "1px solid #2a2d31" }}>
                    <code style={{ wordBreak: "break-all" }}>{path}</code>
                  </td>
                  <td style={{ padding: 6, borderBottom: "1px solid #2a2d31" }}>
                    <code style={{ wordBreak: "break-all" }}>{key}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
