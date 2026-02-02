import React, { useState, useMemo } from "react";
import { Search, Folder, Box, Zap, ChevronRight, Activity } from "lucide-react";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { Input, Button, Tabs } from "../ui";
import { cn } from "../../utils/cn";
import type {
  SceneObjectNode,
  SceneObjectFeature,
} from "../../scene/sceneGraph";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type VariableSelection =
  | { type: "variable"; id: string }
  | { type: "property"; objectId: string; featureId: string; label: string };

interface VariableSelectorProps {
  onSelect: (selection: VariableSelection) => void;
  onCancel?: () => void;
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function VariableSelector({
  onSelect,
  onCancel,
}: VariableSelectorProps) {
  const [activeTab, setActiveTab] = useState<"variables" | "scene">(
    "variables",
  );
  const [search, setSearch] = useState("");

  const tabs = [
    { id: "variables", label: "Variables" },
    { id: "scene", label: "Scene Properties" },
  ];

  return (
    <div className="flex flex-col h-[500px] w-full bg-slate-900 text-slate-200 overflow-hidden rounded-xl border border-slate-800 shadow-2xl">
      {/* Search Header */}
      <div className="p-3 border-b border-slate-800 flex flex-col gap-3 bg-slate-900/50 backdrop-blur-md">
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
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 group-focus-within:text-blue-500 transition-colors" />
          <Input
            placeholder={
              activeTab === "variables"
                ? "Search variables..."
                : "Search scene..."
            }
            className="pl-9 h-9 text-xs bg-slate-950/50 border-slate-800 focus:border-blue-500/50"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar bg-slate-950/20">
        {activeTab === "variables" ? (
          <VariablesList search={search} onSelect={onSelect} />
        ) : (
          <SceneTree search={search} onSelect={onSelect} />
        )}
      </div>

      {/* Footer */}
      {onCancel && (
        <div className="p-3 border-t border-slate-800 flex justify-end bg-slate-900/50">
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="text-slate-400 hover:text-white"
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

  if (groupedVariables.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 italic">
        No variables found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-2 pb-4">
      {groupedVariables.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 px-2 py-1 border-b border-white/5 opacity-70">
            <Box size={10} className="text-slate-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {group.label}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {group.vars.map((item) => (
              <div
                key={item.input.id}
                className="flex items-center gap-2.5 p-2.5 hover:bg-blue-600/10 hover:text-blue-100 rounded-lg cursor-pointer group transition-all active:bg-blue-600/20 active:scale-[0.99]"
                onClick={() =>
                  onSelect({ type: "variable", id: item.input.id })
                }
              >
                <Zap
                  size={14}
                  className="text-yellow-400/70 group-hover:text-yellow-400"
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold truncate group-hover:text-blue-200">
                    {item.input.label || item.input.id}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono truncate">
                    {item.input.id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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

  const toggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const renderNode = (nodeId: string, depth: number) => {
    const node = objects.find((o) => o.id === nodeId);
    if (!node) return null;

    const children = getChildren(nodeId);
    const hasChildren = children.length > 0;
    const expanded = expandedIds.has(nodeId) || search.length > 0;

    // Show if search matches this node or any children
    const matchesSearch = !search || matchingIds.has(nodeId);
    const hasMatchingChild =
      !search ||
      objects.some((o) => matchingIds.has(o.id) && o.parentId === nodeId);

    if (search && !matchesSearch && !hasMatchingChild) return null;

    return (
      <div key={node.id} className="flex flex-col">
        <SceneObjectRow
          object={node}
          depth={depth}
          expanded={expanded}
          hasChildren={hasChildren}
          onToggle={toggle}
          onSelect={onSelect}
          isMatch={matchingIds.has(node.id)}
        />

        {expanded && hasChildren && (
          <div className="flex flex-col">
            {children.map((child) => renderNode(child.id, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col p-2 pb-4">
      {rootIds.map((id) => renderNode(id, 0))}
    </div>
  );
}

function SceneObjectRow({
  object,
  depth,
  expanded,
  hasChildren,
  onToggle,
  onSelect,
  isMatch,
}: {
  object: SceneObjectNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggle: (id: string, e: React.MouseEvent) => void;
  onSelect: (s: VariableSelection) => void;
  isMatch: boolean;
}) {
  const hasFeatures = object.features.length > 0;
  const [showFeatures, setShowFeatures] = useState(false);

  // Icon based on type
  const isFace = object.type === "Face";
  const Icon = isFace ? Activity : object.type === "Group" ? Folder : Box;

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "group flex items-center gap-2 p-1.5 rounded-lg transition-all cursor-pointer select-none active:bg-slate-800/60",
          "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200",
        )}
        style={{ marginLeft: `${depth * 12}px` }}
        onClick={(e) => hasChildren && onToggle(object.id, e)}
      >
        <button
          type="button"
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-slate-700/50 transition-transform duration-200",
            !hasChildren && "opacity-0 pointer-events-none",
            expanded && "rotate-90",
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(object.id, e);
          }}
        >
          <ChevronRight size={10} />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            className={cn(
              "text-[11px] font-medium truncate",
              isMatch && "text-blue-300 font-bold",
            )}
          >
            {object.name || object.id}
          </span>

          <span className="flex items-center gap-1.5 ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
            <span
              className="flex items-center justify-center w-4 h-4 bg-blue-500/10 text-blue-400 rounded-sm select-none border border-blue-500/20"
              title={object.type}
            >
              <Icon size={10} />
            </span>
            {hasFeatures && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFeatures(!showFeatures);
                }}
                className={cn(
                  "px-1.5 h-4 flex items-center gap-1 rounded text-[9px] font-bold tracking-wider uppercase transition-colors",
                  showFeatures
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300",
                )}
              >
                <Zap
                  size={8}
                  className={showFeatures ? "text-white" : "text-blue-500/70"}
                />
                Props
              </button>
            )}
          </span>
        </div>
      </div>

      {showFeatures && hasFeatures && (
        <div
          className="flex flex-col gap-1 py-1 pr-1 border-l border-blue-500/20 ml-2.5 my-1"
          style={{ marginLeft: `${depth * 12 + 10}px` }}
        >
          {object.features.map((feature) => (
            <div
              key={feature.id}
              className="flex items-center gap-2 p-1.5 pl-3 hover:bg-blue-600/10 hover:text-blue-100 rounded-lg cursor-pointer text-slate-400 transition-all border border-transparent hover:border-blue-500/20"
              onClick={(e) => {
                e.stopPropagation();
                onSelect({
                  type: "property",
                  objectId: object.id,
                  featureId: feature.id,
                  label: `${object.name} · ${feature.label}`,
                });
              }}
            >
              <span className="w-1 h-1 rounded-full bg-blue-500 group-hover:scale-125 transition-transform" />
              <span className="text-[11px] font-medium truncate">
                {feature.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
