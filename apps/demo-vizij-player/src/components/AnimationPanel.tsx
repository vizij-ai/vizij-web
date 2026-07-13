import { useEffect, useMemo, useState } from "react";
import {
  useVizijRuntime,
  type AnimationPlaybackState,
} from "@vizij/runtime-react";
import { useAppState } from "../state/AppStateContext";
import { IconButton } from "./IconButton";
import { RuntimeApiDisclosure } from "./RuntimeApiDisclosure";

function useAnimationSnapshots(animationIds: string[]) {
  const { getAnimationState } = useVizijRuntime();
  const [snapshots, setSnapshots] = useState<
    Record<string, AnimationPlaybackState | null>
  >({});
  const animationIdsKey = animationIds.join("|");

  useEffect(() => {
    if (animationIds.length === 0) {
      // Bail if already empty: `assetBundle.animations` is rebuilt every render,
      // so `animationIds` is a fresh reference each time and this effect re-runs
      // on every render. Setting a new `{}` here would then loop forever
      // ("Maximum update depth"); returning `prev` unchanged lets React bail.
      setSnapshots((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let frameId = 0;
    const tick = () => {
      setSnapshots(
        Object.fromEntries(
          animationIds.map((id) => [id, getAnimationState(id)]),
        ),
      );
      frameId = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(frameId);
    // Keyed by `animationIdsKey` (stable by value), not `animationIds`
    // (unstable identity) — otherwise the rAF loop is restarted every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationIdsKey, getAnimationState]);

  return snapshots;
}

export function AnimationPanel() {
  const {
    assetBundle,
    playAnimation,
    pauseAnimation,
    stopAnimation,
    seekAnimation,
    setAnimationLoop,
  } = useVizijRuntime();
  const {
    state: {
      playbackSelection: { animationId },
    },
    setSelectedAnimation,
  } = useAppState();

  const animations = useMemo(
    () => assetBundle.animations ?? [],
    [assetBundle.animations],
  );
  const animationIds = useMemo(
    () => animations.map((animation) => animation.id),
    [animations],
  );
  const animationIdsKey = animationIds.join("|");
  const snapshots = useAnimationSnapshots(animationIds);

  useEffect(() => {
    if (!animations.length) {
      setSelectedAnimation(null);
      return;
    }
    if (
      !animationId ||
      !animations.some((animation) => animation.id === animationId)
    ) {
      setSelectedAnimation(animations[0]!.id);
    }
  }, [animationId, animationIdsKey, animations, setSelectedAnimation]);

  const selectedAnimation =
    animations.find((animation) => animation.id === animationId) ??
    animations[0] ??
    null;
  const selectedState = selectedAnimation
    ? snapshots[selectedAnimation.id]
    : null;
  const runtimeExamples = useMemo(() => {
    if (!selectedAnimation) {
      return [];
    }

    const duration =
      selectedAnimation.clip.duration ?? selectedState?.duration ?? 0;
    const seekTime = Number(
      Math.min(duration, Math.max(0.25, duration * 0.35)).toFixed(2),
    );

    return [
      {
        label: selectedAnimation.clip.name ?? selectedAnimation.id,
        code: [
          `await playAnimation(${JSON.stringify(selectedAnimation.id)}, { reset: true });`,
          `pauseAnimation(${JSON.stringify(selectedAnimation.id)});`,
          `seekAnimation(${JSON.stringify(selectedAnimation.id)}, ${seekTime});`,
          `setAnimationLoop(${JSON.stringify(selectedAnimation.id)}, ${String(
            !(selectedState?.loop ?? true),
          )});`,
          `stopAnimation(${JSON.stringify(selectedAnimation.id)}, { clearOutputs: true });`,
        ].join("\n"),
      },
    ];
  }, [selectedAnimation, selectedState?.duration, selectedState?.loop]);

  return (
    <section className="panel" aria-labelledby="animation-panel-title">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Embedded clips</p>
          <h2 id="animation-panel-title">Animations</h2>
        </div>
      </header>
      <div className="panel-body">
        {animations.length === 0 ? (
          <div className="panel-empty">
            This bundle does not include embedded clips.
          </div>
        ) : (
          <>
            <div className="list-stack">
              {animations.map((animation) => {
                const state = snapshots[animation.id];
                return (
                  <button
                    key={animation.id}
                    type="button"
                    className={`select-row ${animation.id === selectedAnimation?.id ? "is-active" : ""}`}
                    onClick={() => setSelectedAnimation(animation.id)}
                  >
                    <span>
                      <strong>{animation.clip.name ?? animation.id}</strong>
                      <small>{animation.id}</small>
                    </span>
                    <span>{state?.playing ? "Playing" : "Idle"}</span>
                  </button>
                );
              })}
            </div>

            {selectedAnimation ? (
              <div className="transport-card">
                <div className="transport-header">
                  <div>
                    <strong>
                      {selectedAnimation.clip.name ?? selectedAnimation.id}
                    </strong>
                    <small>
                      {selectedAnimation.clip.tracks?.length ?? 0} tracks
                    </small>
                  </div>
                  <span className="soft-badge">
                    {(
                      selectedState?.duration ??
                      selectedAnimation.clip.duration ??
                      0
                    ).toFixed(2)}
                    s
                  </span>
                </div>
                <div className="transport-actions">
                  <IconButton
                    icon="play"
                    label={`Play ${selectedAnimation.clip.name ?? selectedAnimation.id}`}
                    onClick={() =>
                      void playAnimation(selectedAnimation.id, { reset: true })
                    }
                  />
                  <IconButton
                    icon="pause"
                    label={`Pause ${selectedAnimation.clip.name ?? selectedAnimation.id}`}
                    onClick={() => pauseAnimation(selectedAnimation.id)}
                  />
                  <IconButton
                    icon="stop"
                    label={`Stop ${selectedAnimation.clip.name ?? selectedAnimation.id}`}
                    onClick={() =>
                      stopAnimation(selectedAnimation.id, {
                        clearOutputs: true,
                      })
                    }
                  />
                  <IconButton
                    icon="loop"
                    label={`${(selectedState?.loop ?? true) ? "Disable" : "Enable"} loop for ${selectedAnimation.clip.name ?? selectedAnimation.id}`}
                    active={selectedState?.loop ?? true}
                    onClick={() =>
                      setAnimationLoop(
                        selectedAnimation.id,
                        !(selectedState?.loop ?? true),
                      )
                    }
                  />
                  <span className="transport-meta">
                    Loop {(selectedState?.loop ?? true) ? "On" : "Off"}
                  </span>
                </div>
                <label className="range-field">
                  <span>Seek</span>
                  <input
                    type="range"
                    min={0}
                    max={
                      selectedState?.duration ??
                      selectedAnimation.clip.duration ??
                      1
                    }
                    step={0.01}
                    value={selectedState?.time ?? 0}
                    onChange={(event) =>
                      seekAnimation(
                        selectedAnimation.id,
                        Number(event.target.value),
                      )
                    }
                  />
                  <output>{(selectedState?.time ?? 0).toFixed(2)}s</output>
                </label>
              </div>
            ) : null}
            <RuntimeApiDisclosure
              title="Runtime clip calls"
              description="The clip transport maps directly to runtime-react animation calls on the selected embedded clip."
              examples={runtimeExamples}
            />
          </>
        )}
      </div>
    </section>
  );
}
