import { useVizijChanges, useVizijRuntime } from "@vizij/runtime-react";
import { valueAsNumber, type ValueJSON } from "@vizij/value-json";
import { useEditorStore } from "../store/useEditorStore";
import {
  outputValueBridge,
  type PathSnapshot,
} from "../hooks/useOutputValueBridge";
import { OUTPUT_TARGET_TYPE } from "./OutputTargetNode";

/**
 * Headless component that samples the editor's output values from the face's
 * store into the shared outputValueBridge: at most once per drawn frame, from
 * the provider's batch of changes, each output read as its latest value.
 * Must be rendered inside VizijRuntimeProvider.
 */
export function MotionGraphValueSampler({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }
  return <MotionGraphValueSamplerInner />;
}

function MotionGraphValueSamplerInner() {
  const { runtime } = useVizijRuntime();

  useVizijChanges(() => {
    if (!runtime) return;
    const { nodes } = useEditorStore.getState();
    const outputPaths: string[] = [];
    for (const node of nodes) {
      if (node.type === OUTPUT_TARGET_TYPE && node.data?.outputPath) {
        outputPaths.push(node.data.outputPath as string);
      }
    }
    if (outputPaths.length === 0) return;

    const values = runtime.readValues(outputPaths.map(normalizePath));
    const snapshot: PathSnapshot = new Map();
    for (const path of outputPaths) {
      snapshot.set(
        path,
        extractNumericValue(values[normalizePath(path)] ?? undefined),
      );
    }
    outputValueBridge.update(snapshot);
  });

  return null;
}

function extractNumericValue(value: ValueJSON | undefined): number | null {
  if (value === undefined || value === null) return null;
  const num = valueAsNumber(value);
  if (typeof num === "number" && Number.isFinite(num)) return num;
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>).bool;
    if (typeof inner === "boolean") return inner ? 1 : 0;
  }
  return null;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
