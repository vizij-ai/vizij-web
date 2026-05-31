import type {
  InputConstraint,
  RuntimeProgramRegistrationSupportResult,
  RuntimeRegistrationPlan,
} from "../types";

export type RuntimeControllerList = {
  graphs: string[];
  anims: string[];
};

export type RuntimeControllerRemovalPlanOptions = {
  controllers: RuntimeControllerList;
  graphIds?: Iterable<string> | null;
  animationIds?: Iterable<string> | null;
  namespace?: string | null;
};

export type RuntimeControllerRemovalPlan = {
  graphIds: string[];
  animationIds: string[];
};

export type RuntimeControllerRegistrationSummaryOptions = {
  plan: RuntimeRegistrationPlan;
  graphIds: Iterable<string>;
  animationIds: Iterable<string>;
  animationControllerIds?: Iterable<readonly [string, string]> | null;
};

export type RuntimeControllerRegistrationSummary = {
  graphIds: string[];
  animationIds: string[];
  animationControllerIds: Map<string, string>;
  programRegistrationMap: Map<string, RuntimeProgramRegistrationSupportResult>;
  outputPaths: Set<string>;
  baseOutputPaths: Set<string>;
  namespacedOutputPaths: Set<string>;
  inputConstraints: Record<string, InputConstraint>;
  rigInputMap: Record<string, string>;
  rigPoseControlInputIds: Set<string>;
};

function uniqueControllerIds(
  ids: Iterable<string> | null | undefined,
): Set<string> {
  return new Set(
    Array.from(ids ?? []).filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );
}

function isNamespacedControllerId(
  id: string,
  namespace: string | null | undefined,
  kinds: readonly string[],
): boolean {
  const trimmedNamespace = namespace?.trim();
  if (!trimmedNamespace) {
    return false;
  }
  return kinds.some((kind) => id.startsWith(`${trimmedNamespace}/${kind}/`));
}

export function planRuntimeControllerRemoval(
  options: RuntimeControllerRemovalPlanOptions,
): RuntimeControllerRemovalPlan {
  const graphIds = uniqueControllerIds(options.graphIds);
  const animationIds = uniqueControllerIds(options.animationIds);
  const hasNamespace = Boolean(options.namespace?.trim());
  const removeAllGraphs = graphIds.size === 0 && !hasNamespace;
  const removeAllAnimations = animationIds.size === 0 && !hasNamespace;

  return {
    graphIds: options.controllers.graphs.filter(
      (id) =>
        removeAllGraphs ||
        graphIds.has(id) ||
        isNamespacedControllerId(id, options.namespace, ["graph", "merged"]),
    ),
    animationIds: options.controllers.anims.filter(
      (id) =>
        removeAllAnimations ||
        animationIds.has(id) ||
        isNamespacedControllerId(id, options.namespace, ["animation"]),
    ),
  };
}

export function summarizeRuntimeControllerRegistration(
  options: RuntimeControllerRegistrationSummaryOptions,
): RuntimeControllerRegistrationSummary {
  return {
    graphIds: Array.from(options.graphIds),
    animationIds: Array.from(options.animationIds),
    animationControllerIds: new Map(options.animationControllerIds ?? []),
    programRegistrationMap: new Map(
      options.plan.programRegistrations.map((registration) => [
        registration.assetId,
        registration,
      ]),
    ),
    outputPaths: new Set(options.plan.outputPaths),
    baseOutputPaths: new Set(options.plan.baseOutputPaths),
    namespacedOutputPaths: new Set(options.plan.namespacedOutputPaths),
    inputConstraints: options.plan.inputConstraints,
    rigInputMap: options.plan.rigInputMap,
    rigPoseControlInputIds: new Set(options.plan.rigPoseControlInputIds),
  };
}
