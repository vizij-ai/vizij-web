import { useCallback, useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  usePoseHotkeys,
  type PoseHotkeyBinding,
} from "../hooks/usePoseHotkeys";
import {
  addPoseTriggerListener,
  type PoseTriggerEventDetail,
} from "../lib/poseRigBroadcast";

type PoseRigMirrorBridgeProps = {
  enabled?: boolean;
  trigger?: (PoseTriggerEventDetail & { token: number }) | null;
};

export function PoseRigMirrorBridge({
  enabled = true,
  trigger = null,
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
    const bySemanticKey = new Map<string, PoseHotkeyBinding>();
    bindings.forEach((binding) => {
      byId.set(binding.pose.id, binding);
      byRelativePath.set(binding.relativePath, binding);
      if (binding.semanticKey && !bySemanticKey.has(binding.semanticKey)) {
        bySemanticKey.set(binding.semanticKey, binding);
      }
    });
    return { byId, byRelativePath, bySemanticKey };
  }, [bindings]);

  const applyTrigger = useCallback(
    (detail: PoseTriggerEventDetail) => {
      const binding =
        (detail.poseId && bindingMaps.byId.get(detail.poseId)) ||
        (detail.relativePath &&
          bindingMaps.byRelativePath.get(detail.relativePath)) ||
        (detail.semanticKey
          ? bindingMaps.bySemanticKey.get(detail.semanticKey)
          : null);
      if (
        (globalThis as { __VIZIJ_RUNTIME_DEBUG__?: boolean })
          .__VIZIJ_RUNTIME_DEBUG__
      ) {
        console.log("[showcase] pose mirror", {
          faceId: poseConfig?.faceId ?? null,
          poseId: detail.poseId ?? null,
          relativePath: detail.relativePath ?? null,
          semanticKey: detail.semanticKey ?? null,
          weight: detail.weight,
          matchedPoseId: binding?.pose.id ?? null,
          matchedPath: binding?.weightPath ?? null,
        });
      }
      if (!binding) {
        return;
      }
      setPoseWeight(binding, detail.weight);
    },
    [bindingMaps, poseConfig?.faceId, setPoseWeight],
  );

  useEffect(() => {
    if (!runtimeEnabled || !trigger) {
      return;
    }
    applyTrigger(trigger);
  }, [applyTrigger, runtimeEnabled, trigger]);

  useEffect(() => {
    if (!runtimeEnabled || bindingMaps.byId.size === 0 || trigger) {
      return;
    }
    return addPoseTriggerListener(applyTrigger);
  }, [applyTrigger, bindingMaps, runtimeEnabled, trigger]);

  return null;
}
