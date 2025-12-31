import React, { useMemo, useState } from "react";
import { useRegistry } from "../contexts/RegistryProvider";

type PaletteType = {
  id: string;
  label: string;
  doc?: string;
};

export default function NodePalette(): React.JSX.Element {
  const { loading, error, nodesByType, getNodeSummary } = useRegistry();
  const [filter, setFilter] = useState("");

  // Build categories -> types mapping from registry, fallback to a small default set
  const categories = useMemo(() => {
    if (!nodesByType || nodesByType.size === 0) {
      return [
        {
          title: "Basic",
          types: [
            { id: "constant", label: "Constant" },
            { id: "time", label: "Time" },
            { id: "output", label: "Output" },
          ] as PaletteType[],
        },
      ];
    }

    const map = new Map<string, PaletteType[]>();
    nodesByType.forEach((_entry, typeId) => {
      const summary = getNodeSummary?.(typeId);
      const category = summary?.category || "Uncategorized";
      const arr = map.get(category) ?? [];
      arr.push({
        id: typeId,
        label: summary?.name ?? typeId,
        doc: summary?.doc,
      });
      map.set(category, arr);
    });
    return Array.from(map.entries()).map(([title, types]) => ({
      title,
      types: types.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [nodesByType, getNodeSummary]);

  const onDragStart = (e: React.DragEvent, typeId: string) => {
    // React Flow uses 'application/reactflow' by convention for DnD
    e.dataTransfer.setData("application/reactflow", typeId);
    e.dataTransfer.effectAllowed = "move";
  };

  const filteredCategories = categories.map((c) => ({
    ...c,
    types: c.types.filter((t) => {
      const text = `${t.label} ${t.doc ?? ""}`.toLowerCase();
      return text.includes(filter.trim().toLowerCase());
    }),
  }));

  return (
    <aside style={{ padding: 12 }}>
      <h3 style={{ marginTop: 0 }}>Palette</h3>

      <div style={{ marginBottom: 8 }}>
        <input
          placeholder="Search nodes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.8)",
            color: "#e2e8f0",
          }}
        />
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: 13 }}>Loading node schema…</div>
      ) : error ? (
        <div style={{ color: "#c33", fontSize: 13 }}>
          Schema error: {String(error)}
        </div>
      ) : null}

      <div style={{ marginTop: 8 }}>
        {filteredCategories.map((cat) => (
          <div key={cat.title} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{cat.title}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {cat.types.length === 0 ? (
                <div style={{ color: "#94a3b8", fontSize: 13 }}>No matches</div>
              ) : (
                cat.types.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "rgba(30,41,59,0.85)",
                      color: "#e2e8f0",
                      border: "1px solid rgba(148,163,184,0.35)",
                      cursor: "grab",
                      userSelect: "none",
                    }}
                    title={`Drag to canvas: ${t.label}`}
                    aria-roledescription="Draggable node type"
                    role="button"
                    data-node-type={t.id}
                  >
                    {t.label}
                    {t.doc ? (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          marginTop: 4,
                          lineHeight: 1.35,
                        }}
                      >
                        {t.doc}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
