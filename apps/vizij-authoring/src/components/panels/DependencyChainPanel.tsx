import React, { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  Edge,
  Node,
  Position,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  Handle,
} from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import { useBindingAuthoringStore } from "../../state/bindingAuthoringStore";
import { usePoseRigStore } from "../../poseRig/store";
import type { PoseGroupInspectorSelection } from "../../types/poseGroupInspector";
import type { NodeProps } from "reactflow";

function SmartNodeLabel({ label }: { label: string }) {
  if (!label) return null;

  const hasSlashes = label.includes("/");
  const hasDots = label.includes(".");

  if (hasSlashes || hasDots) {
    const sep = hasSlashes ? "/" : ".";
    const parts = label.split(sep);

    if (parts.length > 2) {
      return (
        <div
          className="flex items-center w-full min-w-0 text-xs font-medium text-neutral-100"
          title={label}
        >
          <span className="opacity-50 shrink-0 truncate max-w-[50px]">
            {parts[0]}
            {sep}
          </span>
          <span className="opacity-50 shrink-0">..{sep}</span>
          <span className="truncate min-w-0">{parts[parts.length - 1]}</span>
        </div>
      );
    } else if (parts.length === 2) {
      return (
        <div
          className="flex items-center w-full min-w-0 text-xs font-medium text-neutral-100"
          title={label}
        >
          <span className="opacity-50 shrink-0 truncate max-w-[60px]">
            {parts[0]}
            {sep}
          </span>
          <span className="truncate min-w-0">{parts[1]}</span>
        </div>
      );
    }
  }

  if (label.length > 22) {
    const first = label.slice(0, 10);
    const last = label.slice(-10);
    return (
      <span
        className="truncate block w-full text-xs font-medium text-neutral-100"
        title={label}
      >{`${first}...${last}`}</span>
    );
  }

  return (
    <span
      className="truncate block w-full text-xs font-medium text-neutral-100"
      title={label}
    >
      {label}
    </span>
  );
}

function DependencyNode({
  data,
  selected,
  sourcePosition,
  targetPosition,
}: NodeProps) {
  let bgGradient = "from-neutral-800 to-neutral-900";
  let borderClass = "border-neutral-700/50";
  let selectedBorder = "border-blue-500 shadow-blue-500/25";
  let indicatorColor = "bg-neutral-500";
  let typeLabel = data.typeLabel || "Node";

  if (data.nodeType === "pose") {
    bgGradient = "from-emerald-900/60 to-neutral-900";
    borderClass = "border-emerald-700/50";
    selectedBorder = "border-emerald-400 shadow-emerald-400/25";
    indicatorColor = "bg-emerald-500";
  } else if (data.nodeType === "group") {
    bgGradient = "from-amber-900/60 to-neutral-900";
    borderClass = "border-amber-700/50";
    selectedBorder = "border-amber-400 shadow-amber-400/25";
    indicatorColor = "bg-amber-500";
  } else if (data.nodeType === "input") {
    bgGradient = "from-sky-900/60 to-neutral-900";
    borderClass = "border-sky-700/50";
    selectedBorder = "border-sky-400 shadow-sky-400/25";
    indicatorColor = "bg-sky-500";
  }

  return (
    <div
      className={`relative rounded-md border min-w-[140px] shadow-sm transition-colors ${bgGradient} ${selected ? selectedBorder : borderClass}`}
    >
      <Handle
        type="target"
        position={targetPosition || Position.Left}
        style={{ background: "#777", border: "none", width: 6, height: 6 }}
      />

      <div className="flex flex-col px-2 py-1.5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${indicatorColor}`} />
            <span className="text-[10px] font-semibold tracking-wider text-neutral-300 uppercase">
              {typeLabel}
            </span>
          </div>
          {data.value !== undefined && (
            <span className="text-[11px] font-mono text-emerald-300 bg-black/40 px-1 rounded">
              {data.value.toFixed(2)}
            </span>
          )}
        </div>
        <div className="w-full max-w-[140px]">
          <SmartNodeLabel label={data.label} />
        </div>
      </div>

      <Handle
        type="source"
        position={sourcePosition || Position.Right}
        style={{ background: "#777", border: "none", width: 6, height: 6 }}
      />
    </div>
  );
}

const nodeTypes = { dependencyNode: DependencyNode };

