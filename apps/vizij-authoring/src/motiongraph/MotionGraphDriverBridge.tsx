import type { EditorEdge, EditorNode } from "./store/useEditorStore";
import { useMotionGraphDriver } from "./hooks/useMotionGraphDriver";

interface MotionGraphDriverBridgeProps {
  active: boolean;
  controllerId?: string;
  nodes?: EditorNode[];
  edges?: EditorEdge[];
}

/** While `active`, the editor's graph runs on the face (see
 * `useMotionGraphDriver`). */
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
  useMotionGraphDriver(controllerId, nodes, edges);
  return null;
}
