import { useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  usePoseHotkeys,
  type PoseHotkeyBinding,
} from "../hooks/usePoseHotkeys";
import { addPoseTriggerListener } from "../lib/poseRigBroadcast";

type PoseRigMirrorBridgeProps = {
  enabled?: boolean;
};

export function PoseRigMirrorBridge({
  enabled = true,
}: PoseRigMirrorBridgeProps) {
  const { ready, assetBundle } = useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const runtimeEnabled = enabled && ready;
  const { bindings, setPoseWeight } = usePoseHotkeys(
    poseConfig,
    runtimeEnabled,
  );

  const bindingMaps = useMemo(() => {
    const byId = new Map<string, PoseHotkeyBinding>();
    const byRelativePath = new Map<string, PoseHotkeyBinding>();
    bindings.forEach((binding) => {
      byId.set(binding.pose.id, binding);
      byRelativePath.set(binding.relativePath, binding);
    });
    return { byId, byRelativePath };
  }, [bindings]);

  useEffect(() => {
    if (!runtimeEnabled || bindingMaps.byId.size === 0) {
      return;
    }
    return addPoseTriggerListener((detail) => {
      const binding =
        (detail.poseId && bindingMaps.byId.get(detail.poseId)) ||
        (detail.relativePath &&
          bindingMaps.byRelativePath.get(detail.relativePath));
      if (!binding) {
        return;
      }
      setPoseWeight(binding, detail.weight);
    });
  }, [bindingMaps, runtimeEnabled, setPoseWeight]);

  return null;
}
