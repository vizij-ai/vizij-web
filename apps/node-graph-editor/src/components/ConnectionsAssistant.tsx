import React, { useEffect, useState } from "react";

/**
 * ConnectionsAssistant
 * - Small UI component that displays the most recent blocked-connection reason and suggestions.
 * - Designed to be shown near the canvas (positioning left to the implementer).
 *
 * Usage:
 * - The EditorCanvas currently blocks incompatible connections and logs a reason.
 * - To surface blocking reasons to the user, call `showBlocked(reason, suggestions)` (e.g. from EditorCanvas)
 *   or lift state into a shared store and render this component to display the last message.
 *
 * For now this component exports a simple programmatic API via window.__vizijConnectionsAssistant
 * to avoid complex wiring. This is intended as a temporary developer convenience and should be
 * replaced with proper context/store wiring later.
 */

type Suggestion = {
  title: string;
  detail?: string;
};

export default function ConnectionsAssistant(): JSX.Element {
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    // Expose a simple programmatic API so other components can notify this assistant.
    // Example: window.__vizijConnectionsAssistant?.show("Incompatible types", [{title: "Cast to float"}])
    (window as any).__vizijConnectionsAssistant = {
      show: (r: string, s?: Suggestion[]) => {
        setReason(r);
        setSuggestions(s ?? []);
        setVisible(true);
        // auto-hide after 4s
        setTimeout(() => setVisible(false), 4000);
      },
      clear: () => {
        setVisible(false);
        setReason(null);
        setSuggestions([]);
      },
    };

    return () => {
      try {
        delete (window as any).__vizijConnectionsAssistant;
      } catch {}
    };
  }, []);

  if (!visible || !reason) return <div style={{ display: "none" }} />;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        zIndex: 1000,
        minWidth: 260,
        maxWidth: 420,
        background: "#111827",
        color: "#f8fafc",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: 12,
        borderRadius: 8,
        boxShadow: "0 6px 18px rgba(2,6,23,0.6)",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Connection blocked</div>
      <div style={{ color: "#e5e7eb", marginBottom: 8 }}>{reason}</div>
      {suggestions.length > 0 ? (
        <div
          style={{
            borderTop: "1px dashed rgba(255,255,255,0.04)",
            paddingTop: 8,
          }}
        >
          <div style={{ fontSize: 12, color: "#9aa0a6", marginBottom: 6 }}>
            Suggestions
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {suggestions.map((s, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{s.title}</div>
                {s.detail ? (
                  <div style={{ fontSize: 12, color: "#cbd5e1" }}>
                    {s.detail}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
