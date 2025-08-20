/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRef, useEffect, useState, useCallback } from "react";
import wasminit, { WasmAnimationEngine, create_test_animation } from "animation-player";

/**
 * Pure WASM wrapper hook that loads the module and provides direct access to engine methods
 * without modifying them. Handles memory management and cleanup.
 */
export function useWasm(config: any = null) {
  const engineRef = useRef<WasmAnimationEngine | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize WASM module
  useEffect(() => {
    let mounted = true;

    const initWasm = async () => {
      if (engineRef.current) return; // Already initialized

      setIsLoading(true);
      setError(null);

      try {
        // Initialize WASM module
        await wasminit();

        if (!mounted) return;

        // Create engine instance
        const configJson = config ? JSON.stringify(config) : null;
        const engine = new WasmAnimationEngine(configJson);

        engineRef.current = engine;
        setIsLoaded(true);
      } catch (err: any) {
        if (mounted) {
          setError(err.message);
          console.error("WASM initialization failed:", err);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initWasm();

    // Cleanup function
    return () => {
      mounted = false;
      if (engineRef.current) {
        // WASM modules don't have explicit cleanup, but we clear the reference
        engineRef.current = null;
      }
    };
  }, [config]);

  // Direct WASM method wrappers - these don't modify the underlying methods
  const loadAnimation = useCallback((animationJson: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.load_animation(animationJson);
  }, []);

  const createPlayer = useCallback(() => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.create_player();
  }, []);

  const addInstance = useCallback((playerId: string, animationId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.add_instance(playerId, animationId);
  }, []);

  const play = useCallback((playerId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.play(playerId);
  }, []);

  const pause = useCallback((playerId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.pause(playerId);
  }, []);

  const stop = useCallback((playerId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.stop(playerId);
  }, []);

  const seek = useCallback((playerId: string, timeSeconds: number) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.seek(playerId, timeSeconds);
  }, []);

  const update = useCallback((frameDeltaSeconds: number) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.update(frameDeltaSeconds);
  }, []);

  const getPlayerState = useCallback((playerId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.get_player_state(playerId);
  }, []);

  const getPlayerTime = useCallback((playerId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.get_player_time(playerId);
  }, []);

  const getAnimationIds = useCallback(() => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.animation_ids();
  }, []);

  const getPlayerProgress = useCallback((playerId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.get_player_progress(playerId);
  }, []);

  const getPlayerIds = useCallback(() => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.get_player_ids();
  }, []);

  const updatePlayerConfig = useCallback((playerId: string, configJson: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.update_player_config(playerId, configJson);
  }, []);

  const exportAnimation = useCallback((animationId: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    const animationJson = engineRef.current.export_animation(animationId);
    return JSON.parse(animationJson);
  }, []);

  const bakeAnimation = useCallback((animationId: string, configJson: string) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    const bakedJson = engineRef.current.bake_animation(animationId, configJson);
    return JSON.parse(bakedJson);
  }, []);

  const getDerivatives = useCallback((playerId: string, derivativeWidthMs = 1.0) => {
    if (!engineRef.current) throw new Error("WASM not loaded");
    return engineRef.current.get_derivatives(playerId, derivativeWidthMs);
  }, []);

  // Test animation helper
  const getTestAnimationData = useCallback(() => {
    return create_test_animation();
  }, []);

  return {
    // State
    isLoaded,
    isLoading,
    error,
    engine: engineRef.current,

    // Direct WASM methods
    loadAnimation,
    createPlayer,
    addInstance,
    play,
    pause,
    stop,
    seek,
    update,
    getPlayerState,
    getPlayerTime,
    getAnimationIds,
    getPlayerProgress,
    getPlayerIds,
    updatePlayerConfig,
    exportAnimation,
    bakeAnimation,
    getDerivatives,
    getTestAnimationData,
  };
}
