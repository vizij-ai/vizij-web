import React from "react";
import {
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
} from "@vizij/orchestrator-react";

import {
  DEMO_PATHS,
  MULTIPLY_GRAPH_SPEC,
  POWER_GRAPH_SPEC,
  RAMP_DOWN_ANIMATION_CONFIG,
  RAMP_UP_ANIMATION_CONFIG,
  makeFloatValue,
} from "./demoSpecs";

type OrchFrame = ReturnType<typeof useOrchFrame>;
type FrameWithData = Exclude<OrchFrame, null | undefined>;
type FrameTimings = FrameWithData extends { timings_ms: infer Timings }
  ? NonNullable<Timings>
  : Record<string, never>;
type FrameWrites = FrameWithData extends { merged_writes: infer Writes }
  ? NonNullable<Writes>
  : Array<unknown>;
type TargetValue = ReturnType<typeof useOrchTarget>;

type ControllerIds = {
  multiplyGraph?: string;
  powerGraph?: string;
  rampUp?: string;
  rampDown?: string;
};

export interface DemoOrchestratorState {
  ready: boolean;
  registered: boolean;
  status: string | null;
  focusPath: string | null;
  isPlaying: boolean;
  controllerIds: ControllerIds;
  frame: OrchFrame;
  mergedWrites: FrameWrites;
  timings: FrameTimings;
  values: {
    rampUp: TargetValue;
    rampDown: TargetValue;
    product: TargetValue;
    power: TargetValue;
  };
  focusedValue: TargetValue;
}

export interface DemoOrchestratorActions {
  registerControllers: () => Promise<void>;
  togglePlayback: () => void;
  stepOnce: () => void;
}

export interface UseDemoOrchestratorResult {
  state: DemoOrchestratorState;
  actions: DemoOrchestratorActions;
}

