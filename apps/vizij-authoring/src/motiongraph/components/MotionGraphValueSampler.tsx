import { useEffect, useRef } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useEditorStore } from "../store/useEditorStore";
import {
  outputValueBridge,
  type PathSnapshot,
} from "../hooks/useOutputValueBridge";
import { OUTPUT_TARGET_TYPE } from "./OutputTargetNode";

/**
 * Headless component that subscribes to orchestrator frames and samples
 * output values, writing them into the shared outputValueBridge.
 * Must be rendered inside VizijRuntimeProvider.
 */
export function MotionGraphValueSampler({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }
  return <MotionGraphValueSamplerInner />;
}

function MotionGraphValueSamplerInner() {
  const { subscribeToFrame, getFrameSnapshot } = useOrchestrator();
  const { namespace } = useVizijRuntime();
  const activeRef = useRef(true);

  useEffect(() => {
    let debugCount = 0;
    const normalizedNamespace = normalizePath(namespace);
    const unsub = subscribeToFrame(() => {
      if (!activeRef.current) return;

      const frame = getFrameSnapshot();
      if (!frame) return;

      // Collect all output target paths from editor store
      const { nodes } = useEditorStore.getState();
      const outputPaths: string[] = [];
      for (const node of nodes) {
        if (node.type === OUTPUT_TARGET_TYPE && node.data?.outputPath) {
          outputPaths.push(node.data.outputPath as string);
        }
      }

      if (outputPaths.length === 0) return;

      // Build a canonical map of frame writes for exact path matching.
      const writesByPath = new Map<string, unknown>();
      for (const write of frame.merged_writes) {
        writesByPath.set(normalizePath(write.path), write.value);
      }

      const snapshot: PathSnapshot = new Map();
      for (const outputPath of outputPaths) {
        const normalizedOutputPath = normalizePath(outputPath);
        const pathCandidates = [normalizedOutputPath];
        if (normalizedNamespace) {
          pathCandidates.push(`${normalizedNamespace}/${normalizedOutputPath}`);
        }

        let matchedPath: string | null = null;
        let matchedValue: unknown;
        for (const pathCandidate of pathCandidates) {
          if (writesByPath.has(pathCandidate)) {
            matchedPath = pathCandidate;
            matchedValue = writesByPath.get(pathCandidate);
            break;
          }
        }

        if (matchedPath === null) {
          snapshot.set(outputPath, null);
          continue;
        }

        const num = extractNumericValue(matchedValue);
        snapshot.set(outputPath, num);
        // DEBUG: log first match to verify path + value extraction
        if (debugCount < 3) {
          debugCount++;
          console.log("[MgValueSampler] matched", {
            outputPath,
            writePath: matchedPath,
            rawValue: matchedValue,
            extractedNum: num,
          });
        }
      }

      outputValueBridge.update(snapshot);
    });

    return unsub;
  }, [getFrameSnapshot, namespace, subscribeToFrame]);

  return null;
}

function extractNumericValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value != null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Handle ValueJSON format: { type: 'Float', data: N }
    if (typeof obj.data === "number") return obj.data;
    // Handle WASM-style typed values like { f32: 0.5 }
    const keys = Object.keys(obj);
    if (keys.length === 1) {
      const inner = obj[keys[0]];
      if (typeof inner === "number") return inner;
    }
  }
  return null;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+|\/+$/g, "");
}
