import { useVizijRuntime } from "@vizij/runtime-react";
import type { EditorEdge, EditorNode } from "./store/useEditorStore";
import { useMotionGraphDriver } from "./hooks/useMotionGraphDriver";

interface MotionGraphDriverBridgeProps {
  active: boolean;
  nodes?: EditorNode[];
  edges?: EditorEdge[];
}

export function MotionGraphDriverBridge({
  active,
  nodes,
  edges,
}: MotionGraphDriverBridgeProps) {
  if (!active) return null;
  return <MotionGraphDriverInner nodes={nodes} edges={edges} />;
}

function MotionGraphDriverInner({
  nodes,
  edges,
}: {
  nodes?: EditorNode[];
  edges?: EditorEdge[];
}) {
  // Use the runtime's own namespace so the motiongraph's output paths match
  // the rig's namespaced Input node paths on the orchestrator blackboard.
  // Pass `controllers` as a resync signal so the driver re-registers its
  // graph whenever VizijRuntimeProvider clears and re-registers its own
  // controllers (rig/pose graphs).
  const { namespace, controllers } = useVizijRuntime();
  useMotionGraphDriver(namespace, controllers, nodes, edges);
  return null;
}
