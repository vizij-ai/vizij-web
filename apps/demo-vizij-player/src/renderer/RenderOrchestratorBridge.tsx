import { useEffect, useMemo } from "react";
import { useVizijStore } from "@vizij/render";
import { useOrchFrame } from "@vizij/orchestrator-react";
import type { RawValue } from "@vizij/utils";
import { valueJSONToRaw } from "./valueConversion";

type RenderOrchestratorBridgeProps = {
  namespace: string;
  outputPaths: string[];
  enabled: boolean;
};

export function RenderOrchestratorBridge({
  namespace,
  outputPaths,
  enabled,
}: RenderOrchestratorBridgeProps) {
  const frame = useOrchFrame();
  const setVizijValue = useVizijStore((state) => state.setValue);
  const pathSet = useMemo(() => new Set(outputPaths), [outputPaths]);

  useEffect(() => {
    if (!enabled || !frame || pathSet.size === 0) {
      return;
    }
    const writes = frame.merged_writes ?? [];
    if (!writes.length) {
      return;
    }
    writes.forEach((write) => {
      const normalized = write.path.startsWith("debug/")
        ? write.path.slice("debug/".length)
        : write.path;
      if (!pathSet.has(normalized)) {
        return;
      }
      const raw = valueJSONToRaw(write.value);
      if (raw === undefined) {
        return;
      }
      console.log("demo-animating-faces: renderer input", normalized, raw);
      setVizijValue(normalized, namespace, raw as RawValue);
    });
  }, [enabled, frame, namespace, pathSet, setVizijValue]);

  return null;
}
