import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FunctionCall,
  FunctionDeclaration,
  FunctionResponse,
  Type,
  type Tool,
} from "@google/genai";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { PoseHotkeyBinding } from "./usePoseHotkeys";
import {
  canonicalEmotionName,
  isEmotionBinding,
  scoreEmotionBinding,
} from "../utils/emotions";

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
  intensity?: number;
  holdSeconds?: number;
  durationSeconds?: number;
};

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
        intensity: {
          type: Type.NUMBER,
          description: "Strength of the expression (0..1). Defaults to 1.",
        },
        holdSeconds: {
          type: Type.NUMBER,
          description:
            "How long to keep the emotion before easing out (seconds). Defaults to 2.",
        },
        durationSeconds: {
          type: Type.NUMBER,
          description: "How quickly to blend the expression on (seconds).",
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

export function useAgentFaceTools({
  enabled,
  bindings,
}: AgentFaceToolsOptions): AgentFaceTools {
  const { animateValue, faceId: runtimeFaceId } = useVizijRuntime();
  const faceId = (runtimeFaceId ?? "face").toLowerCase();
  const [gazeActive, setGazeActive] = useState(false);
  const gazeTimeoutRef = useRef<number | null>(null);
  const emotionTimeoutsRef = useRef<number[]>([]);

  const gazePaths = useMemo(() => {
    const prefix = `rig/${faceId}/`;
    return {
      leftX: `${prefix}standard/left_eye/pos/x`,
      leftY: `${prefix}standard/left_eye/pos/y`,
      rightX: `${prefix}standard/right_eye/pos/x`,
      rightY: `${prefix}standard/right_eye/pos/y`,
      blink: `${prefix}blink`,
      eyelids: {
        leftUpper: `${prefix}standard/left_eye_top_eyelid/pos/y`,
        rightUpper: `${prefix}standard/right_eye_top_eyelid/pos/y`,
      },
    };
  }, [faceId]);

  const emotionBindings = useMemo(
    () => bindings.filter((binding) => isEmotionBinding(binding)),
    [bindings],
  );
  const hasEmotionBindings = emotionBindings.length > 0;

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

  const resetGaze = useCallback(() => {
    void animateValue(gazePaths.leftX, { float: 0 }, { duration: 0.2 });
    void animateValue(gazePaths.rightX, { float: 0 }, { duration: 0.2 });
    void animateValue(gazePaths.leftY, { float: 0 }, { duration: 0.2 });
    void animateValue(gazePaths.rightY, { float: 0 }, { duration: 0.2 });
    setGazeActive(false);
  }, [animateValue, gazePaths]);

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

      await Promise.all([
        animateValue(
          gazePaths.leftX,
          { float: clamp(x - offset, -1, 1) },
          { duration, easing: "easeInOut" },
        ),
        animateValue(
          gazePaths.rightX,
          { float: clamp(x + offset, -1, 1) },
          { duration, easing: "easeInOut" },
        ),
        animateValue(
          gazePaths.leftY,
          { float: y },
          { duration, easing: "easeInOut" },
        ),
        animateValue(
          gazePaths.rightY,
          { float: y },
          { duration, easing: "easeInOut" },
        ),
      ]);

      if (blink > 0.01) {
        const closeDuration = Math.min(duration, 0.2);
        void animateValue(
          gazePaths.blink,
          { float: blink },
          { duration: closeDuration, easing: "easeIn" },
        );
        void animateValue(
          gazePaths.eyelids.leftUpper,
          { float: blink },
          { duration: closeDuration, easing: "easeIn" },
        );
        void animateValue(
          gazePaths.eyelids.rightUpper,
          { float: blink },
          { duration: closeDuration, easing: "easeIn" },
        );
        window.setTimeout(() => {
          void animateValue(
            gazePaths.blink,
            { float: 0 },
            { duration: 0.12, easing: "easeOut" },
          );
          void animateValue(
            gazePaths.eyelids.leftUpper,
            { float: 0 },
            { duration: 0.12, easing: "easeOut" },
          );
          void animateValue(
            gazePaths.eyelids.rightUpper,
            { float: 0 },
            { duration: 0.12, easing: "easeOut" },
          );
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
    [animateValue, enabled, gazePaths, resetGaze],
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

      const intensity = clamp(toNumber(rawArgs.intensity ?? 1, 1), 0, 1);
      const holdSeconds = clamp(toNumber(rawArgs.holdSeconds ?? 2, 2), 0.2, 8);
      const duration = clamp(
        toNumber(rawArgs.durationSeconds ?? 0.22, 0.22),
        0.05,
        1.5,
      );

      await animateValue(
        binding.weightPath,
        { float: intensity },
        { duration, easing: "easeOut" },
      );

      const timer = window.setTimeout(() => {
        void animateValue(
          binding.weightPath,
          { float: 0 },
          { duration: Math.max(duration, 0.28), easing: "easeInOut" },
        );
      }, holdSeconds * 1000);
      emotionTimeoutsRef.current.push(timer);

      return {
        emotion: canonical,
        poseId: binding.pose.id,
        displayName: binding.pose.name ?? binding.pose.id,
        intensity,
        holdSeconds,
      };
    },
    [animateValue, enabled, resolveEmotionBinding, availableEmotionOptions],
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
    return () => {
      if (gazeTimeoutRef.current) {
        window.clearTimeout(gazeTimeoutRef.current);
      }
      emotionTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      emotionTimeoutsRef.current = [];
    };
  }, []);

  return { tools, handleFunctionCalls, gazeActive };
}
