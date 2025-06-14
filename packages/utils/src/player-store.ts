/**
 * @fileoverview
 * Experimental store for handling player state and actions.
 * Provides a centralized way to manage animation playback state.
 *
 * @remarks
 * Not currently in use. Part of an attempt to improve performance
 * by separating rapidly-changing player data.
 */

import { createContext } from "react";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { enableMapSet, produce } from "immer";
import * as THREE from "three";
import {
  Player,
  newPlayer,
  reset,
  play,
  pause,
  setBounds,
  setViewport,
  update,
  seek,
  setSpeed,
  setDirection,
  reverse,
  setBounce,
  setLooping,
} from "./player";

/* This code is not currently used, but it is a first attempt to move the rapidly-changing
 * realtime data into a separate store to improve performance. Synchronizing this store with
 * the main store would have to be done to handle events like setting a value from a control.
 */

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
enableMapSet();

/**
 * Core data structure for player state
 */
export interface PlayerData {
  /** The player instance containing current state */
  player: Player;
}

/**
 * Actions available for controlling the player
 */
export interface PlayerActions {
  /** Updates the total duration of the animation */
  updateDuration: (duration: number) => void;
  /** Updates the playback speed */
  updateSpeed: (speed: number) => void;
  /** Updates the playback direction */
  updateDirection: (direction: "forward" | "reverse") => void;
  /** Reverses the current playback direction */
  reverseDirection: () => void;
  /** Resets the player to initial state or specified time */
  resetPlayer: (time?: number) => void;
  /** Plays the animation */
  playPlayer: (speed?: number, direction?: "forward" | "reverse") => void;
  /** Pauses the animation */
  pausePlayer: () => void;
  /** Updates the timer */
  updatePlayer: (coldStart?: boolean) => void;
  /** Sets the player bounds */
  updatePlayerBounds: (start: number, end: number) => void;
  /** Updates one bound of the player */
  updatePlayerBound: (bound: "start" | "end", time?: number) => void;
  /** Sets the player viewport */
  updatePlayerViewport: (start: number, end: number) => void;
  /** Seeks the viewport to center the player at a time */
  updatePlayerViewportCenter: (time?: number) => void;
  /** Updates one bound of the player viewport */
  updatePlayerViewportBound: (bound: "start" | "end", time: number) => void;
  /** Update the player bounce setting */
  updateBounce: (bounce: boolean) => void;
  /** Update the player looping setting */
  updateLooping: (looping: boolean) => void;
}

export type PlayerStoreSetter = (
  partial:
    | (PlayerData & PlayerActions)
    | Partial<PlayerData & PlayerActions>
    | ((
        state: PlayerData & PlayerActions,
      ) => (PlayerData & PlayerActions) | Partial<PlayerData & PlayerActions>),
  replace?: false | undefined,
) => void;

export type PlayerStoreGetter = () => PlayerData & PlayerActions;

export const PlayerSlice = (set: PlayerStoreSetter) => ({
  player: newPlayer(),
  // Set the duration of the player
  updateDuration: (duration: number) => {
    set(
      produce((state: PlayerData) => {
        state.player.duration = duration;
      }),
    );
  },
  // Set the speed of the animation playback
  updateSpeed: (speed: number) => {
    set((state: PlayerData) => ({
      player: setSpeed(state.player, speed),
    }));
  },
  // Set the direction of the animation playback
  updateDirection: (direction: "forward" | "reverse") => {
    set((state: PlayerData) => ({
      player: setDirection(state.player, direction),
    }));
  },
  // Reverse the current direction of the animation playback
  reverseDirection: () => {
    set((state: PlayerData) => ({
      player: reverse(state.player),
    }));
  },
  // Set the time of the animation
  resetPlayer: (time?: number) => {
    set((state: PlayerData) => ({ player: reset(state.player, time) }));
  },
  // Play the animation
  playPlayer: (speed?: number, direction?: "forward" | "reverse") => {
    set((state: PlayerData) => ({ player: play(state.player, speed, direction) }));
  },
  // Pause the animation
  pausePlayer: () => {
    set((state: PlayerData) => ({ player: pause(state.player) }));
  },
  // Update the timer
  updatePlayer: (coldStart?: boolean) => {
    set((state: PlayerData) => ({
      player: update(state.player, coldStart ?? false),
    }));
  },
  // Set the player bounds
  updatePlayerBounds: (start: number, end: number) => {
    set((state: PlayerData) => ({
      player: setBounds(state.player, [start, end]),
    }));
  },
  updatePlayerBound: (bound: "start" | "end", time?: number) => {
    set((state: PlayerData) => {
      const t = time ?? state.player.stamp;
      if (bound === "start" && state.player.bounds[1] <= t) {
        return {
          player: setBounds(state.player, [state.player.bounds[1], t]),
        };
      } else if (bound === "end" && state.player.bounds[0] >= t) {
        return {
          player: setBounds(state.player, [t, state.player.bounds[0]]),
        };
      } else if (bound === "start") {
        return {
          player: setBounds(state.player, [t, state.player.bounds[1]]),
        };
      } else {
        return {
          player: setBounds(state.player, [state.player.bounds[0], t]),
        };
      }
    });
  },
  // Set the player viewport
  updatePlayerViewport: (start: number, end: number) => {
    set((state: PlayerData) => ({
      player: setViewport(state.player, [start, end]),
    }));
  },
  updatePlayerViewportCenter: (time?: number) => {
    set((state: PlayerData) => ({
      player: seek(state.player, time ?? state.player.stamp),
    }));
  },
  updatePlayerViewportBound: (bound: "start" | "end", time: number) => {
    set((state: PlayerData) => {
      if (bound === "start" && state.player.viewport[1] <= time) {
        return {
          player: setViewport(state.player, [state.player.viewport[1], time]),
        };
      } else if (bound === "end" && state.player.viewport[0] >= time) {
        return {
          player: setViewport(state.player, [time, state.player.viewport[0]]),
        };
      } else if (bound === "start") {
        return {
          player: setViewport(state.player, [time, state.player.viewport[1]]),
        };
      } else {
        return {
          player: setViewport(state.player, [state.player.viewport[0], time]),
        };
      }
    });
  },
  updateBounce: (bounce: boolean) => {
    set((state: PlayerData) => ({
      player: setBounce(state.player, bounce),
    }));
  },
  updateLooping: (looping: boolean) => {
    set((state: PlayerData) => ({
      player: setLooping(state.player, looping),
    }));
  },
});

export const usePlayerStore = create<PlayerData & PlayerActions>()(
  subscribeWithSelector(PlayerSlice),
);

export type PlayerStore = typeof usePlayerStore;

// This creates a context where the single app store is stored.
export const PlayerContext = createContext<PlayerStore | null>(null);
