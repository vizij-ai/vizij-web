import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FunctionCall,
  FunctionDeclaration,
  FunctionResponse,
} from "@google/genai";
import { Type, type Tool } from "@google/genai";
import {
  mapNormalizedControlValue,
  mapUnitControlValue,
  resolveFaceControls,
  useVizijRuntime,
} from "@vizij/runtime-react";
import {
  canonicalEmotionName,
  isEmotionBinding,
  scoreEmotionBinding,
} from "../utils/emotions";
import type { PoseHotkeyBinding } from "./usePoseHotkeys";

type AgentFaceToolsOptions = {
  enabled: boolean;
  bindings: PoseHotkeyBinding[];
};

export type AgentFaceTools = {
  tools: Tool[];
  handleFunctionCalls: (
    functionCalls: FunctionCall[],
  ) => Promise<FunctionResponse[]>;
  gazeActive: boolean;
};

type GazeArgs = {
  x?: number;
  y?: number;
  holdSeconds?: number;
  durationSeconds?: number;
  blink?: number;
  offset?: number;
};

type EmotionArgs = {
  emotion?: string;
  name?: string;
  percent?: number;
  percentage?: number;
  intensity?: number;
  lengthSeconds?: number;
  holdSeconds?: number;
  durationSeconds?: number;
};

const DEFAULT_POSE_WEIGHT = 0.7;
const DEFAULT_NEUTRAL_WEIGHT = 0.7;
const EMOTION_ATTACK_SECONDS = 0.25;

const GAZE_DECLARATION: FunctionDeclaration = {
  name: "set_gaze",
  description:
    "Aim the avatar's eyes. Use small values (-1..1) to look left/right/up/down and optional blink for emphasis.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      x: {
        type: Type.NUMBER,
        description:
          "Horizontal gaze direction. -1 = hard left, 0 = center, 1 = hard right.",
      },
      y: {
        type: Type.NUMBER,
        description: "Vertical gaze direction. -1 = down, 0 = level, 1 = up.",
      },
      holdSeconds: {
        type: Type.NUMBER,
        description: "How long to hold the gaze before relaxing (seconds).",
      },
      durationSeconds: {
        type: Type.NUMBER,
        description: "How fast to move the eyes (seconds).",
      },
      blink: {
        type: Type.NUMBER,
        description: "Optional blink strength 0..1 to pair with the gaze.",
      },
      offset: {
        type: Type.NUMBER,
        description: "Tiny cross-eye offset (-0.3..0.3) to keep gaze lively.",
      },
    },
    required: ["x", "y"],
  },
};

