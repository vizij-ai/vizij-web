import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FunctionCall,
  FunctionDeclaration,
  FunctionResponse,
} from "@google/genai";
import { Type, type Tool } from "@google/genai";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";
import { resolveExpression } from "../utils/emotions";
import { useGazeTarget } from "./useGazeTarget";
import { useShowExpression } from "./useExpressions";

type AgentFaceToolsOptions = {
  enabled: boolean;
  /** The face standard's expression names: `express_emotion`'s options. */
  expressions: string[];
  allowEmotionTools?: boolean;
};

export type AgentFaceTools = {
  tools: Tool[];
  handleFunctionCalls: (
    functionCalls: FunctionCall[],
  ) => Promise<FunctionResponse[]>;
  /** Whether a `set_gaze` holds the eyes. */
  gazeActive: boolean;
};

type GazeArgs = {
  x?: number;
  y?: number;
  holdSeconds?: number;
  durationSeconds?: number;
  blink?: number;
};

type EmotionArgs = {
  emotion?: string;
  name?: string;
  percent?: number;
  percentage?: number;
  intensity?: number;
  lengthSeconds?: number;
  holdSeconds?: number;
};

/** The weight a 100 % emotion peaks at. */
const EMOTION_PEAK = 0.7;
const EMOTION_ATTACK_SECONDS = 0.25;
const GAZE_RELEASE_SECONDS = 0.4;
const BLINK = "standard/vizij/blink";

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
    },
    required: ["x", "y"],
  },
};

function buildEmotionDeclaration(options: string[]): FunctionDeclaration {
  return {
    name: "express_emotion",
    description:
      "Blend in a facial emotion. Call this to react dramatically to what the user says.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        emotion: {
          type: Type.STRING,
          description: `Name of the emotion to show. Options: ${options.join(", ")}`,
          enum: options,
        },
        percent: {
          type: Type.NUMBER,
          description:
            "How strongly to feel the emotion as a percentage. You can use 0..100 or 0..1.",
        },
        intensity: {
          type: Type.NUMBER,
          description: "Legacy alias for percent.",
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
  return numeric <= 1 ? clamp(numeric, 0, 1) : clamp(numeric / 100, 0, 1);
}

/**
 * The agent's tools over the face standard. `set_gaze` steers the gaze
 * target and hands the eyes back to the face after `holdSeconds`;
 * `express_emotion` peaks an expression's weight and lets it ease back.
 */
export function useAgentFaceTools({
  enabled,
  expressions,
  allowEmotionTools = true,
}: AgentFaceToolsOptions): AgentFaceTools {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  const gaze = useGazeTarget();
  const { show } = useShowExpression();
  const [gazeActive, setGazeActive] = useState(false);
  const gazeTimeoutRef = useRef<number | null>(null);
  const hasEmotionTool = allowEmotionTools && expressions.length > 0;

  const tools = useMemo<Tool[]>(
    () => [
      {
        functionDeclarations: hasEmotionTool
          ? [GAZE_DECLARATION, buildEmotionDeclaration(expressions)]
          : [GAZE_DECLARATION],
      },
    ],
    [expressions, hasEmotionTool],
  );

  const blink = useCallback(
    (strength: number, seconds: number) => {
      if (!runtime) return;
      const key = runtime.path(BLINK);
      void animateValue(key, strength, {
        duration: seconds,
        easing: "easeIn",
      }).then(() =>
        animateValue(key, 0, { duration: 0.12, easing: "easeOut" }),
      );
    },
    [animateValue, runtime],
  );

  const applyGaze = useCallback(
    async (rawArgs: GazeArgs) => {
      if (!enabled) throw new Error("Face not ready yet.");
      const x = clamp(toNumber(rawArgs.x, 0), -1, 1);
      const y = clamp(toNumber(rawArgs.y, 0), -1, 1);
      const duration = clamp(
        toNumber(rawArgs.durationSeconds, 0.22),
        0.05,
        2.5,
      );
      const holdSeconds = clamp(toNumber(rawArgs.holdSeconds, 1.6), 0.2, 8);
      const blinkStrength = clamp(toNumber(rawArgs.blink, 0), 0, 1);

      setGazeActive(true);
      if (gazeTimeoutRef.current) window.clearTimeout(gazeTimeoutRef.current);
      if (blinkStrength > 0.01) blink(blinkStrength, Math.min(duration, 0.2));
      await gaze.look(x, y, duration);
      gazeTimeoutRef.current = window.setTimeout(() => {
        void gaze.release(GAZE_RELEASE_SECONDS);
        setGazeActive(false);
      }, holdSeconds * 1000);

      return { x, y, holdSeconds, blink: blinkStrength };
    },
    [blink, enabled, gaze],
  );

  const applyEmotion = useCallback(
    async (rawArgs: EmotionArgs) => {
      if (!enabled) throw new Error("Face not ready yet.");
      const requested = rawArgs.emotion ?? rawArgs.name ?? "";
      const expression = resolveExpression(requested, expressions);
      if (!expression) {
        throw new Error(`No matching expression for "${requested}".`);
      }
      const percent = normalizePercent(
        rawArgs.percent ?? rawArgs.percentage ?? rawArgs.intensity ?? 100,
      );
      const lengthSeconds = clamp(
        toNumber(rawArgs.lengthSeconds ?? rawArgs.holdSeconds ?? 2, 2),
        0.2,
        8,
      );
      const peak = percent * EMOTION_PEAK;
      await show(expression, {
        peak,
        attackSeconds: EMOTION_ATTACK_SECONDS,
        releaseSeconds: lengthSeconds,
      });
      return {
        emotion: expression,
        peakWeight: peak,
        percent,
        lengthSeconds,
        attackSeconds: EMOTION_ATTACK_SECONDS,
      };
    },
    [enabled, expressions, show],
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
          } else if (call.name === "express_emotion" && hasEmotionTool) {
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
    [applyEmotion, applyGaze, hasEmotionTool],
  );

  useEffect(
    () => () => {
      if (gazeTimeoutRef.current) window.clearTimeout(gazeTimeoutRef.current);
    },
    [],
  );

  return { tools, handleFunctionCalls, gazeActive };
}
