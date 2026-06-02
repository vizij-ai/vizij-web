import type {
  AnimationRegistrationConfig,
  OrchestratorBackend,
  ValueJSON,
} from "../types";

export type AnimationTransportPreference = "auto" | "host" | "orchestrator";
export type ResolvedAnimationTransportMode = "host" | "orchestrator";
export type AnimationControllerInput = { path: string; value: ValueJSON };

export function resolveAnimationTransportMode(
  mode: AnimationTransportPreference | undefined,
  backend: OrchestratorBackend | undefined,
): ResolvedAnimationTransportMode {
  if (mode === "host" || mode === "orchestrator") {
    return mode;
  }
  return backend === "aroraWeb" ? "orchestrator" : "host";
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

export function buildAnimationControllerCommandPath(
  controllerId: string,
  action: string,
  playerId = 0,
): string {
  return `anim/controller/${trimSlashes(controllerId)}/player/${playerId}/cmd/${trimSlashes(action)}`;
}

export function buildAnimationControllerInstancePath(
  controllerId: string,
  field: string,
  playerId = 0,
  instanceId = 0,
): string {
  return `anim/controller/${trimSlashes(controllerId)}/player/${playerId}/instance/${instanceId}/${trimSlashes(field)}`;
}

export function buildAnimationControllerPlayInputs(
  controllerId: string,
  options: {
    reset?: boolean;
    loop: boolean;
    speed: number;
    weight: number;
  },
): AnimationControllerInput[] {
  return [
    ...(options.reset
      ? [
          {
            path: buildAnimationControllerCommandPath(controllerId, "seek"),
            value: { float: 0 },
          } satisfies AnimationControllerInput,
        ]
      : []),
    {
      path: buildAnimationControllerCommandPath(controllerId, "set_loop"),
      value: options.loop ? "loop" : "once",
    },
    {
      path: buildAnimationControllerCommandPath(controllerId, "set_speed"),
      value: { float: options.speed },
    },
    {
      path: buildAnimationControllerInstancePath(controllerId, "weight"),
      value: { float: options.weight },
    },
    {
      path: buildAnimationControllerCommandPath(controllerId, "play"),
      value: { bool: true },
    },
  ];
}

export function buildAnimationControllerPauseInputs(
  controllerId: string,
): AnimationControllerInput[] {
  return [
    {
      path: buildAnimationControllerCommandPath(controllerId, "set_speed"),
      value: { float: 0 },
    },
    {
      path: buildAnimationControllerCommandPath(controllerId, "pause"),
      value: { bool: true },
    },
  ];
}

export function buildAnimationControllerStopInputs(
  controllerId: string,
): AnimationControllerInput[] {
  return [
    {
      path: buildAnimationControllerCommandPath(controllerId, "set_speed"),
      value: { float: 0 },
    },
    {
      path: buildAnimationControllerInstancePath(controllerId, "weight"),
      value: { float: 0 },
    },
    {
      path: buildAnimationControllerCommandPath(controllerId, "stop"),
      value: { bool: true },
    },
  ];
}

export function prepareAnimationRegistrationForTransport(
  config: AnimationRegistrationConfig,
  transport: ResolvedAnimationTransportMode,
): AnimationRegistrationConfig {
  if (transport !== "orchestrator") {
    return config;
  }

  const setup = config.setup ?? {};
  return {
    ...config,
    setup: {
      ...setup,
      player: {
        ...(setup.player ?? {}),
        speed: 0,
      },
      instance: {
        ...(setup.instance ?? {}),
        weight: 0,
      },
    },
  };
}
