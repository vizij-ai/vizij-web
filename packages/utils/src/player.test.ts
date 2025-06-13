import { describe, it, expect, beforeEach } from "vitest";
import {
  Player,
  newPlayer,
  play,
  pause,
  update,
  reset,
  setBounds,
  setSpeed,
  setDirection,
  reverse,
  setDuration,
} from "./player";

describe("Player", () => {
  let player: Player;

  beforeEach(() => {
    player = newPlayer();
  });

  describe("newPlayer", () => {
    it("creates a player with default values", () => {
      expect(player.running).toBe(false);
      expect(player.stamp).toBe(0);
      expect(player.speed).toBe(1);
      expect(player.direction).toBe("forward");
      expect(player.bounds).toEqual([0, 1]);
      expect(player.playback).toBe("loop");
      expect(player.viewport).toEqual([0, 1]);
      expect(player.duration).toBe(1000);
    });
  });

  describe("play", () => {
    it("starts the player running", () => {
      const playingPlayer = play(player);
      expect(playingPlayer.running).toBe(true);
    });

    it("sets speed and direction when provided", () => {
      const playingPlayer = play(player, 2, "reverse");
      expect(playingPlayer.speed).toBe(2);
      expect(playingPlayer.direction).toBe("reverse");
    });

    it("ensures speed is always positive", () => {
      const playingPlayer = play(player, -3);
      expect(playingPlayer.speed).toBe(3);
    });

    describe("reverse playback positioning", () => {
      it("moves to end when playing reverse from start", () => {
        const playerAtStart = { ...player, stamp: 0 };
        const playingPlayer = play(playerAtStart, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(1); // Should move to end of bounds
      });

      it("moves to end when playing reverse from near start", () => {
        const playerNearStart = { ...player, stamp: 0.0005 };
        const playingPlayer = play(playerNearStart, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(1); // Should move to end of bounds
      });

      it("does not move when playing reverse from middle", () => {
        const playerInMiddle = { ...player, stamp: 0.5 };
        const playingPlayer = play(playerInMiddle, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(0.5); // Should stay in middle
      });

      it("respects custom bounds when playing reverse", () => {
        const boundedPlayer = setBounds(player, [0.2, 0.8]);
        const playerAtBoundStart = { ...boundedPlayer, stamp: 0.2 };
        const playingPlayer = play(playerAtBoundStart, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(0.8); // Should move to end of custom bounds
      });
    });

    describe("forward playback positioning", () => {
      it("moves to start when playing forward from end", () => {
        const playerAtEnd = { ...player, stamp: 1 };
        const playingPlayer = play(playerAtEnd, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
      });

      it("moves to start when playing forward from near end", () => {
        const playerNearEnd = { ...player, stamp: 0.9995 };
        const playingPlayer = play(playerNearEnd, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
      });

      it("does not move when playing forward from middle", () => {
        const playerInMiddle = { ...player, stamp: 0.5 };
        const playingPlayer = play(playerInMiddle, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0.5); // Should stay in middle
      });
    });

    describe("once playback mode", () => {
      it("resets to start when playing forward after completion", () => {
        const oncePlayer = { ...player, playback: "once" as const, stamp: 1 };
        const playingPlayer = play(oncePlayer, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0);
      });

      it("resets to end when playing reverse after completion", () => {
        const oncePlayer = { ...player, playback: "once" as const, stamp: 0 };
        const playingPlayer = play(oncePlayer, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(1);
      });
    });
  });

  describe("pause", () => {
    it("stops the player", () => {
      const runningPlayer = play(player);
      const pausedPlayer = pause(runningPlayer);
      expect(pausedPlayer.running).toBe(false);
    });

    it("preserves other properties", () => {
      const runningPlayer = play(player, 2, "reverse");
      const pausedPlayer = pause(runningPlayer);
      expect(pausedPlayer.speed).toBe(2);
      expect(pausedPlayer.direction).toBe("reverse");
    });
  });

  describe("setSpeed", () => {
    it("sets speed and ensures it is positive", () => {
      const speedPlayer = setSpeed(player, -5);
      expect(speedPlayer.speed).toBe(5);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, direction: "reverse" as const };
      const speedPlayer = setSpeed(modifiedPlayer, 3);
      expect(speedPlayer.direction).toBe("reverse");
    });
  });

  describe("setDirection", () => {
    it("sets direction", () => {
      const directionPlayer = setDirection(player, "reverse");
      expect(directionPlayer.direction).toBe("reverse");
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const directionPlayer = setDirection(modifiedPlayer, "reverse");
      expect(directionPlayer.speed).toBe(3);
    });
  });

  describe("reverse", () => {
    it("flips direction from forward to reverse", () => {
      const reversedPlayer = reverse(player);
      expect(reversedPlayer.direction).toBe("reverse");
    });

    it("flips direction from reverse to forward", () => {
      const reversePlayer = { ...player, direction: "reverse" as const };
      const forwardPlayer = reverse(reversePlayer);
      expect(forwardPlayer.direction).toBe("forward");
    });
  });

  describe("update", () => {
    it("preserves player properties during update", () => {
      const runningPlayer = {
        ...player,
        running: true,
        speed: 2,
        direction: "reverse" as const,
      };

      const updatedPlayer = update(runningPlayer, true);
      expect(updatedPlayer.speed).toBe(2);
      expect(updatedPlayer.direction).toBe("reverse");
      expect(updatedPlayer.running).toBe(true);
    });
  });

  describe("setBounds", () => {
    it("sets new bounds", () => {
      const boundedPlayer = setBounds(player, [0.2, 0.8]);
      expect(boundedPlayer.bounds).toEqual([0.2, 0.8]);
    });
  });

  describe("setDuration", () => {
    it("sets new duration", () => {
      const durationPlayer = setDuration(player, 5000);
      expect(durationPlayer.duration).toBe(5000);
    });
  });

  describe("reset", () => {
    it("resets to stamp 0 by default", () => {
      const modifiedPlayer = { ...player, stamp: 0.5 };
      const resetPlayer = reset(modifiedPlayer);
      expect(resetPlayer.stamp).toBe(0);
    });

    it("resets to specified stamp", () => {
      const modifiedPlayer = { ...player, stamp: 0.5 };
      const resetPlayer = reset(modifiedPlayer, 0.7);
      expect(resetPlayer.stamp).toBe(0.7);
    });

    it("updates timestamps", () => {
      const resetPlayer = reset(player);
      expect(resetPlayer._currentTime).toBeGreaterThan(0);
      expect(resetPlayer._previousTime).toBe(resetPlayer._currentTime);
    });
  });
});
