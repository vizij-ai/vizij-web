import React from "react";
import type { CoreEvent } from "@vizij/animation-wasm";

/**
 * EventsLog (MVP)
 * Renders recent CoreEvent items passed from App (collected via provider onOutputs).
 */
export default function EventsLog({ items = [] }: { items?: { ts: number; event: CoreEvent }[] }) {
  return (
    <div style={{ background: "#16191d", border: "1px solid #2a2d31", borderRadius: 8, padding: 10 }}>
      <b>Events</b>
      {items.length === 0 ? (
        <div style={{ opacity: 0.75, fontSize: 12 }}>No events yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 6, marginTop: 8, maxHeight: 280, overflow: "auto" }}>
          {items.slice().reverse().map((it, idx) => (
            <div key={idx} style={{ background: "#1a1d21", border: "1px solid #2a2d31", borderRadius: 6, padding: 8 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                {new Date(it.ts).toLocaleTimeString()} • {Object.keys(it.event)[0]}
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12 }}>
                {JSON.stringify(it.event, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
