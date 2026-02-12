import React, { useState, useMemo } from "react";
import { Folder, Box, Zap, Activity } from "lucide-react";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Button, Tabs, PanelSearch, TreeRow } from "../ui";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type VariableSelection =
  | { type: "variable"; id: string }
  | {
      type: "property";
      objectId: string;
      featureId: string;
      label: string;
      targetId?: string;
      targetIds?: string[];
    };

interface VariableSelectorProps {
  onSelect: (selection: VariableSelection) => void;
  onCancel?: () => void;
  defaultTab?: "variables" | "scene";
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function VariableSelector({
  onSelect,
  onCancel,
  defaultTab = "variables",
}: VariableSelectorProps) {
  const [activeTab, setActiveTab] = useState<"variables" | "scene">(defaultTab);
  const [search, setSearch] = useState("");

  const tabs = [
    { id: "variables", label: "Variables" },
    { id: "scene", label: "Scene Properties" },
  ];

  return (
    <div className="flex flex-col h-[500px] w-full bg-bg-app text-text-primary overflow-hidden rounded-xl border border-border-default shadow-2xl">
      {/* Search Header */}
      <div className="p-3 border-b border-border-default flex flex-col gap-3 bg-bg-panel/50 backdrop-blur-md">
        <Tabs
          items={tabs}
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          renderPanel={() => null}
          size="sm"
          variant="pill"
          panelClassName="hidden"
          className="w-full"
        />

        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={
            activeTab === "variables"
              ? "Search variables..."
              : "Search scene..."
          }
          className="h-9"
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar bg-bg-input/20">
        {activeTab === "variables" ? (
          <VariablesList search={search} onSelect={onSelect} />
        ) : (
          <SceneTree search={search} onSelect={onSelect} />
        )}
      </div>

      {/* Footer */}
      {onCancel && (
        <div className="p-3 border-t border-border-default flex justify-end bg-bg-panel/50">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary"
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

function VariablesList({
  search,
  onSelect,
}: {
  search: string;
  onSelect: (s: VariableSelection) => void;
}) {
  const { managedStandardInputs, bindings } = useBindingAuthoring((s) => s);
  const { objects } = useSceneComposer();

  const groupedVariables = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = managedStandardInputs.filter(
      (m) =>
        m.input.id.toLowerCase().includes(q) ||
        (m.input.label && m.input.label.toLowerCase().includes(q)),
    );

    const groups: Record<
      string,
      { label: string; vars: typeof managedStandardInputs }
    > = {};

    filtered.forEach((mInput) => {
      const varId = mInput.input.id;
      const inputDef = mInput.input;

      let groupKey = "Unassigned";
      let groupLabel = "Unassigned";

      let foundObject = false;
      for (const [targetId, binding] of Object.entries(bindings)) {
        if (
          binding.inputId === varId ||
          (binding.slots && binding.slots.some((s) => s.inputId === varId))
        ) {
          for (const obj of objects) {
            for (const feat of obj.features) {
              if (feat.components.some((c) => c.targetId === targetId)) {
                groupKey = `obj:${obj.id}`;
                groupLabel = obj.name;
                foundObject = true;
                break;
              }
            }
            if (foundObject) break;
          }
        }
        if (foundObject) break;
      }

      if (!foundObject && inputDef?.group) {
        groupKey = `group:${inputDef.group}`;
        groupLabel = inputDef.group;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = { label: groupLabel, vars: [] };
      }
      groups[groupKey].vars.push(mInput);
    });

    return Object.values(groups).sort((a, b) => {
      if (a.label === "Unassigned") return 1;
      if (b.label === "Unassigned") return -1;
      return a.label.localeCompare(b.label);
    });
  }, [managedStandardInputs, bindings, objects, search]);

  // If we are searching, we probably want groups expanded by default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Auto-expand on search
  React.useEffect(() => {
    if (search) {
      setExpandedGroups(new Set(groupedVariables.map((g) => g.label)));
    }
  }, [search, groupedVariables]);

  const toggleGroup = (label: string) => {
    const next = new Set(expandedGroups);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setExpandedGroups(next);
  };

  if (groupedVariables.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-text-muted italic">
        No variables found
      </div>
    );
  }

  return (
    <div className="flex flex-col p-2 gap-0.5">
      {groupedVariables.map((group) => {
        const isExpanded = expandedGroups.has(group.label) || !!search;
        return (
          <TreeRow
            key={group.label}
            depth={0}
            label={group.label}
            hasChildren={true}
            isExpanded={isExpanded}
            onToggle={() => toggleGroup(group.label)}
            icon={
              <Box size={10} className="text-text-muted" strokeWidth={2.5} />
            }
            highlightQuery={search}
            actions={
              <span className="text-[9px] text-text-muted font-mono">
                {group.vars.length}
              </span>
            }
          >
            {/* 
                   Custom rendering for children because TreeRow expects react nodes.
                   We render these as leaf TreeRows.
                */}
            <div className="flex flex-col">
              {group.vars.map((item) => (
                <TreeRow
                  key={item.input.id}
                  depth={1}
                  label={item.input.label || item.input.id || ""}
                  hasChildren={false}
                  onToggle={() => {}} // No children
                  onSelect={() =>
                    onSelect({ type: "variable", id: item.input.id })
                  }
                  icon={
                    <Zap
                      size={10}
                      className="text-yellow-400/70"
                      strokeWidth={2.5}
                    />
                  }
                  highlightQuery={search}
                  actions={
                    <span className="text-[9px] text-text-secondary font-mono truncate max-w-[100px]">
                      {item.input.id}
                    </span>
                  }
                />
              ))}
            </div>
          </TreeRow>
        );
      })}
    </div>
  );
}

function SceneTree({
  search,
  onSelect,
}: {
  search: string;
  onSelect: (s: VariableSelection) => void;
}) {
  const { objects, rootIds, getChildren } = useSceneComposer();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(rootIds));

  // Simple search filtering
  const matchingIds = useMemo(() => {
    if (!search) return new Set<string>();
    const q = search.toLowerCase();
    const matches = new Set<string>();
    objects.forEach((obj) => {
      if (
        obj.name.toLowerCase().includes(q) ||
        obj.type.toLowerCase().includes(q)
      ) {
        matches.add(obj.id);
      }
    });
    return matches;
  }, [objects, search]);

  const toggle = (id: string, forceState?: boolean) => {
    const next = new Set(expandedIds);
    if (forceState !== undefined) {
      if (forceState) next.add(id);
      else next.delete(id);
    } else {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    setExpandedIds(next);
  };

  const renderNode = (nodeId: string, depth: number) => {
    const node = objects.find((o) => o.id === nodeId);
    if (!node) return null;

    const children = getChildren(nodeId);
    // Determine if it has "children" in the UI sense.
    // It has children if there are sub-objects OR if there are features.
    // But features are rendered inside the node's children block in my new design?
    // Or as siblings?
    // In `TreeRow`, `children` prop renders inside.
    const hasSubObjects = children.length > 0;
    const hasFeatures = node.features.length > 0;

    // We treat features as children of the node for the tree view
    const hasChildren = hasSubObjects || hasFeatures;

    const expanded = expandedIds.has(nodeId) || search.length > 0;

    // Show if search matches this node or any children
    const matchesSearch = !search || matchingIds.has(nodeId);
    const hasMatchingChild =
      !search ||
      objects.some((o) => matchingIds.has(o.id) && o.parentId === nodeId); // Approximate check.

    // If searching, we should probably check if features match too, but for now stick to object matching logic
    if (search && !matchesSearch && !hasMatchingChild) return null;

    const isFace = node.type === "Face";
    const Icon = isFace ? Activity : node.type === "Group" ? Folder : Box;

    return (
      <TreeRow
        key={node.id}
        depth={depth}
        label={node.name || node.id}
        hasChildren={hasChildren}
        isExpanded={expanded}
        onToggle={() => toggle(node.id)}
        highlightQuery={search}
        icon={
          <span
            className="flex items-center justify-center w-4 h-4 bg-accent-subtle text-accent rounded-sm select-none border border-accent/20"
            title={node.type}
          >
            <Icon size={10} strokeWidth={2.5} />
          </span>
        }
        actions={
          hasFeatures && (
            <span className="text-[9px] text-slate-500 font-mono">
              {node.features.length} props
            </span>
          )
        }
      >
        {expanded && (
          <div className="flex flex-col">
            {/* Render Features first as "children" */}
            {hasFeatures && (
              <div className="flex flex-col border-l border-accent/10 ml-[5px] my-0.5">
                {node.features.map((feature) => {
                  const targetComponents = feature.components.filter(
                    (component) => Boolean(component.targetId),
                  );
                  if (targetComponents.length === 0) {
                    return null;
                  }
                  return (
                    <div key={feature.id} className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 py-1 px-2 ml-2 rounded text-text-secondary border border-transparent">
                        <span className="w-1 h-1 rounded-full bg-accent/80" />
                        <span className="text-[11px] font-medium truncate flex-1">
                          {feature.label}
                        </span>
                        {targetComponents.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 px-1.5 text-[9px]"
                            onClick={(event) => {
                              event.stopPropagation();
                              const targetIds = targetComponents
                                .map((component) => component.targetId)
                                .filter((targetId): targetId is string =>
                                  Boolean(targetId),
                                );
                              if (targetIds.length === 0) {
                                return;
                              }
                              onSelect({
                                type: "property",
                                objectId: node.id,
                                featureId: feature.id,
                                label: `${node.name} · ${feature.label}`,
                                targetIds,
                              });
                            }}
                          >
                            All
                          </Button>
                        )}
                      </div>
                      {targetComponents.map((component) => {
                        if (!component.targetId) {
                          return null;
                        }
                        return (
                          <div
                            key={component.id}
                            className="flex items-center gap-2 py-1 px-2 ml-8 mr-2 hover:bg-accent-subtle hover:text-text-primary rounded cursor-pointer text-text-secondary transition-all border border-transparent hover:border-accent/20 group/prop"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect({
                                type: "property",
                                objectId: node.id,
                                featureId: feature.id,
                                label: `${node.name} · ${feature.label}.${component.label}`,
                                targetId: component.targetId ?? undefined,
                              });
                            }}
                          >
                            <span className="w-1 h-1 rounded-full bg-accent group-hover/prop:scale-125 transition-transform" />
                            <span className="text-[10px] font-medium truncate">
                              {component.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
            {/* Render Object Children */}
            {children.map((child) => renderNode(child.id, depth + 1))}
          </div>
        )}
      </TreeRow>
    );
  };

  return (
    <div className="flex flex-col p-2 pb-4">
      {rootIds.map((id) => renderNode(id, 0))}
    </div>
  );
}
