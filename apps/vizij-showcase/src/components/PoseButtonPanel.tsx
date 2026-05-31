import { useMemo, useEffect, useCallback, useRef } from "react";
import { EXPRESSIVE_EMOTION_POSE_KEYS } from "@vizij/studio-support";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  POSE_HOTKEY_LAYOUT,
  usePoseHotkeys,
  type PoseHotkeyBinding,
} from "../hooks/usePoseHotkeys";
import {
  broadcastPoseTrigger,
  type PoseTriggerEventDetail,
} from "../lib/poseRigBroadcast";

const DEFAULT_POSE_WEIGHT = 0.75;

type PoseTimerEntry = {
  timeoutId: number;
  binding: PoseHotkeyBinding;
};

type PoseButtonPanelProps = {
  onTrigger?: (detail: PoseTriggerEventDetail) => void;
};

export function PoseButtonPanel({ onTrigger }: PoseButtonPanelProps) {
  const { ready, assetBundle } = useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const { bindings, setPoseWeight } = usePoseHotkeys(poseConfig, ready);
  const featuredBindings = useMemo(() => {
    const emotionsByKey = new Map(
      bindings
        .filter(
          (binding) =>
            binding.semanticKind === "emotion" && binding.semanticKey,
        )
        .map((binding) => [binding.semanticKey, binding] as const),
    );
    const ordered = EXPRESSIVE_EMOTION_POSE_KEYS.map((key) =>
      emotionsByKey.get(key),
    ).filter((binding): binding is PoseHotkeyBinding => Boolean(binding));
    if (ordered.length > 0) {
      return ordered;
    }
    return bindings.filter((binding) => binding.semanticKind === "emotion");
  }, [bindings]);
  const bindingHotkeys = useMemo(() => {
    return featuredBindings.map((binding, index) => ({
      binding,
      hotkey: POSE_HOTKEY_LAYOUT[index] ?? null,
    }));
  }, [featuredBindings]);
  const timersRef = useRef<Map<string, PoseTimerEntry>>(new Map());

  const emitTrigger = useCallback(
    (detail: PoseTriggerEventDetail) => {
      broadcastPoseTrigger(detail);
      onTrigger?.(detail);
    },
    [onTrigger],
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach(({ timeoutId, binding }) => {
        window.clearTimeout(timeoutId);
        setPoseWeight(binding, 0);
        emitTrigger({
          poseId: binding.pose.id,
          relativePath: binding.relativePath,
          semanticKey: binding.semanticKey,
          weight: 0,
        });
      });
      timersRef.current.clear();
    };
  }, [emitTrigger, setPoseWeight]);

  const clearBindingTimer = useCallback((poseId: string) => {
    const timers = timersRef.current;
    const existing = timers.get(poseId);
    if (!existing) {
      return null;
    }
    window.clearTimeout(existing.timeoutId);
    timers.delete(poseId);
    return existing.binding;
  }, []);

  const triggerPose = useCallback(
    (binding: PoseHotkeyBinding) => {
      if (!binding || !ready) {
        return;
      }
      const clearedBinding = clearBindingTimer(binding.pose.id);
      if (clearedBinding) {
        setPoseWeight(clearedBinding, 0);
        emitTrigger({
          poseId: clearedBinding.pose.id,
          relativePath: clearedBinding.relativePath,
          semanticKey: clearedBinding.semanticKey,
          weight: 0,
        });
      }
      setPoseWeight(binding, DEFAULT_POSE_WEIGHT);
      emitTrigger({
        poseId: binding.pose.id,
        relativePath: binding.relativePath,
        semanticKey: binding.semanticKey,
        weight: DEFAULT_POSE_WEIGHT,
      });
      const timeoutId = window.setTimeout(() => {
        setPoseWeight(binding, 0);
        emitTrigger({
          poseId: binding.pose.id,
          relativePath: binding.relativePath,
          semanticKey: binding.semanticKey,
          weight: 0,
        });
        timersRef.current.delete(binding.pose.id);
      }, 650);
      timersRef.current.set(binding.pose.id, { timeoutId, binding });
    },
    [clearBindingTimer, emitTrigger, ready, setPoseWeight],
  );

  useEffect(() => {
    if (!ready || bindingHotkeys.length === 0) {
      return;
    }

    const keyBindings = new Map<string, PoseHotkeyBinding>();
    bindingHotkeys.forEach(({ hotkey, binding }) => {
      if (hotkey) {
        keyBindings.set(hotkey.code, binding);
      }
    });
    if (keyBindings.size === 0) {
      return;
    }

    const activeKeys = new Set<string>();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const binding = keyBindings.get(event.code);
      if (!binding || activeKeys.has(event.code)) {
        return;
      }
      activeKeys.add(event.code);
      const clearedBinding = clearBindingTimer(binding.pose.id);
      if (clearedBinding) {
        setPoseWeight(clearedBinding, 0);
        emitTrigger({
          poseId: clearedBinding.pose.id,
          relativePath: clearedBinding.relativePath,
          semanticKey: clearedBinding.semanticKey,
          weight: 0,
        });
      }
      setPoseWeight(binding, DEFAULT_POSE_WEIGHT);
      emitTrigger({
        poseId: binding.pose.id,
        relativePath: binding.relativePath,
        semanticKey: binding.semanticKey,
        weight: DEFAULT_POSE_WEIGHT,
      });
    };

    const handleKeyUp = (event: globalThis.KeyboardEvent) => {
      const binding = keyBindings.get(event.code);
      if (!binding || !activeKeys.has(event.code)) {
        return;
      }
      activeKeys.delete(event.code);
      setPoseWeight(binding, 0);
      emitTrigger({
        poseId: binding.pose.id,
        relativePath: binding.relativePath,
        semanticKey: binding.semanticKey,
        weight: 0,
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keyBindings.forEach((binding) => {
        setPoseWeight(binding, 0);
        emitTrigger({
          poseId: binding.pose.id,
          relativePath: binding.relativePath,
          semanticKey: binding.semanticKey,
          weight: 0,
        });
      });
      activeKeys.clear();
    };
  }, [bindingHotkeys, clearBindingTimer, emitTrigger, ready, setPoseWeight]);

  if (featuredBindings.length === 0) {
    return (
      <div className="feature-card expression-panel">
        <p className="feature-card__eyebrow">Pose presets</p>
        <h3>Load a pose rig bundle to unlock presets.</h3>
        <p className="feature-card__description">
          The current GLB exposes pose metadata. Once loaded, the buttons here
          will trigger them instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="feature-card expression-panel">
      <p className="feature-card__eyebrow">Pose presets</p>
      <h3>Tap to emote.</h3>
      <p className="feature-card__description">
        Buttons map straight to Vizij pose weights. Hotkeys mirror each button
        so you can rehearse and perform live.
      </p>
      <div className="pose-grid">
        {bindingHotkeys.map(({ binding, hotkey }, index) => (
          <button
            key={binding.pose.id}
            type="button"
            className="pose-button"
            disabled={!ready}
            onClick={() => triggerPose(binding)}
          >
            <span>{binding.pose.name ?? `Pose ${index + 1}`}</span>
            {hotkey ? <kbd>{hotkey.label}</kbd> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