function buildEmotionDeclaration(options: string[]): FunctionDeclaration {
  const emotionProperty: Record<string, unknown> = {
    type: Type.STRING,
    description:
      "Name of the emotion/pose to show. Prefer the provided options when possible.",
  };
  if (options.length > 0) {
    emotionProperty.enum = options;
    emotionProperty.description = `${emotionProperty.description} Options: ${options.join(", ")}`;
  }
  return {
    name: "express_emotion",
    description:
      "Blend in a facial emotion. Call this to react dramatically to what the user says.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: emotionProperty,
        percent: {
          type: Type.NUMBER,
          description:
            "How strongly to feel the emotion as a percentage. You can use 0..100 or 0..1. The app normalizes this to its 0.7 pose cap.",
        },
        intensity: {
          type: Type.NUMBER,
          description:
            "Legacy alias for percent. You can pass 0..100 or 0..1; the app normalizes it to its 0.7 pose cap.",
        },
        lengthSeconds: {
          type: Type.NUMBER,
          description:
            "How long the emotion should ease back to neutral after it peaks. Defaults to 2 seconds.",
        },
        holdSeconds: {
          type: Type.NUMBER,
          description: "Legacy alias for lengthSeconds.",
        },
      },
      required: ["emotion"],
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePercent(value: unknown, fallback = 100) {
  const numeric = toNumber(value, fallback);
  if (numeric <= 1) {
    return clamp(numeric, 0, 1);
  }
  return clamp(numeric / 100, 0, 1);
}

export function useAgentFaceTools({
  enabled,
  bindings,
}: AgentFaceToolsOptions): AgentFaceTools {
  const {
    animateValue,
    faceId: runtimeFaceId,
    assetBundle,
    inputConstraints,
  } = useVizijRuntime();
  const [gazeActive, setGazeActive] = useState(false);
  const gazeTimeoutRef = useRef<number | null>(null);
  const emotionTimeoutsRef = useRef<number[]>([]);
  const gazeControls = useMemo(
    () => resolveFaceControls(assetBundle, runtimeFaceId, inputConstraints),
    [assetBundle, inputConstraints, runtimeFaceId],
  );

  const emotionBindings = useMemo(
    () => bindings.filter((binding) => isEmotionBinding(binding)),
    [bindings],
  );
  const hasEmotionBindings = emotionBindings.length > 0;
  const neutralBinding = useMemo(
    () =>
      emotionBindings.find(
        (binding) =>
          canonicalEmotionName(binding.semanticKey ?? "") === "neutral",
      ) ?? null,
    [emotionBindings],
  );

  const availableEmotionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          emotionBindings
            .map((binding) => binding.pose.name ?? binding.pose.id ?? "emotion")
            .filter(Boolean),
        ),
      ),
    [emotionBindings],
  );

  const toolDeclarations = useMemo<FunctionDeclaration[]>(() => {
    const declarations = [GAZE_DECLARATION];
    if (hasEmotionBindings) {
      declarations.push(buildEmotionDeclaration(availableEmotionOptions));
    }
    return declarations;
  }, [availableEmotionOptions, hasEmotionBindings]);

  const tools = useMemo<Tool[]>(
    () => [{ functionDeclarations: toolDeclarations }],
    [toolDeclarations],
  );

  const animateSigned = useCallback(
    (
      control: (typeof gazeControls.eyes)[keyof typeof gazeControls.eyes],
      value: number,
      duration: number,
      easing: "linear" | "easeIn" | "easeOut" | "easeInOut",
    ) => {
      if (!control) {
        return;
      }
      void animateValue(
        control.path,
        { float: mapNormalizedControlValue(control, value) },
        { duration, easing },
      );
    },
    [animateValue, gazeControls.eyes],
  );

  const animateUnit = useCallback(
    (
      control:
        | (typeof gazeControls.eyelids)[keyof typeof gazeControls.eyelids]
        | typeof gazeControls.blink,
      value: number,
      duration: number,
      easing: "linear" | "easeIn" | "easeOut" | "easeInOut",
    ) => {
      if (!control) {
        return;
      }
      void animateValue(
        control.path,
        { float: mapUnitControlValue(control, value) },
        { duration, easing },
      );
    },
    [animateValue, gazeControls.blink, gazeControls.eyelids],
  );

  const resetGaze = useCallback(() => {
    animateSigned(gazeControls.eyes.leftX, 0, 0.2, "easeInOut");
    animateSigned(gazeControls.eyes.rightX, 0, 0.2, "easeInOut");
    animateSigned(gazeControls.eyes.leftY, 0, 0.2, "easeInOut");
    animateSigned(gazeControls.eyes.rightY, 0, 0.2, "easeInOut");
    setGazeActive(false);
  }, [animateSigned, gazeControls.eyes]);

  const applyGaze = useCallback(
    async (rawArgs: GazeArgs) => {
      if (!enabled) throw new Error("Face rig not ready yet.");

      const x = clamp(toNumber(rawArgs.x, 0), -1, 1);
      const y = clamp(toNumber(rawArgs.y, 0), -1, 1);
      const offset = clamp(toNumber(rawArgs.offset, 0.08), -0.35, 0.35);
      const duration = clamp(
        toNumber(rawArgs.durationSeconds, 0.22),
        0.05,
        2.5,
      );
      const holdSeconds = clamp(toNumber(rawArgs.holdSeconds, 1.6), 0.2, 8);
      const blink = clamp(toNumber(rawArgs.blink, 0), 0, 1);

      setGazeActive(true);
      if (gazeTimeoutRef.current) {
        window.clearTimeout(gazeTimeoutRef.current);
      }

      animateSigned(
        gazeControls.eyes.leftX,
        clamp(x - offset, -1, 1),
        duration,
        "easeInOut",
      );
      animateSigned(
        gazeControls.eyes.rightX,
        clamp(x + offset, -1, 1),
        duration,
        "easeInOut",
      );
      animateSigned(gazeControls.eyes.leftY, y, duration, "easeInOut");
      animateSigned(gazeControls.eyes.rightY, y, duration, "easeInOut");

      if (blink > 0.01) {
        const closeDuration = Math.min(duration, 0.2);
        animateUnit(gazeControls.blink, blink, closeDuration, "easeIn");
        animateUnit(
          gazeControls.eyelids.leftUpper,
          blink,
          closeDuration,
          "easeIn",
        );
        animateUnit(
          gazeControls.eyelids.rightUpper,
          blink,
          closeDuration,
          "easeIn",
        );
        window.setTimeout(() => {
          animateUnit(gazeControls.blink, 0, 0.12, "easeOut");
          animateUnit(gazeControls.eyelids.leftUpper, 0, 0.12, "easeOut");
          animateUnit(gazeControls.eyelids.rightUpper, 0, 0.12, "easeOut");
        }, 120);
      }

      gazeTimeoutRef.current = window.setTimeout(() => {
        resetGaze();
      }, holdSeconds * 1000);

      return {
        x,
        y,
        holdSeconds,
        blink,
      };
    },
    [animateSigned, animateUnit, enabled, gazeControls, resetGaze],
  );

  const resolveEmotionBinding = useCallback(
    (
      raw: string | undefined,
    ): { binding: PoseHotkeyBinding; canonical: string } | null => {
      const canonical = canonicalEmotionName(raw ?? "");
      if (!canonical) return null;

      let best: PoseHotkeyBinding | null = null;
      let bestScore = 0;

      emotionBindings.forEach((binding) => {
        const score = scoreEmotionBinding(binding, canonical);
        if (score > bestScore) {
          best = binding;
          bestScore = score;
        }
      });

      return best ? { binding: best, canonical } : null;
    },
    [emotionBindings],
  );

  const clearEmotionTimers = useCallback(() => {
    emotionTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    emotionTimeoutsRef.current = [];
  }, []);

  const resetNonNeutralEmotions = useCallback(
    (activeBinding: PoseHotkeyBinding | null, duration: number) => {
      const clampedDuration = clamp(duration, 0.05, 2);
      emotionBindings.forEach((binding) => {
        if (binding === neutralBinding || binding === activeBinding) return;
        void animateValue(
          binding.weightPath,
          { float: 0 },
          { duration: clampedDuration, easing: "easeInOut" },
        );
      });
    },
    [animateValue, emotionBindings, neutralBinding],
  );

  const applyEmotion = useCallback(
    async (rawArgs: EmotionArgs) => {
      if (!enabled) throw new Error("Face rig not ready yet.");
      const emotionArg =
        rawArgs.emotion ?? rawArgs.name ?? availableEmotionOptions[0];
      const resolved = resolveEmotionBinding(emotionArg);
      if (!resolved) {
        throw new Error(
          `No matching emotion pose for "${emotionArg ?? "unknown"}".`,
        );
      }
      const { binding, canonical } = resolved;

      clearEmotionTimers();
      resetNonNeutralEmotions(binding, 0.12);

      const requestedPercent = normalizePercent(
        rawArgs.percent ?? rawArgs.percentage ?? rawArgs.intensity ?? 100,
      );
      const peakWeight = requestedPercent * DEFAULT_POSE_WEIGHT;
      const lengthSeconds = clamp(
        toNumber(rawArgs.lengthSeconds ?? rawArgs.holdSeconds ?? 2, 2),
        0.2,
        8,
      );

      await Promise.all([
        animateValue(
          binding.weightPath,
          { float: peakWeight },
          { duration: EMOTION_ATTACK_SECONDS, easing: "easeOut" },
        ),
        neutralBinding && neutralBinding !== binding
          ? animateValue(
              neutralBinding.weightPath,
              { float: 0 },
              { duration: EMOTION_ATTACK_SECONDS, easing: "easeInOut" },
            )
          : Promise.resolve(),
      ]);

      const decayTimer = window.setTimeout(() => {
        void animateValue(
          binding.weightPath,
          { float: 0 },
          { duration: lengthSeconds, easing: "easeInOut" },
        );
        if (neutralBinding && neutralBinding !== binding) {
          void animateValue(
            neutralBinding.weightPath,
            { float: DEFAULT_NEUTRAL_WEIGHT },
            { duration: lengthSeconds, easing: "easeInOut" },
          );
        }
      }, EMOTION_ATTACK_SECONDS * 1000);
      emotionTimeoutsRef.current.push(decayTimer);

      return {
        emotion: canonical,
        poseId: binding.pose.id,
        displayName: binding.pose.name ?? binding.pose.id,
        peakWeight,
        percent: requestedPercent,
        lengthSeconds,
        attackSeconds: EMOTION_ATTACK_SECONDS,
        neutralPoseId: neutralBinding?.pose.id ?? null,
      };
    },
    [
      animateValue,
      availableEmotionOptions,
      clearEmotionTimers,
      enabled,
      neutralBinding,
      resetNonNeutralEmotions,
      resolveEmotionBinding,
    ],
  );

  const handleFunctionCalls = useCallback(
    async (functionCalls: FunctionCall[]) => {
      const responses: FunctionResponse[] = [];

      for (const call of functionCalls) {
        if (!call.name) continue;
        try {
          if (call.name === "set_gaze") {
            const result = await applyGaze((call.args ?? {}) as GazeArgs);
            responses.push({ id: call.id, name: call.name, response: result });
          } else if (call.name === "express_emotion") {
            const result = await applyEmotion((call.args ?? {}) as EmotionArgs);
            responses.push({ id: call.id, name: call.name, response: result });
          } else {
            responses.push({
              id: call.id,
              name: call.name,
              response: { error: "Unknown function" },
            });
          }
        } catch (err) {
          responses.push({
            id: call.id,
            name: call.name,
            response: {
              error:
                err instanceof Error ? err.message : "Tool execution failed",
            },
          });
        }
      }

      return responses;
    },
    [applyEmotion, applyGaze],
  );

  useEffect(() => {
    if (!enabled || !neutralBinding?.weightPath) {
      return;
    }
    void animateValue(
      neutralBinding.weightPath,
      { float: DEFAULT_NEUTRAL_WEIGHT },
      { duration: 0.2, easing: "easeInOut" },
    );
  }, [animateValue, enabled, neutralBinding]);

  useEffect(() => {
    return () => {
      if (gazeTimeoutRef.current) {
        window.clearTimeout(gazeTimeoutRef.current);
      }
      clearEmotionTimers();
    };
  }, [clearEmotionTimers]);

  return { tools, handleFunctionCalls, gazeActive };
}
