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
import {
  buildInitialInputDefaultsForPorts,
  defaultVariadicCount,
} from "@vizij/studio-support";
import { useEditorStore } from "../store/useEditorStore";
import { useRegistry } from "../contexts/RegistryProvider";
import { checkConnectionCompatibility } from "../utils/connectionValidation";
import { LEGEND_TYPES } from "../utils/portColors";
import { createNodeRenderer } from "./GraphNode";
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

  // Tracks where the next IO node should be placed.
  // Updated on: canvas init (center), pane click, node drop, node drag-stop.
  const ioAddPositionRef = useRef<{ x: number; y: number } | null>(null);

  /** Height estimate for IO nodes (px in flow coords). */
  const IO_NODE_HEIGHT = 32;
  /** Vertical gap between stacked IO nodes. */
  const IO_NODE_GAP = 12;

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
        // Use the tracked IO add position, falling back to viewport-based placement.
        let startX: number;
        let startY: number;

        if (ioAddPositionRef.current) {
          startX = ioAddPositionRef.current.x;
          startY = ioAddPositionRef.current.y;
        } else if (viewportBounds) {
          startX = (viewportBounds.minX + viewportBounds.maxX) / 2;
          startY = (viewportBounds.minY + viewportBounds.maxY) / 2;
        } else {
          startX = 600;
          startY = 40;
        }

        for (let i = 0; i < newPaths.length; i++) {
          const path = newPaths[i];
          // Strip "rig/{rigId}/standard/" prefix and show full variable path
          const label =
            path.replace(/^rig\/[^/]+\/standard\//, "").replace(/\//g, ".") ||
            path;
          const y = startY + i * (IO_NODE_HEIGHT + IO_NODE_GAP);
          toAdd.push({
            id: `__output_target_${path}`,
            type: OUTPUT_TARGET_TYPE,
            position: { x: startX, y },
            selectable: true,
            deletable: true,
            data: {
              outputPath: path,
              label,
            },
          });
        }

        // Advance the stored position below the last added node
        ioAddPositionRef.current = {
          x: startX,
          y: startY + newPaths.length * (IO_NODE_HEIGHT + IO_NODE_GAP),
        };
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
  }, [enabledOutputs, getVisibleFlowBounds, setNodes, setEdges]);

  // --- Sync input source nodes with enabledInputs ---

  const enabledInputs = useEditorStore((s) => s.enabledInputs);

  useEffect(() => {
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
        // Use the tracked IO add position, falling back to viewport-based placement.
        let startX: number;
        let startY: number;

        if (ioAddPositionRef.current) {
          startX = ioAddPositionRef.current.x;
          startY = ioAddPositionRef.current.y;
        } else if (viewportBounds) {
          startX = (viewportBounds.minX + viewportBounds.maxX) / 2;
          startY = (viewportBounds.minY + viewportBounds.maxY) / 2;
        } else {
          startX = -200;
          startY = 40;
        }

        for (let i = 0; i < newPaths.length; i++) {
          const path = newPaths[i];
          const label = path.replace(/\//g, ".") || path;
          const y = startY + i * (IO_NODE_HEIGHT + IO_NODE_GAP);
          toAdd.push({
            id: `__input_source_${path}`,
            type: INPUT_SOURCE_TYPE,
            position: { x: startX, y },
            selectable: true,
            deletable: true,
            data: {
              inputPath: path,
              label,
            },
          });
        }

        // Advance the stored position below the last added node
        ioAddPositionRef.current = {
          x: startX,
          y: startY + newPaths.length * (IO_NODE_HEIGHT + IO_NODE_GAP),
        };
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
  }, [enabledInputs, getVisibleFlowBounds, setNodes, setEdges]);

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
        {
          sourceNodeId: connection.source,
          nodes: currentNodes,
          edges: useEditorStore.getState().edges,
        },
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
    (event: React.MouseEvent, node: Node) => {
      // When shift is held, let ReactFlow handle multi-selection natively
      // and don't override the store's inspector selection.
      if (event.shiftKey) return;

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
    } else {
      setSelected(null);
    }
  }, [onSelectNode, setSelected]);

  // Record the IO-add position on pointerdown so it captures both simple
  // clicks and click-drag pans (the browser's "click" event doesn't fire
  // after a drag).
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper || !rfInstance) return;

    const pane = wrapper.querySelector<HTMLElement>(".react-flow__pane");
    if (!pane) return;

    const handler = (event: PointerEvent) => {
      if (event.button !== 0) return; // only primary button
      const pos = rfInstance.screenToFlowPosition
        ? rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          })
        : rfInstance.project
          ? (() => {
              const bounds = wrapper.getBoundingClientRect();
              return rfInstance.project({
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
              });
            })()
          : { x: event.clientX, y: event.clientY };
      ioAddPositionRef.current = pos;
    };

    pane.addEventListener("pointerdown", handler);
    return () => pane.removeEventListener("pointerdown", handler);
  }, [rfInstance]);

  /** After a node is dragged/dropped, set the IO add position just below it. */
  const updateIoPositionBelowNode = useCallback((node: Node) => {
    // Use the node's measured height if available, otherwise estimate
    const nodeHeight =
      (node as any).height ?? (node as any).measured?.height ?? 60;
    ioAddPositionRef.current = {
      x: node.position.x,
      y: node.position.y + nodeHeight + IO_NODE_GAP,
    };
  }, []);

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      updateIoPositionBelowNode(node);
    },
    [updateIoPositionBelowNode],
  );

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

  // --- Copy / Paste selected nodes (Ctrl+C / Ctrl+V) ---

  const clipboardRef = useRef<{
    nodes: Node[];
    edges: Edge[];
    /** Position of the IO-add cursor at copy time (to detect later clicks). */
    ioPositionAtCopy: { x: number; y: number } | null;
  } | null>(null);

  const copySelectedNodes = useCallback(() => {
    const currentNodes = useEditorStore.getState().nodes;
    const currentEdges = useEditorStore.getState().edges;

    const selected = currentNodes.filter((n) => n.selected);
    if (selected.length === 0) return;

    const selectedIds = new Set(selected.map((n) => n.id));

    // Keep only edges where both source and target are in the selection
    const internalEdges = currentEdges.filter(
      (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
    );

    clipboardRef.current = {
      nodes: selected.map((n) => ({ ...n })),
      edges: internalEdges.map((e) => ({ ...e })),
      ioPositionAtCopy: ioAddPositionRef.current
        ? { ...ioAddPositionRef.current }
        : null,
    };
  }, []);

  const pasteNodes = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip || clip.nodes.length === 0) return;

    // Build old-id → new-id mapping
    const idMap = new Map<string, string>();
    const ts = Date.now();
    clip.nodes.forEach((n, i) => {
      idMap.set(n.id, `node_${ts}_${i}_${Math.floor(Math.random() * 1_000)}`);
    });

    const PASTE_OFFSET = 40;

    // Check if the user clicked on the canvas after copying
    const cur = ioAddPositionRef.current;
    const atCopy = clip.ioPositionAtCopy;
    const clickedAfterCopy =
      cur != null &&
      (atCopy == null || cur.x !== atCopy.x || cur.y !== atCopy.y);

    let newNodes: Node[];

    if (clickedAfterCopy) {
      // Paste at the clicked location, preserving relative layout
      const minX = Math.min(...clip.nodes.map((n) => n.position.x));
      const minY = Math.min(...clip.nodes.map((n) => n.position.y));

      newNodes = clip.nodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        position: {
          x: cur!.x + (n.position.x - minX),
          y: cur!.y + (n.position.y - minY),
        },
        selected: true,
        data: { ...n.data },
      }));
    } else {
      // No click since copy — use a simple offset from originals
      newNodes = clip.nodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        position: {
          x: n.position.x + PASTE_OFFSET,
          y: n.position.y + PASTE_OFFSET,
        },
        selected: true,
        data: { ...n.data },
      }));
    }

    // Remap edges to new node IDs
    const newEdges: Edge[] = clip.edges.map((e) => ({
      ...e,
      id: `e-${idMap.get(e.source)}-${idMap.get(e.target)}-${e.sourceHandle ?? "out"}-${e.targetHandle ?? "in"}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
    }));

    // Deselect existing nodes, then add the pasted ones (selected)
    setNodes((prev) => [
      ...prev.map((n) => (n.selected ? { ...n, selected: false } : n)),
      ...newNodes,
    ]);
    setEdges((prev) => [...prev, ...newEdges]);

    // For repeated pastes without another click, offset from the just-pasted
    // positions so they don't stack on top of each other.
    clipboardRef.current = {
      nodes: newNodes.map((n) => ({
        ...n,
        // restore original IDs so the next paste remaps fresh
        id:
          clip.nodes[clip.nodes.findIndex((c) => idMap.get(c.id) === n.id)]
            ?.id ?? n.id,
      })),
      edges: clip.edges,
      ioPositionAtCopy: ioAddPositionRef.current
        ? { ...ioAddPositionRef.current }
        : null,
    };
  }, [setNodes, setEdges]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "c") {
        copySelectedNodes();
      } else if (mod && e.key === "v") {
        pasteNodes();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [copySelectedNodes, pasteNodes]);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
    // Initialize IO add position to center of the viewport
    if (reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const center = instance.screenToFlowPosition
        ? instance.screenToFlowPosition({
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          })
        : instance.project
          ? instance.project({ x: bounds.width / 2, y: bounds.height / 2 })
          : { x: bounds.width / 2, y: bounds.height / 2 };
      ioAddPositionRef.current = center;
    }
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
      const inputDefaults = buildInitialInputDefaultsForPorts(
        portsInfo.inputs,
        portsInfo.variadicInputs,
        variadicInputCount,
      );

      const newNode: Node = {
        id,
        type,
        position,
        data: {
          label: displayLabel,
          originalType: canonicalType,
          params,
          ...(inputDefaults ? { inputDefaults } : {}),
          ...(variadicInputCount > 0 ? { variadicInputCount } : {}),
        },
      };

      setNodes((prev) => [...prev, newNode] as any);

      // Set IO add position just below the dropped node
      const estimatedHeight = 60;
      ioAddPositionRef.current = {
        x: position.x,
        y: position.y + estimatedHeight + IO_NODE_GAP,
      };
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
            onNodeDragStop={onNodeDragStop}
            onPaneClick={onPaneClick}
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodesDelete={onNodesDelete}
            selectionKeyCode="Shift"
            multiSelectionKeyCode="Shift"
            deleteKeyCode={["Backspace", "Delete"]}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            fitView
            minZoom={0.05}
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
