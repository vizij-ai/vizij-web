import { useVizijRuntime } from "@vizij/runtime-react";
import { useMotionGraphDriver } from "./hooks/useMotionGraphDriver";

interface MotionGraphDriverBridgeProps {
  active: boolean;
}

export function MotionGraphDriverBridge({
  active,
}: MotionGraphDriverBridgeProps) {
  if (!active) return null;
  return <MotionGraphDriverInner />;
}

function MotionGraphDriverInner() {
  // Use the runtime's own namespace so the motiongraph's output paths match
  // the rig's namespaced Input node paths on the orchestrator blackboard.
  // Pass `controllers` as a resync signal so the driver re-registers its
  // graph whenever VizijRuntimeProvider clears and re-registers its own
  // controllers (rig/pose graphs).
  const { namespace, controllers } = useVizijRuntime();
  useMotionGraphDriver(namespace, controllers);
  return null;
}
