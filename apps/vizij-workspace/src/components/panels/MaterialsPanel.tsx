import { useMemo, useState, useCallback } from "react";
import { Palette, Box, Plus } from "lucide-react";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Panel, PanelSearch, TreeRow, Button } from "../ui";
import { useHierarchyTreeState } from "../scene-composer/useHierarchyTreeState";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { useUnifiedSelection } from "../../hooks/useUnifiedSelection";

export function MaterialsPanel() {
  const { materials, createMaterial } = useSceneComposer();
  const { selectedMaterialId, handleSelectMaterial } = useUnifiedSelection();

  const [search, setSearch] = useState("");

  const filteredMaterials = useMemo(() => {
    if (!search.trim()) return materials;
    const query = search.toLowerCase();
    return materials.filter(
      (m) =>
        m.label.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query),
    );
  }, [materials, search]);

  const { isExpanded, toggleNode } = useHierarchyTreeState(
    `${DEFAULT_NAMESPACE}_materials`,
    materials.map((m) => m.id),
  );

  const handleSelect = useCallback(
    (id: string) => {
      handleSelectMaterial(id);
    },
    [handleSelectMaterial],
  );

  const handleCreate = useCallback(() => {
    const newId = createMaterial(search);
    if (newId) {
      handleSelectMaterial(newId);
      setSearch("");
    }
  }, [createMaterial, handleSelectMaterial, search]);

  const showCreateOption = useMemo(() => {
    if (!search.trim()) return false;
    const query = search.trim().toLowerCase();
    return !materials.some((m) => m.label.toLowerCase() === query);
  }, [materials, search]);

  return (
    <Panel
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      title="Materials"
      description="Manage shared materials and surface properties."
    >
      <div className="flex flex-col h-full gap-1 p-1">
        <div className="flex items-center gap-2 px-1 mb-1">
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder="Filter materials..."
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0 hover:bg-accent/10 hover:text-accent"
            onClick={() => {
              const newId = createMaterial(`Material ${materials.length + 1}`);
              if (newId) handleSelectMaterial(newId);
            }}
            title="Create New Material"
          >
            <Plus size={16} />
          </Button>
        </div>

        <div className="flex-1 min-h-[200px] overflow-y-auto px-1 custom-scrollbar">
          {/* Inline Create Option */}
          {showCreateOption && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 mb-2 mx-1 rounded cursor-pointer hover:bg-accent/5 text-text-secondary hover:text-text-primary group border border-dashed border-border-default hover:border-accent/20 transition-all"
              onClick={handleCreate}
            >
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-accent/10 text-accent group-hover:scale-110 transition-transform">
                <Plus size={12} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate">
                  Create "<span className="text-accent">{search}</span>"
                </span>
                <span className="text-[10px] text-text-muted">
                  Create and select new material
                </span>
              </div>
            </div>
          )}
          <div className="flex flex-col pb-4">
            {filteredMaterials.map((material) => (
              <TreeRow
                key={material.id}
                depth={0}
                label={material.label}
                hasChildren={false}
                isExpanded={false}
                isSelected={selectedMaterialId === material.id}
                onToggle={() => {}}
                onSelect={() => handleSelect(material.id)}
                highlightQuery={search}
                icon={<Palette size={12} className="text-accent" />}
                actions={
                  <span className="text-[9px] text-text-muted font-mono flex items-center gap-1">
                    <Box size={8} />
                    {material.memberShapeIds.length}
                  </span>
                }
              />
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
