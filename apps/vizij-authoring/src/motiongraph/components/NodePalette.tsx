import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { DragEvent } from "react";
import { useRegistry } from "../contexts/RegistryProvider";

type PaletteItem = { id: string; label: string; doc?: string };
type PaletteCategory = { title: string; types: PaletteItem[] };

export default function NodePalette() {
  const { loading, error, nodesByType, getNodeSummary } = useRegistry();
  const [filter, setFilter] = useState("");
  const [collapsedSet, setCollapsedSet] = useState<Set<string>>(new Set());
  const initialCollapseRef = useRef(false);

  const categories = useMemo<PaletteCategory[]>(() => {
    if (!nodesByType || nodesByType.size === 0) {
      return [
        {
          title: "Basic",
          types: [
            { id: "constant", label: "Constant" },
            { id: "time", label: "Time" },
            { id: "output", label: "Output" },
          ],
        },
      ];
    }

    const map = new Map<string, PaletteItem[]>();
    nodesByType.forEach((_entry, typeId) => {
      const summary = getNodeSummary(typeId);
      const category = summary?.category || "Uncategorized";
      const arr = map.get(category) ?? [];
      arr.push({
        id: typeId,
        label: summary?.name ?? typeId,
        doc: summary?.doc,
      });
      map.set(category, arr);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, types]) => ({
        title,
        types: types.sort((a, b) => a.label.localeCompare(b.label)),
      }));
  }, [nodesByType, getNodeSummary]);

  // Collapse all categories on first load.
  useEffect(() => {
    if (!initialCollapseRef.current && categories.length > 0 && !loading) {
      initialCollapseRef.current = true;
      setCollapsedSet(new Set(categories.map((c) => c.title)));
    }
  }, [categories, loading]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map((cat) => ({
        ...cat,
        types: cat.types.filter(
          (t) =>
            t.label.toLowerCase().includes(q) ||
            (t.doc ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.types.length > 0);
  }, [categories, filter]);

  const collapseAll = useCallback(() => {
    setCollapsedSet(new Set(filtered.map((c) => c.title)));
  }, [filtered]);

  const expandAll = useCallback(() => {
    setCollapsedSet(new Set());
  }, []);

  const toggleCategory = useCallback((title: string) => {
    setCollapsedSet((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }, []);

  const onDragStart = (e: DragEvent, typeId: string) => {
    e.dataTransfer.setData("application/reactflow", typeId);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="h-full flex flex-col bg-bg-panel text-text-primary">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border-default">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
            Palette
          </h3>
          <div className="flex items-center gap-1.5">
            <button
              onClick={expandAll}
              className="px-2 py-1 text-xs rounded border border-border-default bg-bg-panel text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
              title="Expand all categories"
            >
              Expand
            </button>
            <button
              onClick={collapseAll}
              className="px-2 py-1 text-xs rounded border border-border-default bg-bg-panel text-text-muted hover:text-text-primary hover:border-border-hover transition-colors"
              title="Collapse all categories"
            >
              Collapse
            </button>
          </div>
        </div>
        <input
          placeholder="Search nodes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded bg-bg-input border border-border-default text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border-hover"
        />
      </div>

      {/* Status */}
      {loading && (
        <p className="px-4 py-3 text-sm text-text-muted">
          Loading node schemas...
        </p>
      )}
      {error && (
        <p className="px-4 py-3 text-sm text-red-300">Error: {error}</p>
      )}

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {filtered.map((cat) => (
          <CategorySection
            key={cat.title}
            title={cat.title}
            types={cat.types}
            collapsed={collapsedSet.has(cat.title)}
            onToggle={() => toggleCategory(cat.title)}
            onDragStart={onDragStart}
          />
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-text-muted">No matching nodes</p>
        )}
      </div>
    </div>
  );
}

// ─── Category section ───────────────────────────────────────────────

function CategorySection({
  title,
  types,
  collapsed,
  onToggle,
  onDragStart,
}: {
  title: string;
  types: PaletteItem[];
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: (e: DragEvent, typeId: string) => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left text-sm font-semibold text-text-secondary hover:text-text-primary mb-2"
      >
        <span className="text-xs">{collapsed ? "\u25B6" : "\u25BC"}</span>
        {title}
        <span className="text-text-muted font-normal ml-auto text-xs">
          {types.length}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-2 pl-2">
          {types.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => onDragStart(e, t.id)}
              className="px-3 py-2.5 rounded-md bg-bg-panel border border-border-default cursor-grab hover:border-border-hover hover:bg-bg-hover select-none active:cursor-grabbing"
              title={t.doc || `Drag to canvas: ${t.label}`}
              data-node-type={t.id}
            >
              <span className="text-sm text-text-primary font-medium">
                {t.label}
              </span>
              {t.doc && (
                <p className="text-xs leading-relaxed text-text-muted mt-1 line-clamp-2">
                  {t.doc}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
