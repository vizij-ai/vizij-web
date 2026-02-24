import type { BuildGraphResult } from "@vizij/node-graph-authoring";
import {
  deriveStandardRigInputIdFromPath,
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
  type StandardRigInput,
} from "@vizij/utils";
import { isPoseControlInputPath } from "../../poseRig/utils";
import type { ManagedStandardInput } from "../../types/standardInputs";
import { normalizeGraphPath } from "../../utils/graphPaths";
import { buildFallbackGraphPath } from "../graphRuntime";

export interface RuntimeInputRoute {
  graphPath: string;
  defaultValue: number;
}

export interface RuntimeInputRouteSnapshot {
  routesByCanonicalId: Map<string, RuntimeInputRoute>;
  graphPathLookupByInputId: Map<string, string>;
  defaults: Record<string, number>;
}

interface BuildRuntimeInputRouteSnapshotArgs {
  faceId: string;
  graphSummary: BuildGraphResult["summary"] | null;
  rigOutputLookup: Map<string, StandardRigInput>;
  standardInputsByPath: Map<string, StandardRigInput>;
  standardInputsById: Map<string, StandardRigInput>;
  managedStandardInputs: ManagedStandardInput[];
  resolveRuntimeInputId: (inputId: string) => string;
}

export function createEmptyRuntimeInputRouteSnapshot(): RuntimeInputRouteSnapshot {
  return {
    routesByCanonicalId: new Map(),
    graphPathLookupByInputId: new Map(),
    defaults: {},
  };
}

export function buildRuntimeInputRouteSnapshot({
  faceId,
  graphSummary,
  rigOutputLookup,
  standardInputsByPath,
  standardInputsById,
  managedStandardInputs,
  resolveRuntimeInputId,
}: BuildRuntimeInputRouteSnapshotArgs): RuntimeInputRouteSnapshot {
  if (!graphSummary) {
    return createEmptyRuntimeInputRouteSnapshot();
  }

  const facePrefix = `rig/${faceId}/`;
  const summaryInputPaths = Array.isArray(graphSummary.inputs)
    ? graphSummary.inputs
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.replace(/^\/+/, ""))
    : [];

  const routesByCanonicalId = new Map<string, RuntimeInputRoute>();
  const graphPathLookupByInputId = new Map<string, string>();
  const defaults: Record<string, number> = {};

  const registerInputRoute = (
    inputId: string,
    graphPath: string,
    defaultValue: number,
  ) => {
    const canonicalInputId = resolveRuntimeInputId(inputId);
    if (!canonicalInputId) {
      return;
    }
    if (!routesByCanonicalId.has(canonicalInputId)) {
      routesByCanonicalId.set(canonicalInputId, {
        graphPath,
        defaultValue,
      });
    }
    graphPathLookupByInputId.set(canonicalInputId, graphPath);
    if (canonicalInputId !== inputId) {
      graphPathLookupByInputId.set(inputId, graphPath);
    }
    defaults[canonicalInputId] = defaultValue;
  };

  summaryInputPaths.forEach((graphPath) => {
    if (isPoseControlInputPath(graphPath)) {
      return;
    }

    let matched: StandardRigInput | undefined;
    let remainder = graphPath;
    const normalizedGraphPath = normalizeGraphPath(graphPath);
    if (normalizedGraphPath) {
      matched = rigOutputLookup.get(normalizedGraphPath);
    }

    if (!matched) {
      if (graphPath.startsWith(facePrefix)) {
        remainder = graphPath.slice(facePrefix.length);
      } else if (graphPath.startsWith("rig/")) {
        const segments = graphPath.split("/");
        if (segments.length >= 3) {
          remainder = segments.slice(2).join("/");
        } else {
          remainder = segments.slice(1).join("/");
        }
      }
      remainder = remainder.replace(/^\/+/g, "");
      const candidatePaths = new Set<string>([
        `/${remainder}`,
        stripStandardInputPathPrefix(`/${remainder}`),
      ]);
      if (remainder.startsWith("autorig/")) {
        candidatePaths.add(
          `/rig/element/${remainder.slice("autorig/".length)}`,
        );
      }
      if (remainder.startsWith("rig/element/")) {
        candidatePaths.add(
          `/autorig/${remainder.slice("rig/element/".length)}`,
        );
      }
      if (remainder.startsWith("pose/control/")) {
        candidatePaths.add(
          `/autorig/${remainder.slice("pose/control/".length)}`,
        );
      }
      if (remainder.startsWith("rig/control/")) {
        candidatePaths.add(
          `/autorig/${remainder.slice("rig/control/".length)}`,
        );
      }
      for (const candidatePath of Array.from(candidatePaths)) {
        const normalizedCandidate =
          normalizeStandardRigInputPath(candidatePath);
        matched = standardInputsByPath.get(normalizedCandidate);
        if (matched) {
          break;
        }
      }
    }

    if (!matched) {
      const candidateId = deriveStandardRigInputIdFromPath(`/${remainder}`);
      matched = standardInputsById.get(candidateId);
    }
    if (matched) {
      registerInputRoute(matched.id, graphPath, matched.defaultValue ?? 0);
      return;
    }

    const fallbackPath = normalizeStandardRigInputPath(`/${remainder}`);
    if (!fallbackPath || fallbackPath === "/custom/input") {
      return;
    }
    const fallbackInputId = deriveStandardRigInputIdFromPath(fallbackPath);
    registerInputRoute(fallbackInputId, graphPath, 0);
  });

  managedStandardInputs.forEach(({ input }) => {
    const canonicalInputId = resolveRuntimeInputId(input.id);
    if (routesByCanonicalId.has(canonicalInputId)) {
      return;
    }
    const fallbackPath = buildFallbackGraphPath(faceId, input);
    registerInputRoute(input.id, fallbackPath, input.defaultValue ?? 0);
  });

  return {
    routesByCanonicalId,
    graphPathLookupByInputId,
    defaults,
  };
}
