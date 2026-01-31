import React, { useState, useEffect, useMemo } from "react";
import { useSceneComposer } from "../../scene/useSceneComposer";
import {
  useSelectionStore,
  useBindingAuthoring,
} from "../../state/RigControllerProvider";
import { InstructionCallout } from "../common/InstructionCallout";
import { Panel, Tabs, Select } from "../ui";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { Button } from "../ui/Button";
import { ObjectHeader } from "./ObjectHeader";
import { FeatureList } from "./FeatureList";
import { DriverPanel } from "./DriverPanel";
import { DriverBindingSection } from "./DriverBindingSection";
import { MaterialEditor } from "./MaterialEditor";

type InspectorTab = "drivers" | "features" | "bindings";

interface ObjectInspectorProps {
  showMaterialEditor?: boolean;
  showDrivers?: boolean;
  showBindings?: boolean;
  showFeatures?: boolean;
  hiddenMode?: "none" | "grey" | "omit";
  showHideControls?: boolean;
  allowCreateDrivers?: boolean;
  allowNodeActions?: boolean;
}

export function ObjectInspector({
  showMaterialEditor = true,
  showDrivers = true,
  showBindings = true,
  showFeatures = true,
  hiddenMode = "grey",
  showHideControls = true,
  allowCreateDrivers = true,
  allowNodeActions = false,
}: ObjectInspectorProps) {
  const { getNode } = useSceneComposer();
  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const handleRenameShape = useBindingAuthoring(
    (state) => state.handleRenameShape,
  );
  const [activeTab, setActiveTab] = useState<InspectorTab>("drivers");

  const activeSelection = selectionStack[0] ?? null;
  const node = activeSelection ? getNode(activeSelection.id) : null;
  const { objects, duplicateNode, deleteNode, reparentNode } =
    useSceneComposer();

  const tabs = [
    showDrivers && { id: "drivers", label: "Drivers" },
    showBindings && { id: "bindings", label: "Bindings" },
    showFeatures && { id: "features", label: "Default Animatable Props" },
  ].filter(Boolean) as { id: InspectorTab; label: string }[];

  const firstTab = tabs[0]?.id ?? "drivers";

  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab) && firstTab) {
      setActiveTab(firstTab);
    }
  }, [activeTab, firstTab, tabs]);

  if (!node) {
    return (
      <Panel className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0">
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs gap-3 border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 m-1">
          <p className="font-medium text-slate-400">Select an object to view properties</p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0">
      <div className="flex flex-col gap-3 p-1">
        <ObjectHeader
          name={node.name || node.id}
          typeLabel={node.type}
          id={node.id}
          onNameChange={(name) => handleRenameShape(node.id, name)}
        />
        {allowNodeActions ? (
          <SelectionActions
            node={node}
            objects={objects}
            onDuplicate={duplicateNode}
            onDelete={deleteNode}
            onReparent={reparentNode}
          />
        ) : null}
        {showMaterialEditor ? <MaterialEditor node={node} /> : null}
        <InstructionCallout
          label="Inspector tabs"
          summary="Switch between drivers, bindings, and default props"
          size="compact"
        >
          <ul className="list-disc pl-4 space-y-1 text-slate-300">
            <li>Drivers expose live controls (pose tweaks).</li>
            <li>Bindings list wired slots & target metadata.</li>
            <li>Default Props show untouched values for resets.</li>
          </ul>
        </InstructionCallout>

        <Tabs
          value={activeTab}
          onValueChange={(id) => setActiveTab(id as InspectorTab)}
          items={tabs}
          size="sm"
          variant="underline"
          renderPanel={(tabId) => {
            if (tabId === "drivers")
              return (
                <DriverPanel
                  node={node}
                  hiddenMode={hiddenMode}
                  showHideControls={showHideControls}
                  allowCreate={allowCreateDrivers}
                />
              );
            if (tabId === "bindings")
              return (
                <>
                  <DriverBindingSection node={node} />
                  <FeatureList
                    node={node}
                    mode="bindings"
                    hiddenMode={hiddenMode}
                    showHideControls={showHideControls}
                  />
                </>
              );
            return <FeatureList node={node} mode="features" hiddenMode="none" />;
          }}
        />
      </div>
    </Panel>
  );
}

function SelectionActions({
  node,
  objects,
  onDuplicate,
  onDelete,
  onReparent,
}: {
  node: SceneObjectNode;
  objects: SceneObjectNode[];
  onDuplicate: (
    id: string,
    opts?: { includeChildren?: boolean; parentId?: string | null },
  ) => string | null;
  onDelete: (id: string, opts?: { includeChildren?: boolean }) => void;
  onReparent: (id: string, parentId: string | null) => void;
}) {
  const [parentId, setParentId] = useState<string>(node.parentId ?? "");

  useEffect(() => {
    setParentId(node.parentId ?? "");
  }, [node.parentId, node.id]);

  const blockedForParent = useMemo(() => {
    const blocked = new Set<string>([node.id]);
    const pending = [...node.childIds];
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || blocked.has(current)) continue;
      blocked.add(current);
      const child = objects.find((obj) => obj.id === current);
      if (child) {
        pending.push(...child.childIds);
      }
    }
    return blocked;
  }, [node.childIds, node.id, objects]);

  const parentOptions = useMemo(
    () => objects.filter((n) => !blockedForParent.has(n.id)),
    [blockedForParent, objects],
  );

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/40 border border-slate-800/80 mx-1">
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="flex-1 h-8 text-[11px] font-semibold bg-white/5 border-white/5 hover:bg-white/10"
          onClick={() =>
            onDuplicate(node.id, {
              includeChildren: true,
              parentId: node.parentId ?? null,
            })
          }
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="flex-1 h-8 text-[11px] font-semibold"
          onClick={() => onDelete(node.id, { includeChildren: true })}
        >
          Delete
        </Button>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Parent</span>
        <Select
          className="flex-1"
          value={parentId}
          options={[
            { value: "", label: "Scene root" },
            ...parentOptions.map((option) => ({
              value: option.id,
              label: option.name || option.id,
            })),
          ]}
          onChange={setParentId}
          size="sm"
        />
        <Button
          variant="secondary"
          size="sm"
          className="h-8 px-3 text-[11px] font-semibold bg-white/5 border-white/5 hover:bg-white/10"
          onClick={() => onReparent(node.id, parentId === "" ? null : parentId)}
          disabled={parentOptions.length === 0}
        >
          Move
        </Button>
      </div>
    </div>
  );
}
