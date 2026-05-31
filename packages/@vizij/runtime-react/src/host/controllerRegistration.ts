import type {
  AnimationRegistrationConfig,
  ControllerId,
  GraphRegistrationInput,
  MergeStrategyOptions,
  MergedGraphRegistrationConfig,
  ShapeJSON,
  ValueJSON,
} from "@vizij/orchestrator-react";
import {
  namespaceControllerId,
  prepareAnimationRegistrationForTransport,
  planRuntimeControllerRemoval,
  summarizeRuntimeControllerRegistration,
  type InputConstraint,
  type ResolvedAnimationTransportMode,
  type RuntimeProgramRegistrationSupportResult,
  type RuntimeRegistrationPlan,
} from "@vizij/studio-support";

type ControllerList = { graphs: ControllerId[]; anims: ControllerId[] };

export type RuntimeControllerHost = {
  listControllers: () => ControllerList;
  removeGraph: (id: ControllerId) => boolean;
  removeAnimation: (id: ControllerId) => boolean;
  registerGraph: (config: GraphRegistrationInput) => ControllerId;
  registerMergedGraph: (config: MergedGraphRegistrationConfig) => ControllerId;
  registerAnimation: (config: AnimationRegistrationConfig) => ControllerId;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
};

export type RuntimeControllerHostError = {
  message: string;
  phase: "registration" | "animation";
  cause?: unknown;
};

export type ClearRuntimeControllersResult = {
  removedGraphs: ControllerId[];
  removedAnimations: ControllerId[];
  errors: RuntimeControllerHostError[];
};

export type RegisterRuntimeControllersResult = {
  graphIds: ControllerId[];
  animationIds: ControllerId[];
  animationControllerIds: Map<string, ControllerId>;
  programRegistrationMap: Map<string, RuntimeProgramRegistrationSupportResult>;
  mergedGraphId: ControllerId | null;
  outputPaths: Set<string>;
  baseOutputPaths: Set<string>;
  namespacedOutputPaths: Set<string>;
  inputConstraints: Record<string, InputConstraint>;
  rigInputMap: Record<string, string>;
  rigPoseControlInputIds: Set<string>;
  controllers: ControllerList;
  errors: RuntimeControllerHostError[];
};

export function clearRuntimeControllers(args: {
  host: Pick<
    RuntimeControllerHost,
    "listControllers" | "removeGraph" | "removeAnimation"
  >;
  graphIds?: Iterable<ControllerId>;
  animationIds?: Iterable<ControllerId>;
  namespace?: string;
}): ClearRuntimeControllersResult {
  const errors: RuntimeControllerHostError[] = [];
  const removedGraphs: ControllerId[] = [];
  const removedAnimations: ControllerId[] = [];
  const plan = planRuntimeControllerRemoval({
    controllers: args.host.listControllers(),
    graphIds: args.graphIds,
    animationIds: args.animationIds,
    namespace: args.namespace,
  });

  plan.graphIds.forEach((id) => {
    try {
      args.host.removeGraph(id);
      removedGraphs.push(id);
    } catch (cause: unknown) {
      errors.push({
        message: `Failed to remove graph ${id}`,
        cause,
        phase: "registration",
      });
    }
  });

  plan.animationIds.forEach((id) => {
    try {
      args.host.removeAnimation(id);
      removedAnimations.push(id);
    } catch (cause: unknown) {
      errors.push({
        message: `Failed to remove animation ${id}`,
        cause,
        phase: "registration",
      });
    }
  });

  return { removedGraphs, removedAnimations, errors };
}

export function registerRuntimeControllers(args: {
  host: Pick<
    RuntimeControllerHost,
    | "registerGraph"
    | "registerMergedGraph"
    | "registerAnimation"
    | "setInput"
    | "listControllers"
  >;
  plan: RuntimeRegistrationPlan;
  namespace: string;
  mergeStrategy?: MergeStrategyOptions;
  defaultMergeStrategy?: MergeStrategyOptions;
  animationTransport: ResolvedAnimationTransportMode;
  initialInputs?: Record<string, ValueJSON>;
  previousMergedGraphId?: ControllerId | null;
}): RegisterRuntimeControllersResult {
  const errors: RuntimeControllerHostError[] = [];
  const graphIds: ControllerId[] = [];
  const animationIds: ControllerId[] = [];
  const animationControllerIds = new Map<string, ControllerId>();
  let mergedGraphId: ControllerId | null = null;

  try {
    if (args.plan.graphConfigs.length > 1) {
      const id = args.host.registerMergedGraph({
        id:
          namespaceControllerId(
            args.previousMergedGraphId ?? `merged-${args.namespace}`,
            args.namespace,
            "merged",
          ) ?? undefined,
        graphs: args.plan.graphConfigs,
        strategy: args.mergeStrategy ?? args.defaultMergeStrategy,
      });
      mergedGraphId = id;
      graphIds.push(id);
    } else {
      args.plan.graphConfigs.forEach((config) => {
        graphIds.push(args.host.registerGraph(config));
      });
    }
  } catch (cause: unknown) {
    errors.push({
      message: "Failed to register rig graphs",
      cause,
      phase: "registration",
    });
  }

  for (const registration of args.plan.animationRegistrations) {
    try {
      const id = args.host.registerAnimation(
        prepareAnimationRegistrationForTransport(
          registration.config,
          args.animationTransport,
        ),
      );
      animationIds.push(id);
      animationControllerIds.set(registration.assetId, id);
    } catch (cause: unknown) {
      errors.push({
        message: `Failed to register animation ${registration.assetId}`,
        cause,
        phase: "animation",
      });
    }
  }

  Object.entries(args.initialInputs ?? {}).forEach(([path, value]) => {
    try {
      args.host.setInput(path, value);
    } catch (cause: unknown) {
      errors.push({
        message: `Failed to stage initial input ${path}`,
        cause,
        phase: "registration",
      });
    }
  });

  const summary = summarizeRuntimeControllerRegistration({
    plan: args.plan,
    graphIds,
    animationIds,
    animationControllerIds,
  });

  return {
    graphIds: summary.graphIds,
    animationIds: summary.animationIds,
    animationControllerIds: summary.animationControllerIds,
    programRegistrationMap: summary.programRegistrationMap,
    mergedGraphId,
    outputPaths: summary.outputPaths,
    baseOutputPaths: summary.baseOutputPaths,
    namespacedOutputPaths: summary.namespacedOutputPaths,
    inputConstraints: summary.inputConstraints,
    rigInputMap: summary.rigInputMap,
    rigPoseControlInputIds: summary.rigPoseControlInputIds,
    controllers: args.host.listControllers(),
    errors,
  };
}