function DependencyChainContent({
  onNodeClick,
  selectedPoseGroup,
}: {
  onNodeClick?: (id: string) => void;
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
}) {
  const inputsById = useBindingAuthoringStore(
    (state) => state.standardInputsById,
  );
  const pipelineConfig = useBindingAuthoringStore(
    (state) => state.pipelineConfigByInputId,
  );
  const inputBindings = useBindingAuthoringStore(
    (state) => state.inputBindings,
  );
  const inputValues = useBindingAuthoringStore((state) => state.inputValues);
  const selectedRigId = useBindingAuthoringStore(
    (state) => state.selectedRigId,
  );

  // Grab poses to show them as drivers
  const poses = usePoseRigStore((state) => state.poses);
  const selectedPoseId = usePoseRigStore((state) => state.selectedPoseId);

  const { setCenter } = useReactFlow();

  const [layoutDir, setLayoutDir] = React.useState<"LR" | "TB">("LR");
  const [hideUnconnected, setHideUnconnected] = React.useState(false);
  const [focusSelected, setFocusSelected] = React.useState(false);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    // Find which id should actually be selected based on the three active global selections
    let activeId: string | null = null;

    if (selectedRigId) {
      activeId = selectedRigId;
    } else if (selectedPoseId && selectedPoseId !== "__pose_rig_neutral__") {
      // we need to resolve the pose Id to the pose weight node id
      const poseWeightInput = Array.from(inputsById.values()).find(
        (i) =>
          i.path?.includes(`/poses/`) &&
          i.path?.includes(selectedPoseId) &&
          i.path?.endsWith(".weight"),
      );
      if (poseWeightInput) {
        activeId = poseWeightInput.id;
      }
    } else if (selectedPoseGroup && selectedPoseGroup.groupId) {
      activeId = `group:${selectedPoseGroup.groupId}`;
    }

    if (activeId && selectedNodeId !== activeId) {
      setSelectedNodeId(activeId);
    } else if (!activeId && selectedNodeId !== null) {
      setSelectedNodeId(null);
    }
  }, [selectedRigId, selectedPoseId, selectedPoseGroup, inputsById]);

  const { nodes, edges } = useMemo(() => {
    let newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    const inputList = Array.from(inputsById.values());

    // 1. Add Input Nodes & Edges from Slots
    inputList.forEach((input) => {
      const val = inputValues[input.id] ?? input.defaultValue ?? 0;

      // Look up if this input is a pose weight
      const isPoseWeight =
        input.path?.includes("/poses/") && input.path?.endsWith(".weight");
      const poseIdMatch = isPoseWeight
        ? input.path?.match(/\/poses\/([^/]+)\.weight/)
        : null;
      const poseId = poseIdMatch ? poseIdMatch[1] : null;

      // If it's a pose, let's grab the pose definition so we can name it better
      const poseDef = poseId
        ? poses.find((p) => p.id === poseId || input.path?.includes(p.id))
        : null;

      const sourcePosition =
        layoutDir === "LR" ? Position.Right : Position.Bottom;
      const targetPosition = layoutDir === "LR" ? Position.Left : Position.Top;

      let label = input.label || input.id;
      let nodeType = "input";
      let typeLabel = "Driver";

      if (isPoseWeight) {
        nodeType = "pose";
        typeLabel = "Pose";
        label = poseDef?.name || poseId || input.label || "Unknown Pose";
      }

      newNodes.push({
        id: input.id,
        position: { x: 0, y: 0 },
        sourcePosition,
        targetPosition,
        data: { label, value: val, nodeType, typeLabel },
        type: "dependencyNode",
        selected: selectedNodeId === input.id,
      });

      // Standard input binding edges (what drives THIS node)
      const binding = inputBindings[input.id] as
        | Record<string, any>
        | undefined;
      const slots = binding?.slots;
      if (Array.isArray(slots)) {
        slots.forEach((slot: any) => {
          if (
            slot &&
            slot.inputId &&
            slot.inputId !== "self" &&
            slot.inputId !== ""
          ) {
            if (inputsById.has(slot.inputId)) {
              newEdges.push({
                id: `${slot.inputId}->${input.id}`,
                source: slot.inputId,
                target: input.id,
                animated: true,
                style: { stroke: "#888", strokeWidth: 2 },
              });
            }
          }
        });
      }
    });

    // 2. Add Pose Groups and connect them to their Poses
    const groupsAdded = new Set<string>();

    const sourcePosition =
      layoutDir === "LR" ? Position.Right : Position.Bottom;
    const targetPosition = layoutDir === "LR" ? Position.Left : Position.Top;

    poses.forEach((pose) => {
      // Find the actual weight input node for this pose
      const poseWeightInput = inputList.find(
        (i) =>
          i.path?.includes(`/poses/`) &&
          i.path?.includes(pose.id) &&
          i.path?.endsWith(".weight"),
      );
      const poseNodeId = poseWeightInput ? poseWeightInput.id : null;

      // Connect pose to its driven targets
      if (poseNodeId && pose.values) {
        Object.keys(pose.values).forEach((targetInputId) => {
          if (inputsById.has(targetInputId)) {
            newEdges.push({
              id: `${poseNodeId}->${targetInputId}`,
              source: poseNodeId,
              target: targetInputId,
              animated: true,
              style: {
                stroke: "#10b981",
                strokeWidth: 2,
                strokeDasharray: "4 4",
              },
            });
          }
        });
      }

      // Add group node and edge (if there is a valid pose to point it to)
      if (poseNodeId) {
        const groupId = pose.group || "Ungrouped";
        const groupNodeId = `group:${groupId}`;
        if (!groupsAdded.has(groupId)) {
          groupsAdded.add(groupId);
          newNodes.push({
            id: groupNodeId,
            position: { x: 0, y: 0 },
            sourcePosition,
            targetPosition,
            data: { label: groupId, nodeType: "group", typeLabel: "Group" },
            type: "dependencyNode",
            selected: selectedNodeId === groupNodeId,
          });
        }
        newEdges.push({
          id: `${groupNodeId}->${poseNodeId}`,
          source: groupNodeId,
          target: poseNodeId,
          animated: false,
          style: { stroke: "#f59e0b", strokeWidth: 2 },
        });
      }
    });

    // 3. Filter graph

    let finalNodes = newNodes;

    // Deduplicate edge IDs (pose bindings from slots vs manual edges can overlap)
    const uniqueEdgesMap = new Map<string, Edge>();
    newEdges.forEach((e) => uniqueEdgesMap.set(e.id, e));
    let finalEdges = Array.from(uniqueEdgesMap.values());

    if (focusSelected && selectedNodeId) {
      const reachable = new Set<string>();
      reachable.add(selectedNodeId);

      const forward = new Map<string, string[]>();
      const backward = new Map<string, string[]>();

      finalEdges.forEach((e) => {
        if (!forward.has(e.source)) forward.set(e.source, []);
        forward.get(e.source)!.push(e.target);

        if (!backward.has(e.target)) backward.set(e.target, []);
        backward.get(e.target)!.push(e.source);
      });

      // Gather descendants (forward)
      let queue = [selectedNodeId];
      while (queue.length > 0) {
        const cur = queue.pop()!;
        const targets = forward.get(cur) || [];
        for (const t of targets) {
          if (!reachable.has(t)) {
            reachable.add(t);
            queue.push(t);
          }
        }
      }

      // Gather ancestors (backward)
      queue = [selectedNodeId];
      while (queue.length > 0) {
        const cur = queue.pop()!;
        const sources = backward.get(cur) || [];
        for (const s of sources) {
          if (!reachable.has(s)) {
            reachable.add(s);
            queue.push(s);
          }
        }
      }

      finalNodes = finalNodes.filter((n) => reachable.has(n.id));
      finalEdges = finalEdges.filter(
        (e) => reachable.has(e.source) && reachable.has(e.target),
      );
    }

    if (hideUnconnected) {
      const connectedNodeIds = new Set<string>();
      finalEdges.forEach((edge) => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
      });
      finalNodes = finalNodes.filter((node) => connectedNodeIds.has(node.id));
    }

    // 4. Layout with Dagre
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: layoutDir, nodesep: 25, ranksep: 100 });

    finalNodes.forEach((node) => {
      dagreGraph.setNode(node.id, { width: 140, height: 45 });
    });

    finalEdges.forEach((edge) => {
      dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    // 5. Align Leaf Nodes (Nodes with out-edges = 0) to the maximum rank
    const layoutedNodesCoords = finalNodes.map((node) => {
      return { id: node.id, ...dagreGraph.node(node.id) };
    });

    // Determine min/max ranks based on layoutDir ('x' for LR, 'y' for TB)
    const rankAxis = layoutDir === "LR" ? "x" : "y";
    let maxRankVal = -Infinity;

    layoutedNodesCoords.forEach((n) => {
      if (n[rankAxis] > maxRankVal) {
        maxRankVal = n[rankAxis];
      }
    });

    // Adjust positions
    const layoutedNodes = finalNodes.map((node) => {
      const n = dagreGraph.node(node.id);
      const outEdges = dagreGraph.outEdges(node.id);

      // If it's a leaf node, push it to the max rank level
      let finalAxisValue = n[rankAxis];
      if (outEdges && outEdges.length === 0) {
        finalAxisValue = maxRankVal;
      }

      node.position = {
        x: (layoutDir === "LR" ? finalAxisValue : n.x) - 75,
        y: (layoutDir === "TB" ? finalAxisValue : n.y) - 30,
      };
      return node;
    });

    return { nodes: layoutedNodes, edges: finalEdges };
  }, [
    inputsById,
    pipelineConfig,
    inputBindings,
    inputValues,
    layoutDir,
    hideUnconnected,
    poses,
    focusSelected,
    selectedNodeId,
  ]);

  const minimapStyle = useMemo(() => {
    if (!nodes || nodes.length === 0) return { backgroundColor: "#1e1e1e" };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    nodes.forEach((n) => {
      if (n.position.x < minX) minX = n.position.x;
      if (n.position.y < minY) minY = n.position.y;
      if (n.position.x + 150 > maxX) maxX = n.position.x + 150;
      if (n.position.y + 60 > maxY) maxY = n.position.y + 60;
    });

    const padding = 50;
    const graphWidth = Math.max(maxX - minX + padding * 2, 1);
    const graphHeight = Math.max(maxY - minY + padding * 2, 1);
    const aspectRatio = graphWidth / graphHeight;

    const maxWidth = 250;
    const maxHeight = 150;

    let width = maxWidth;
    let height = width / aspectRatio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspectRatio;
    }

    return {
      backgroundColor: "#1e1e1e",
      width,
      height,
    };
  }, [nodes]);

  // Track the selection changes against the newly layouted nodes to pan when external selection changes
  React.useEffect(() => {
    // Resolve global selection to node id
    let activeId: string | null = null;
    if (selectedRigId) {
      activeId = selectedRigId;
    } else if (selectedPoseId && selectedPoseId !== "__pose_rig_neutral__") {
      const poseWeightInput = Array.from(inputsById.values()).find(
        (i) =>
          i.path?.includes(`/poses/`) &&
          i.path?.includes(selectedPoseId) &&
          i.path?.endsWith(".weight"),
      );
      if (poseWeightInput) {
        activeId = poseWeightInput.id;
      }
    } else if (selectedPoseGroup && selectedPoseGroup.groupId) {
      activeId = `group:${selectedPoseGroup.groupId}`;
    }

    if (activeId) {
      const node = nodes.find((n) => n.id === activeId);
      if (node && node.position) {
        // Focus on the node's layout position (offset roughly by its center)
        setCenter(node.position.x + 75, node.position.y + 30, {
          duration: 800,
          zoom: 1.2,
        });
      }
    }
  }, [
    selectedRigId,
    selectedPoseId,
    selectedPoseGroup,
    inputsById,
    nodes,
    setCenter,
  ]);

  const handleNodeClick = React.useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      if (onNodeClick) {
        onNodeClick(node.id);
      }
    },
    [onNodeClick],
  );

  const handlePaneClick = React.useCallback(() => {
    setSelectedNodeId(null);
    if (onNodeClick) {
      onNodeClick("");
    }
  }, [onNodeClick]);

  return (
    <div className="w-full h-full flex flex-col relative text-text-primary">
      <div className="shrink-0 p-2 border-b border-border-default bg-bg-panel flex items-center justify-between">
        <h2 className="text-sm font-semibold">Dependency Chain</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFocusSelected((prev) => !prev)}
            className={`text-xs px-2 py-1 rounded transition-colors ${focusSelected ? "bg-accent-default text-white" : "bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-text-primary"}`}
          >
            {focusSelected ? "Unfocus Selected" : "Focus Selected"}
          </button>
          <button
            onClick={() => setHideUnconnected((prev) => !prev)}
            className={`text-xs px-2 py-1 rounded transition-colors ${hideUnconnected ? "bg-accent-default text-white" : "bg-bg-subtle text-text-muted hover:bg-bg-hover hover:text-text-primary"}`}
          >
            {hideUnconnected ? "Show Unconnected" : "Hide Unconnected"}
          </button>
          <button
            onClick={() =>
              setLayoutDir((prev) => (prev === "LR" ? "TB" : "LR"))
            }
            className="text-xs px-2 py-1 rounded bg-bg-subtle text-text-muted hover:bg-bg-hover transition-colors flex items-center gap-1"
          >
            <span>
              Layout: {layoutDir === "LR" ? "Horizontal" : "Vertical"}
            </span>
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-bg-app">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          nodesDraggable={true}
          nodesConnectable={false}
          elementsSelectable={true}
        >
          <Background color="#444" gap={16} />
          <Controls />
          <MiniMap
            nodeStrokeColor="#777"
            nodeColor="#ccc"
            maskColor="rgba(0,0,0,0.4)"
            style={minimapStyle}
            pannable
            zoomable
          />
        </ReactFlow>
      </div>
    </div>
  );
}

export function DependencyChainPanel({
  onNodeClick,
  selectedPoseGroup,
}: {
  onNodeClick?: (id: string) => void;
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
}) {
  return (
    <ReactFlowProvider>
      <DependencyChainContent
        onNodeClick={onNodeClick}
        selectedPoseGroup={selectedPoseGroup}
      />
    </ReactFlowProvider>
  );
}
