import {
  buildBindingIssuesMap,
  buildGraphMachineReport,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
} from "@vizij/studio-support";
import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import {
  resolveRuntimeGraphSpec,
  type RuntimeGraphSpec,
} from "../runtimeGraphSpec";

export {
  buildBindingIssuesMap,
  buildGraphMachineReport,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
};

export interface RuntimeGraphResolution {
  resolved: ReturnType<typeof resolveRuntimeGraphSpec>;
  nextLastKnownGood: RuntimeGraphSpec | null;
}

export function resolveRuntimeGraphSpecWithCache(
  rigGraphBuild: BuildGraphResult | null,
  lastKnownGoodRuntimeSpec: RuntimeGraphSpec | null,
): RuntimeGraphResolution {
  const resolved = resolveRuntimeGraphSpec(
    rigGraphBuild,
    lastKnownGoodRuntimeSpec,
  );
  const nextLastKnownGood =
    !resolved.blocked && resolved.runtimeSpec
      ? resolved.runtimeSpec
      : lastKnownGoodRuntimeSpec;
  return { resolved, nextLastKnownGood };
}
