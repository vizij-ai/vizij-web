import { useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { valueAsNumber, type ValueJSON } from "@vizij/value-json";
import { useEditorStore } from "../store/useEditorStore";
import {
  outputValueBridge,
  type PathSnapshot,
} from "../hooks/useOutputValueBridge";
import { OUTPUT_TARGET_TYPE } from "./OutputTargetNode";

/**
 * Headless component that samples output values from the arora device store
 * after each engine step, writing them into the shared outputValueBridge.
 * Must be rendered inside VizijRuntimeProvider.
 */
export function MotionGraphValueSampler({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }
  return <MotionGraphValueSamplerInner />;
}

function MotionGraphValueSamplerInner() {
  const { subscribeToStep, getValueSnapshot, namespace } = useVizijRuntime();
  const activeRef = useRef(true);

  useEffect(() => {
    let debugCount = 0;
    const normalizedNamespace = normalizePath(namespace);
    const unsub = subscribeToStep(() => {
      if (!activeRef.current) return;

      // Collect all output target paths from editor store
      const { nodes } = useEditorStore.getState();
      const outputPaths: string[] = [];
      for (const node of nodes) {
        if (node.type === OUTPUT_TARGET_TYPE && node.data?.outputPath) {
          outputPaths.push(node.data.outputPath as string);
        }
      }

      if (outputPaths.length === 0) return;

      const snapshot: PathSnapshot = new Map();
      for (const outputPath of outputPaths) {
        const normalizedOutputPath = normalizePath(outputPath);
        const pathCandidates = [normalizedOutputPath];
        if (normalizedNamespace) {
          pathCandidates.push(`${normalizedNamespace}/${normalizedOutputPath}`);
        }

        let matchedPath: string | null = null;
        let matchedValue: ValueJSON | undefined;
        for (const pathCandidate of pathCandidates) {
          const value = getValueSnapshot(pathCandidate);
          if (value !== undefined) {
            matchedPath = pathCandidate;
            matchedValue = value;
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
            storePath: matchedPath,
            rawValue: matchedValue,
            extractedNum: num,
          });
        }
      }

      outputValueBridge.update(snapshot);
    });

    return unsub;
  }, [getValueSnapshot, namespace, subscribeToStep]);

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
