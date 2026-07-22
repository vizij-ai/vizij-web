import { useVizijRuntime } from "@vizij/runtime-react";
import type { EditorEdge, EditorNode } from "./store/useEditorStore";
import { useMotionGraphDriver } from "./hooks/useMotionGraphDriver";

interface MotionGraphDriverBridgeProps {
  active: boolean;
  controllerId?: string;
  nodes?: EditorNode[];
  edges?: EditorEdge[];
}

export function MotionGraphDriverBridge({
  active,
  controllerId,
  nodes,
  edges,
}: MotionGraphDriverBridgeProps) {
  if (!active) return null;
  return (
    <MotionGraphDriverInner
      controllerId={controllerId}
      nodes={nodes}
      edges={edges}
    />
  );
}

function MotionGraphDriverInner({
  controllerId,
  nodes,
  edges,
}: {
  controllerId?: string;
  nodes?: EditorNode[];
  edges?: EditorEdge[];
}) {
  // Use the runtime's own namespace so the motiongraph's output paths match
  // the rig's namespaced Input node paths in the arora device store.
  // Pass `controllers` as a resync signal so the driver re-publishes its
  // graph whenever VizijRuntimeProvider clears and re-registers its own
  // controllers (rig/pose graphs).
  const { namespace, controllers } = useVizijRuntime();
  useMotionGraphDriver(namespace, controllerId, controllers, nodes, edges);
  return null;
}
