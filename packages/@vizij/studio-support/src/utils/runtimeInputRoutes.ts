import {
  deriveStandardRigInputIdFromPath,
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
  type StandardRigInput,
} from "@vizij/utils";
import { normalizeGraphPath } from "./graphPaths";
import { buildRigInputPath } from "./posePaths";

const POSE_CONTROL_INPUT_PATH_PREFIX = "/pose/control/";

export interface RuntimeInputRoute {
  graphPath: string;
  defaultValue: number;
}

export interface RuntimeInputRouteSnapshot {
  routesByCanonicalId: Map<string, RuntimeInputRoute>;
  graphPathLookupByInputId: Map<string, string>;
  defaults: Record<string, number>;
}

export interface RuntimeInputRouteManagedInput {
  input: StandardRigInput;
}

export interface RuntimeInputRouteGraphSummary {
  inputs?: readonly unknown[];
}

export interface BuildRuntimeInputRouteSnapshotArgs {
  faceId: string;
  graphSummary: RuntimeInputRouteGraphSummary | null;
  rigOutputLookup: ReadonlyMap<string, StandardRigInput>;
  standardInputsByPath: ReadonlyMap<string, StandardRigInput>;
  standardInputsById: ReadonlyMap<string, StandardRigInput>;
  managedStandardInputs: readonly RuntimeInputRouteManagedInput[];
  resolveRuntimeInputId: (inputId: string) => string;
}

function parseOverrideRuntimePath(
  graphPath: string,
): { inputId: string; field: "enabled" | "value" } | null {
  const match = graphPath.match(
    /^rig\/[^/]+\/override\/([^/]+)\/(enabled|value)$/,
  );
  if (!match) {
    return null;
  }
  return {
    inputId: match[1] ?? "",
    field: (match[2] as "enabled" | "value") ?? "value",
  };
}

function isPoseControlInputPath(path: string): boolean {
  const normalized = normalizeStandardRigInputPath(path);
  return normalized.startsWith(POSE_CONTROL_INPUT_PATH_PREFIX);
}

export function buildFallbackGraphPath(
  faceId: string,
  input: StandardRigInput,
): string {
  return buildRigInputPath(faceId, normalizeStandardRigInputPath(input.path));
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
    const overridePath = parseOverrideRuntimePath(graphPath);
    if (overridePath) {
      const resolvedInputId = resolveRuntimeInputId(overridePath.inputId);
      const defaultValue =
        overridePath.field === "value"
          ? (standardInputsById.get(resolvedInputId)?.defaultValue ?? 0)
          : 0;
      registerInputRoute(graphPath, graphPath, defaultValue);
      return;
    }

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
      if (remainder.startsWith("propsrig/")) {
        candidatePaths.add(
          `/rig/element/${remainder.slice("propsrig/".length)}`,
        );
      }
      if (remainder.startsWith("rig/element/")) {
        candidatePaths.add(
          `/propsrig/${remainder.slice("rig/element/".length)}`,
        );
      }
      if (remainder.startsWith("pose/control/")) {
        candidatePaths.add(
          `/propsrig/${remainder.slice("pose/control/".length)}`,
        );
      }
      if (remainder.startsWith("rig/control/")) {
        candidatePaths.add(
          `/propsrig/${remainder.slice("rig/control/".length)}`,
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
