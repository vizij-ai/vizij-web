import { useMemo, useCallback, useEffect, useRef } from "react";
import {
  EXPRESSIVE_EMOTION_POSE_KEYS,
  useVizijRuntime,
} from "@vizij/runtime-react";
import { usePoseHotkeys } from "../hooks/usePoseHotkeys";
import { isEmotionBinding } from "../utils/emotions";

const DEFAULT_POSE_WEIGHT = 0.75;

export function EmotionButtons() {
  const { ready, assetBundle, animateValue } = useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const { bindings, setPoseWeight } = usePoseHotkeys(poseConfig, ready);
  const timeoutRef = useRef<Map<string, number>>(new Map());

  const emotionBindings = useMemo(() => {
    const candidates = bindings.filter((binding) => isEmotionBinding(binding));
    const byKey = new Map(
      candidates
        .filter((binding) => binding.semanticKey)
        .map((binding) => [binding.semanticKey, binding] as const),
    );
    const expressive = EXPRESSIVE_EMOTION_POSE_KEYS.map((key) =>
      byKey.get(key),
    ).filter((binding): binding is (typeof candidates)[number] =>
      Boolean(binding),
    );
    if (expressive.length > 0) {
      return expressive;
    }
    return candidates.filter((binding) => binding.semanticKey !== "neutral");
  }, [bindings]);

  const trigger = useCallback(
    (bindingId: string) => {
      const binding = emotionBindings.find((b) => b.pose.id === bindingId);
      if (!binding) return;
      void animateValue(
        binding.weightPath,
        { float: DEFAULT_POSE_WEIGHT },
        { duration: 0.25 },
      );
      const existing = timeoutRef.current.get(bindingId);
      if (existing) {
        window.clearTimeout(existing);
      }
      const timeout = window.setTimeout(() => {
        setPoseWeight(binding, 0);
        timeoutRef.current.delete(bindingId);
      }, 1200);
      timeoutRef.current.set(bindingId, timeout);
    },
    [animateValue, emotionBindings, setPoseWeight],
  );

  useEffect(() => {
    return () => {
      timeoutRef.current.forEach((id) => window.clearTimeout(id));
      timeoutRef.current.clear();
    };
  }, []);

  if (!ready || emotionBindings.length === 0) {
    return null;
  }

  return (
    <div className="emotion-buttons">
      <p className="label">Emotions</p>
      <div className="emotion-grid">
        {emotionBindings.map((binding) => (
          <button
            key={binding.pose.id}
            type="button"
            onClick={() => trigger(binding.pose.id)}
          >
            {binding.pose.name ?? binding.pose.id}
          </button>
        ))}
      </div>
    </div>
  );
}
