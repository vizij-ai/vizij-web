import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import type { ComponentType, DragEvent } from "react";
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance,
} from "reactflow";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
} from "reactflow";
import "reactflow/dist/style.css";
import { useEditorStore } from "../store/useEditorStore";
import { useRegistry } from "../contexts/RegistryProvider";
import { checkConnectionCompatibility } from "../utils/connectionValidation";
import { LEGEND_TYPES } from "../utils/portColors";
import { createNodeRenderer, defaultVariadicCount } from "./GraphNode";
import { unwrapDefault } from "./MgNodeInspector";
import OutputTargetNode, { OUTPUT_TARGET_TYPE } from "./OutputTargetNode";
import InputSourceNode, { INPUT_SOURCE_TYPE } from "./InputSourceNode";

interface EditorCanvasProps {
  onSelectNode?: (id: string | null) => void;
}

export default function EditorCanvas({ onSelectNode }: EditorCanvasProps) {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setEdges = useEditorStore((s) => s.setEdges);
  const setSelected = useEditorStore((s) => s.setSelected);
  const setEnabledOutputs = useEditorStore((s) => s.setEnabledOutputs);
  const setEnabledInputs = useEditorStore((s) => s.setEnabledInputs);
  const removeCustomInputPath = useEditorStore((s) => s.removeCustomInputPath);

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const hasAutoFitOnOpenRef = useRef(false);

  const { nodesByType, getPortsForType } = useRegistry();

  // Keep a ref so callbacks always see the latest registry (avoids stale closures)
  const getPortsRef = useRef(getPortsForType);
  getPortsRef.current = getPortsForType;

  const registryEntries = useMemo(
    () => Array.from(nodesByType?.entries?.() ?? []),
    [nodesByType],
  );

  // Build custom node types from registry
  const nodeTypes = useMemo(() => {
    const types: Record<string, ComponentType<any>> = {};
    for (const [typeId, schema] of registryEntries) {
      if (!typeId) continue;
      types[typeId] = createNodeRenderer(typeId, schema, getPortsForType);
    }
    types[OUTPUT_TARGET_TYPE] = OutputTargetNode;
    types[INPUT_SOURCE_TYPE] = InputSourceNode;
    return types;
  }, [registryEntries, getPortsForType]);

  const getVisibleFlowBounds = useCallback(() => {
    if (!rfInstance || !reactFlowWrapper.current) {
      return null;
    }
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const topLeft = rfInstance.screenToFlowPosition
      ? rfInstance.screenToFlowPosition({
          x: bounds.left,
          y: bounds.top,
        })
      : rfInstance.project
        ? rfInstance.project({ x: 0, y: 0 })
        : { x: 0, y: 0 };
    const bottomRight = rfInstance.screenToFlowPosition
      ? rfInstance.screenToFlowPosition({
          x: bounds.right,
          y: bounds.bottom,
        })
      : rfInstance.project
        ? rfInstance.project({ x: bounds.width, y: bounds.height })
        : { x: bounds.width, y: bounds.height };
    return {
      minX: Math.min(topLeft.x, bottomRight.x),
      maxX: Math.max(topLeft.x, bottomRight.x),
      minY: Math.min(topLeft.y, bottomRight.y),
      maxY: Math.max(topLeft.y, bottomRight.y),
    };
  }, [rfInstance]);

  // --- Sync output target nodes with enabledOutputs ---

  const enabledOutputs = useEditorStore((s) => s.enabledOutputs);

  useEffect(() => {
    let addedOutputNodes = 0;
    const viewportBounds = getVisibleFlowBounds();
    setNodes((prev) => {
      // Remove output target nodes that are no longer enabled
      const filtered = prev.filter(
        (n) =>
          n.type !== OUTPUT_TARGET_TYPE ||
          enabledOutputs.has((n.data as any).outputPath),
      );

      // Find which enabled outputs don't have a node yet
      const existingPaths = new Set(
        filtered
          .filter((n) => n.type === OUTPUT_TARGET_TYPE)
          .map((n) => (n.data as any).outputPath as string),
      );

      const toAdd: Node[] = [];
      const sortedPaths = Array.from(enabledOutputs).sort();
      const newPaths = sortedPaths.filter((p) => !existingPaths.has(p));

      if (newPaths.length > 0) {
        // Place new outputs within the current view, preferring the right side.
        let startX = 600;
        let startY = 40;
        if (viewportBounds) {
          const NODE_WIDTH_ESTIMATE = 230;
          startX = viewportBounds.maxX - NODE_WIDTH_ESTIMATE - 24;
          startY = viewportBounds.minY + 32;
          const existingOutputs = filtered.filter(
            (n) => n.type === OUTPUT_TARGET_TYPE,
          );
          if (existingOutputs.length > 0) {
            startY = Math.min(
              viewportBounds.maxY - 48,
              Math.max(...existingOutputs.map((n) => n.position.y)) + 50,
            );
          }
        } else if (filtered.length > 0) {
          const NODE_WIDTH_ESTIMATE = 250;
          startX =
            Math.max(...filtered.map((n) => n.position.x)) +
            NODE_WIDTH_ESTIMATE +
            60;
          // Stack below existing output targets at that x, or start at top
          const existingOutputs = filtered.filter(
            (n) => n.type === OUTPUT_TARGET_TYPE,
          );
          if (existingOutputs.length > 0) {
            startY = Math.max(...existingOutputs.map((n) => n.position.y)) + 50;
          }
        }
        addedOutputNodes = newPaths.length;

        for (let i = 0; i < newPaths.length; i++) {
          const path = newPaths[i];
          // Strip "rig/{rigId}/standard/" prefix and show full variable path
          const label =
            path.replace(/^rig\/[^/]+\/standard\//, "").replace(/\//g, ".") ||
            path;
          toAdd.push({
            id: `__output_target_${path}`,
            type: OUTPUT_TARGET_TYPE,
            position: { x: startX, y: startY + i * 50 },
            selectable: true,
            deletable: true,
            data: {
              outputPath: path,
              label,
            },
          });
        }
      }

      if (toAdd.length === 0 && filtered.length === prev.length) {
        return prev; // No changes
      }

      return [...filtered, ...toAdd];
    });

    // Clean up edges connected to removed output target nodes
    const validTargetIds = new Set(
      Array.from(enabledOutputs).map((p) => `__output_target_${p}`),
    );
    setEdges((prev) =>
      prev.filter(
        (e) =>
          !e.target.startsWith("__output_target_") ||
          validTargetIds.has(e.target),
      ),
    );
    if (addedOutputNodes > 0 && rfInstance) {
      requestAnimationFrame(() => {
        void rfInstance.fitView({
          padding: 0.2,
          duration: 240,
          includeHiddenNodes: true,
        });
      });
    }
  }, [enabledOutputs, getVisibleFlowBounds, rfInstance, setNodes, setEdges]);

  // --- Sync input source nodes with enabledInputs ---

  const enabledInputs = useEditorStore((s) => s.enabledInputs);

  useEffect(() => {
    let addedInputNodes = 0;
    const viewportBounds = getVisibleFlowBounds();
    setNodes((prev) => {
      // Remove input source nodes that are no longer enabled
      const filtered = prev.filter(
        (n) =>
          n.type !== INPUT_SOURCE_TYPE ||
          enabledInputs.has((n.data as any).inputPath),
      );

      // Find which enabled inputs don't have a node yet
      const existingPaths = new Set(
        filtered
          .filter((n) => n.type === INPUT_SOURCE_TYPE)
          .map((n) => (n.data as any).inputPath as string),
      );

      const toAdd: Node[] = [];
      const sortedPaths = Array.from(enabledInputs).sort();
      const newPaths = sortedPaths.filter((p) => !existingPaths.has(p));

      if (newPaths.length > 0) {
        // Place new inputs within the current view, preferring the left side.
        let startX = -200;
        let startY = 40;
        if (viewportBounds) {
          startX = viewportBounds.minX + 24;
          startY = viewportBounds.minY + 32;
          const existingInputNodes = filtered.filter(
            (n) => n.type === INPUT_SOURCE_TYPE,
          );
          if (existingInputNodes.length > 0) {
            startY = Math.min(
              viewportBounds.maxY - 48,
              Math.max(...existingInputNodes.map((n) => n.position.y)) + 50,
            );
          }
        } else if (filtered.length > 0) {
          startX = Math.min(...filtered.map((n) => n.position.x)) - 250;
          const existingInputNodes = filtered.filter(
            (n) => n.type === INPUT_SOURCE_TYPE,
          );
          if (existingInputNodes.length > 0) {
            startY =
              Math.max(...existingInputNodes.map((n) => n.position.y)) + 50;
          }
        }
        addedInputNodes = newPaths.length;

        for (let i = 0; i < newPaths.length; i++) {
          const path = newPaths[i];
          const label = path.replace(/\//g, ".") || path;
          toAdd.push({
            id: `__input_source_${path}`,
            type: INPUT_SOURCE_TYPE,
            position: { x: startX, y: startY + i * 50 },
            selectable: true,
            deletable: true,
            data: {
              inputPath: path,
              label,
            },
          });
        }
      }

      if (toAdd.length === 0 && filtered.length === prev.length) {
        return prev; // No changes
      }

      return [...filtered, ...toAdd];
    });

    // Clean up edges connected to removed input source nodes
    const validSourceIds = new Set(
      Array.from(enabledInputs).map((p) => `__input_source_${p}`),
    );
    setEdges((prev) =>
      prev.filter(
        (e) =>
          !e.source.startsWith("__input_source_") ||
          validSourceIds.has(e.source),
      ),
    );
    if (addedInputNodes > 0 && rfInstance) {
      requestAnimationFrame(() => {
        void rfInstance.fitView({
          padding: 0.2,
          duration: 240,
          includeHiddenNodes: true,
        });
      });
    }
  }, [enabledInputs, getVisibleFlowBounds, rfInstance, setNodes, setEdges]);

  // --- React Flow callbacks ---

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => applyNodeChanges(changes, prev) as any);
    },
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev) as any);
    },
    [setEdges],
  );

  const validateConnection = useCallback(
    (connection: Connection): { ok: boolean; reason?: string } => {
      const currentNodes = useEditorStore.getState().nodes;
      const srcNode = currentNodes.find((n) => n.id === connection.source);
      const tgtNode = currentNodes.find((n) => n.id === connection.target);
      if (!srcNode?.type || !tgtNode?.type) return { ok: true };
      return checkConnectionCompatibility(
        { getPortsForType: getPortsRef.current },
        srcNode.type,
        tgtNode.type,
        connection.sourceHandle ?? null,
        connection.targetHandle ?? null,
      );
    },
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = validateConnection(connection);
      if (!result.ok) {
        console.warn("[motiongraph] Blocked connection:", result.reason);
        return;
      }
      setEdges((prev) => {
        // Remove any existing edge targeting the same input handle
        // (each input slot accepts only one connection).
        const filtered = prev.filter(
          (e) =>
            !(
              e.target === connection.target &&
              e.targetHandle === connection.targetHandle
            ),
        );
        return addEdge(connection, filtered) as any;
      });
    },
    [setEdges, validateConnection],
  );

  const isValidConnection = useCallback(
    (connection: Connection) => validateConnection(connection).ok,
    [validateConnection],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onSelectNode) {
        onSelectNode(node.id);
        return;
      }
      setSelected(node.id);
    },
    [onSelectNode, setSelected],
  );

  const onPaneClick = useCallback(() => {
    if (onSelectNode) {
      onSelectNode(null);
      return;
    }
    setSelected(null);
  }, [onSelectNode, setSelected]);

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setEdges((prev) => prev.filter((e) => e.id !== edge.id));
    },
    [setEdges],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (deleted.length === 0) {
        return;
      }
      const deletedIds = new Set(deleted.map((n) => n.id));

      const deletedOutputPaths = deleted
        .filter((node) => node.type === OUTPUT_TARGET_TYPE)
        .map((node) => (node.data as { outputPath?: string }).outputPath)
        .filter((path): path is string => typeof path === "string");
      if (deletedOutputPaths.length > 0) {
        const nextEnabledOutputs = new Set(
          useEditorStore.getState().enabledOutputs,
        );
        deletedOutputPaths.forEach((path) => nextEnabledOutputs.delete(path));
        setEnabledOutputs(nextEnabledOutputs);
      }

      const deletedInputPaths = deleted
        .filter((node) => node.type === INPUT_SOURCE_TYPE)
        .map((node) => (node.data as { inputPath?: string }).inputPath)
        .filter((path): path is string => typeof path === "string");
      if (deletedInputPaths.length > 0) {
        const { customInputPaths, enabledInputs: currentEnabledInputs } =
          useEditorStore.getState();
        const customInputPathSet = new Set(customInputPaths);
        deletedInputPaths.forEach((path) => {
          if (customInputPathSet.has(path)) {
            removeCustomInputPath(path);
          }
        });
        const nextEnabledInputs = new Set(currentEnabledInputs);
        deletedInputPaths.forEach((path) => nextEnabledInputs.delete(path));
        setEnabledInputs(nextEnabledInputs);
      }

      // Remove edges connected to deleted nodes
      setEdges((prev) =>
        prev.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        ),
      );
      // Clear selection if deleted node was selected
      const selectedId = useEditorStore.getState().selectedNodeId;
      if (selectedId && deletedIds.has(selectedId)) {
        setSelected(null);
      }
    },
    [
      removeCustomInputPath,
      setEdges,
      setEnabledInputs,
      setEnabledOutputs,
      setSelected,
    ],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, []);

  useEffect(() => {
    if (!rfInstance || hasAutoFitOnOpenRef.current || nodes.length === 0) {
      return;
    }
    hasAutoFitOnOpenRef.current = true;
    requestAnimationFrame(() => {
      void rfInstance.fitView({
        padding: 0.22,
        duration: 260,
        includeHiddenNodes: true,
      });
    });
  }, [nodes.length, rfInstance]);

  // --- Drag and drop from palette ---

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (!rfInstance || !reactFlowWrapper.current) return;

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      // Convert screen coordinates to flow coordinates
      const position = rfInstance.screenToFlowPosition
        ? rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          })
        : (() => {
            const bounds = reactFlowWrapper.current!.getBoundingClientRect();
            const x = event.clientX - bounds.left;
            const y = event.clientY - bounds.top;
            return rfInstance.project ? rfInstance.project({ x, y }) : { x, y };
          })();

      const id = `node_${Date.now()}_${Math.floor(Math.random() * 1_000)}`;

      // Look up registry for display label
      const registryEntry = nodesByType?.get?.(String(type).toLowerCase());
      const canonicalType =
        (registryEntry?.signature?.type_id &&
          String(registryEntry.signature.type_id)) ||
        (registryEntry?.signature?.id && String(registryEntry.signature.id)) ||
        String(type);
      const displayLabel =
        (registryEntry?.signature?.name &&
          String(registryEntry.signature.name)) ||
        canonicalType;

      // Initialize params with resolved defaults from the registry schema
      // so new nodes display proper values instead of [object Object].
      const params: Record<string, unknown> = {};
      if (registryEntry?.params) {
        for (const p of registryEntry.params) {
          const def = unwrapDefault(p.default_json);
          if (def !== undefined) {
            params[p.id] = def;
          }
        }
      }

      // Initialize variadic input count for nodes that support it
      const portsInfo = getPortsRef.current(type);
      const variadicInputCount = defaultVariadicCount(portsInfo.variadicInputs);

      const newNode: Node = {
        id,
        type,
        position,
        data: {
          label: displayLabel,
          originalType: canonicalType,
          params,
          ...(variadicInputCount > 0 ? { variadicInputCount } : {}),
        },
      };

      setNodes((prev) => [...prev, newNode] as any);
    },
    [nodesByType, rfInstance, setNodes],
  );

  return (
    <ReactFlowProvider>
      <div
        data-testid="motiongraph-canvas-root"
        className="w-full h-full relative"
      >
        <div
          data-testid="motiongraph-canvas"
          ref={reactFlowWrapper}
          className="w-full h-full"
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            nodes={nodes as Node[]}
            edges={edges as Edge[]}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodesDelete={onNodesDelete}
            deleteKeyCode={["Backspace", "Delete"]}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            fitView
            onInit={onInit}
          >
            <Background gap={20} size={1} color="rgba(148, 163, 184, 0.24)" />
            <MiniMap
              nodeColor="rgba(148, 163, 184, 0.78)"
              maskColor="rgba(15, 23, 42, 0.55)"
              style={{
                background: "rgba(15, 23, 42, 0.45)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: 8,
              }}
            />
            <Controls />
          </ReactFlow>
        </div>
        <PortLegend />
      </div>
    </ReactFlowProvider>
  );
}

// ─── Collapsible port type legend ───────────────────────────────────

const PortLegend: FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-2 left-2 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 text-xs rounded bg-bg-panel/90 text-text-muted hover:text-text-primary border border-border-default transition-colors"
        title="Toggle port legend"
      >
        {open ? "Hide Legend" : "Legend"}
      </button>
      {open && (
        <div className="mt-1 p-3 rounded-lg bg-bg-panel/95 border border-border-default space-y-2 min-w-40 shadow-premium">
          <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
            Port Types
          </div>
          {LEGEND_TYPES.map((entry) => (
            <div key={entry.type} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                style={{
                  background: entry.color.bg,
                  border: `2px solid ${entry.color.border}`,
                }}
              />
              <span className="text-xs text-text-secondary">{entry.label}</span>
            </div>
          ))}
          <div className="border-t border-border-default pt-2 mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block flex-shrink-0 border-2 border-accent" />
              <span className="text-xs text-text-secondary">Selected node</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1 rounded-full bg-accent/20 text-accent leading-tight">
                opt
              </span>
              <span className="text-xs text-text-secondary">Optional port</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
