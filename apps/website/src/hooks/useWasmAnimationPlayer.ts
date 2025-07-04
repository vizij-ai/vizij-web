import { useEffect, useRef, useState, useCallback } from "react";
import { useWasm } from "./useWasm";
import { MotionValue } from "motion";

export const useWasmAnimationPlayer = (
  motionValues: { name: string; motionValue: MotionValue }[],
) => {
  const wasm = useWasm(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [animationDuration, setAnimationDuration] = useState<number>(0);
  const [isLoadingAnimation, setIsLoadingAnimation] = useState(false);
  const animationFrameRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const lastFrameTimeRef = useRef<number>();
  const lastLoadedAnimationRef = useRef<string | null>(null);

  const loadAnimation = useCallback(
    (animation: any) => {
      if (!wasm.isLoaded || isLoadingAnimation) {
        return null;
      }

      const animationString = JSON.stringify(animation);
      const animationKey = `${animation.id}-${animation.duration}-${animation.tracks.length}`;

      // Prevent loading the same animation multiple times
      if (lastLoadedAnimationRef.current === animationKey) {
        return activePlayerId;
      }

      setIsLoadingAnimation(true);

      try {
        console.log("Loading animation:", animation);
        const animationId = wasm.loadAnimation(animationString);
        console.log("Loaded animation:", wasm.exportAnimation(animationId));
        const newPlayerId = wasm.createPlayer();
        setActivePlayerId(newPlayerId);
        wasm.addInstance(newPlayerId, animationId);

        // Don't auto-play here - let the play function handle it
        lastLoadedAnimationRef.current = animationKey;
        console.log("Animation loaded successfully");
        return newPlayerId;
      } catch (error) {
        console.error("Failed to load animation:", error);
        return null;
      } finally {
        setIsLoadingAnimation(false);
      }
    },
    [wasm, isLoadingAnimation, activePlayerId],
  );

  const runAnimationLoop = (timestamp: number) => {
    if (startTimeRef.current === undefined) {
      startTimeRef.current = timestamp;
      lastFrameTimeRef.current = timestamp;
    }

    const elapsedTime = timestamp - startTimeRef.current;
    const deltaSinceLastFrame = timestamp - (lastFrameTimeRef.current ?? timestamp);

    if (deltaSinceLastFrame >= 1000 / 60) {
      // 30fps
      lastFrameTimeRef.current = timestamp;
      const updatedValues = wasm.update(deltaSinceLastFrame / 1000);
      if (updatedValues && updatedValues.size > 0 && activePlayerId) {
        const instanceValues = updatedValues.get(activePlayerId); // Get the specific player's values

        if (instanceValues instanceof Map) {
          motionValues.forEach(({ name, motionValue }) => {
            const val = instanceValues.get(name)?.Float;
            if (val !== undefined) {
              motionValue.jump(val);
            }
          });
        }
      }
    }

    if (elapsedTime < animationDuration) {
      animationFrameRef.current = requestAnimationFrame(runAnimationLoop);
    } else {
      startTimeRef.current = undefined;
      lastFrameTimeRef.current = undefined;
      if (wasm.isLoaded && activePlayerId !== null) {
        wasm.stop(activePlayerId);
      }
    }
  };

  const play = (offset: number) => {
    if (wasm.isLoaded && activePlayerId !== null) {
      wasm.seek(activePlayerId, offset / -1000);
      wasm.play(activePlayerId);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      startTimeRef.current = undefined;
      lastFrameTimeRef.current = undefined;
      animationFrameRef.current = requestAnimationFrame(runAnimationLoop);
    }
  };

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return {
    wasm,
    activePlayerId,
    animationDuration,
    setAnimationDuration,
    loadAnimation,
    play,
    isLoadingAnimation,
  };
};
