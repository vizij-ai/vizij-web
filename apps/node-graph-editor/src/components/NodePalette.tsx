import React, { useMemo, useState } from "react";
import { useRegistry } from "../contexts/RegistryProvider";

type PaletteType = {
  id: string;
  label: string;
};

export default function NodePalette(): JSX.Element {
  const { registry, loading, error } = useRegistry();
  const [filter, setFilter] = useState("");

  // Build categories -> types mapping from registry, fallback to a small default set
  const categories = useMemo(() => {
    if (!registry || !registry.nodes) {
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
    for (const n of registry.nodes) {
      const cat = (n.category || "Uncategorized").toString();
      const arr = map.get(cat) ?? [];
      arr.push({ id: n.type_id.toLowerCase(), label: n.name ?? n.type_id });
      map.set(cat, arr);
    }
    return Array.from(map.entries()).map(([title, types]) => ({
      title,
      types: types.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [registry]);

  const onDragStart = (e: React.DragEvent, typeId: string) => {
    // React Flow uses 'application/reactflow' by convention for DnD
    e.dataTransfer.setData("application/reactflow", typeId);
    e.dataTransfer.effectAllowed = "move";
  };

  const filteredCategories = categories.map((c) => ({
    ...c,
    types: c.types.filter((t) =>
      t.label.toLowerCase().includes(filter.trim().toLowerCase()),
    ),
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
            border: "1px solid #ccc",
            background: "#fff",
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
                <div style={{ color: "#888", fontSize: 13 }}>No matches</div>
              ) : (
                cat.types.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, t.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 6,
                      background: "#2a2a2a",
                      color: "#fff",
                      border: "1px solid #444",
                      cursor: "grab",
                      userSelect: "none",
                    }}
                    title={`Drag to canvas: ${t.label}`}
                    aria-roledescription="Draggable node type"
                    role="button"
                  >
                    {t.label}
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