// useDemoOrchestrator centralises demo setup so the App can focus on rendering.
// It wires the orchestrator instance, registers the demo content, and exposes
// a small state/actions surface tailored for the walkthrough UI.
export function useDemoOrchestrator(): UseDemoOrchestratorResult {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    setInput,
    step,
  } = useOrchestrator();
  const frame = useOrchFrame();
  const rampUpValue = useOrchTarget(DEMO_PATHS.animations.rampUp);
  const rampDownValue = useOrchTarget(DEMO_PATHS.animations.rampDown);
  const productValue = useOrchTarget(DEMO_PATHS.graphs.product);
  const powerValue = useOrchTarget(DEMO_PATHS.graphs.power);

  const [status, setStatus] = React.useState<string | null>(null);
  const [registered, setRegistered] = React.useState(false);
  const [controllerIds, setControllerIds] = React.useState<ControllerIds>({});
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [focusPath, setFocusPath] = React.useState<string | null>(null);
  // Track whichever blackboard path the orchestrator wrote to most recently.
  const focusedValue = useOrchTarget(focusPath);

  const requestRafRef = React.useRef<
    ((cb: FrameRequestCallback) => number) | null
  >(null);
  const cancelRafRef = React.useRef<((handle: number) => void) | null>(null);
  const rafHandleRef = React.useRef<number | null>(null);
  const lastTimestampRef = React.useRef<number | null>(null);

  // Boot an orchestrator instance as soon as the provider is ready.
  React.useEffect(() => {
    createOrchestrator().catch((err) => {
      console.error("demo-orchestrator: failed to create orchestrator", err);
      setStatus("Failed to create orchestrator. Check console for details.");
    });
  }, [createOrchestrator]);

  // Stop the playback loop and reset animation frame refs.
  const stopPlayback = React.useCallback((reason?: string) => {
    const cancel = cancelRafRef.current;
    if (cancel && rafHandleRef.current != null) {
      cancel(rafHandleRef.current);
    }
    rafHandleRef.current = null;
    requestRafRef.current = null;
    cancelRafRef.current = null;
    lastTimestampRef.current = null;
    if (reason) {
      setStatus(reason);
    }
    setIsPlaying(false);
  }, []);

  // Frame-by-frame loop driven by requestAnimationFrame.
  const playbackLoop = React.useCallback(
    (timestamp: number) => {
      if (!requestRafRef.current) {
        stopPlayback("requestAnimationFrame unavailable. Playback stopped.");
        return;
      }
      const last = lastTimestampRef.current ?? timestamp;
      const dt = Math.max(0, (timestamp - last) / 1000);
      lastTimestampRef.current = timestamp;
      const frameResult = step(dt || 0);
      if (frameResult) {
        setStatus(`Playing epoch ${frameResult.epoch}`);
      }
      rafHandleRef.current = requestRafRef.current(playbackLoop);
    },
    [step, stopPlayback],
  );

  // Toggle playback by wiring up requestAnimationFrame on demand.
  const handleTogglePlay = React.useCallback(() => {
    if (isPlaying) {
      stopPlayback("Playback paused");
      return;
    }
    if (!ready) {
      setStatus("Create the orchestrator before playing.");
      return;
    }
    if (!registered) {
      setStatus("Register controllers before starting playback.");
      return;
    }

    const globalObj: typeof globalThis & {
      requestAnimationFrame?: (cb: FrameRequestCallback) => number;
      cancelAnimationFrame?: (handle: number) => void;
    } = typeof window !== "undefined" ? window : globalThis;

    const request = globalObj.requestAnimationFrame?.bind(globalObj) ?? null;
    const cancel = globalObj.cancelAnimationFrame?.bind(globalObj) ?? null;

    if (!request || !cancel) {
      setStatus("requestAnimationFrame is unavailable in this environment.");
      return;
    }

    requestRafRef.current = request;
    cancelRafRef.current = cancel;
    lastTimestampRef.current = null;
    setIsPlaying(true);
    setStatus("Playback started");
    rafHandleRef.current = request(playbackLoop);
  }, [isPlaying, ready, registered, playbackLoop, stopPlayback]);

  // Register demo controllers (graphs + animations) and seed constants.
  const handleRegister = React.useCallback(async () => {
    if (registered) {
      setStatus("Controllers already registered.");
      return;
    }
    try {
      await createOrchestrator();

      const multiplyGraphId = registerGraph(MULTIPLY_GRAPH_SPEC);
      const powerGraphId = registerGraph(POWER_GRAPH_SPEC);
      const rampUpAnimId = registerAnimation(RAMP_UP_ANIMATION_CONFIG);
      const rampDownAnimId = registerAnimation(RAMP_DOWN_ANIMATION_CONFIG);

      setInput(DEMO_PATHS.constants.ten, makeFloatValue(10));

      setControllerIds({
        multiplyGraph: multiplyGraphId,
        powerGraph: powerGraphId,
        rampUp: rampUpAnimId,
        rampDown: rampDownAnimId,
      });
      setRegistered(true);
      setStatus("Animations and graphs registered. Press Play to begin.");
    } catch (err) {
      setRegistered(false);
      setStatus(`Registration failed: ${(err as Error).message}`);
    }
  }, [
    registered,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    setInput,
  ]);

  // Step the orchestrator by a fixed dt when the user requests it.
  const handleStep = React.useCallback(() => {
    try {
      const result = step(1 / 60);
      if (result) {
        setStatus(`Stepped epoch ${result.epoch}`);
      } else {
        setStatus("No orchestrator instance yet. Make sure it's created.");
      }
    } catch (err) {
      setStatus(`Step failed: ${(err as Error).message}`);
    }
  }, [step]);

  React.useEffect(() => {
    if (!registered) {
      stopPlayback();
    }
  }, [registered, stopPlayback]);

  React.useEffect(() => {
    if (ready && !registered && status == null) {
      setStatus("Ready. Register controllers to prepare playback.");
    }
  }, [ready, registered, status]);

  React.useEffect(() => {
    if (!frame || frame.merged_writes.length === 0) {
      return;
    }
    const firstPath = frame.merged_writes[0]?.path;
    if (firstPath && firstPath !== focusPath) {
      setFocusPath(firstPath);
    }
  }, [frame, focusPath]);

  React.useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Provide render-friendly fallbacks when the orchestrator has not recorded
  // a frame yet. This keeps the UI simple while the runtime spins up.
  const mergedWrites = (frame?.merged_writes ?? []) as FrameWrites;
  const timings = (frame?.timings_ms ?? {}) as FrameTimings;

  return {
    state: {
      ready,
      registered,
      status,
      focusPath,
      isPlaying,
      controllerIds,
      frame,
      mergedWrites,
      timings,
      values: {
        rampUp: rampUpValue,
        rampDown: rampDownValue,
        product: productValue,
        power: powerValue,
      },
      focusedValue,
    },
    actions: {
      registerControllers: handleRegister,
      togglePlayback: handleTogglePlay,
      stepOnce: handleStep,
    },
  };
}
