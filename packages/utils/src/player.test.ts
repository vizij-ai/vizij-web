import { describe, it, expect, beforeEach } from "vitest";
import {
  Player,
  PlayerDirection,
  newPlayer,
  play,
  pause,
  updated,
  reset,
  withBounds,
  withSpeed,
  withDirection,
  reversed,
  withDuration,
  withBounce,
  withLooping,
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
      expect(player.direction).toBe(PlayerDirection.Forward);
      expect(player._currentDirection).toBe(PlayerDirection.Forward);
      expect(player._bounced).toBe(false);
      expect(player._enteredBounds).toBe(false);
      expect(player.bounds).toEqual([0, 1]);
      expect(player.bounce).toBe(false);
      expect(player.looping).toBe(true);
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
      const playingPlayer = play(player, 2, PlayerDirection.Reverse);
      expect(playingPlayer.speed).toBe(2);
      expect(playingPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
    });

    it("ensures speed is always positive", () => {
      const playingPlayer = play(player, -3);
      expect(playingPlayer.speed).toBe(3);
    });

    describe("reverse playback positioning", () => {
      it("moves to end when playing reverse from start", () => {
        const playerAtStart = { ...player, stamp: 0 };
        const playingPlayer = play(
          playerAtStart,
          undefined,
          PlayerDirection.Reverse,
        );
        expect(playingPlayer.stamp).toBe(1); // Should move to end of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });

      it("moves to end when playing reverse from near start", () => {
        const playerNearStart = { ...player, stamp: 0.0005 };
        const playingPlayer = play(
          playerNearStart,
          undefined,
          PlayerDirection.Reverse,
        );
        expect(playingPlayer.stamp).toBe(1); // Should move to end of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });

      it("does not move when playing reverse from middle", () => {
        const playerInMiddle = { ...player, stamp: 0.5 };
        const playingPlayer = play(
          playerInMiddle,
          undefined,
          PlayerDirection.Reverse,
        );
        expect(playingPlayer.stamp).toBe(0.5); // Should stay in middle
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });

      it("respects custom bounds when playing reverse", () => {
        const boundedPlayer = withBounds(player, [0.2, 0.8]);
        const playerAtBoundStart = { ...boundedPlayer, stamp: 0.2 };
        const playingPlayer = play(
          playerAtBoundStart,
          undefined,
          PlayerDirection.Reverse,
        );
        expect(playingPlayer.stamp).toBe(0.8); // Should move to end of custom bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      });
    });

    describe("forward playback positioning", () => {
      it("moves to start when playing forward from end", () => {
        const playerAtEnd = { ...player, stamp: 1 };
        const playingPlayer = play(
          playerAtEnd,
          undefined,
          PlayerDirection.Forward,
        );
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      });

      it("moves to start when playing forward from near end", () => {
        const playerNearEnd = { ...player, stamp: 0.9995 };
        const playingPlayer = play(
          playerNearEnd,
          undefined,
          PlayerDirection.Forward,
        );
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      });

      it("does not move when playing forward from middle", () => {
        const playerInMiddle = { ...player, stamp: 0.5 };
        const playingPlayer = play(
          playerInMiddle,
          undefined,
          PlayerDirection.Forward,
        );
        expect(playingPlayer.stamp).toBe(0.5); // Should stay in middle
        expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      });
    });

    describe("no loop, no bounce mode", () => {
      it("resets to start when playing forward after completion", () => {
        const oncePlayer = withBounce(withLooping(player, false), false);
        const playerAtEnd = { ...oncePlayer, stamp: 1 };
        const playingPlayer = play(
          playerAtEnd,
          undefined,
          PlayerDirection.Forward,
        );
        expect(playingPlayer.stamp).toBe(0);
      });

      it("resets to end when playing reverse after completion", () => {
        const oncePlayer = withBounce(withLooping(player, false), false);
        const playerAtStart = { ...oncePlayer, stamp: 0 };
        const playingPlayer = play(
          playerAtStart,
          undefined,
          PlayerDirection.Reverse,
        );
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
      const runningPlayer = play(player, 2, PlayerDirection.Reverse);
      const pausedPlayer = pause(runningPlayer);
      expect(pausedPlayer.speed).toBe(2);
      expect(pausedPlayer.direction).toBe(PlayerDirection.Reverse);
    });

    it("resets direction to base direction when resuming after pause", () => {
      // Create a player that has bounced (current direction different from base direction)
      const bouncePlayer = withBounce(withLooping(player, true), true);
      const playerAfterBounce = {
        ...bouncePlayer,
        direction: PlayerDirection.Forward as const,
        _currentDirection: PlayerDirection.Reverse as const, // Different from base direction
        _bounced: true,
        running: true,
      };

      // Pause the player
      const pausedPlayer = pause(playerAfterBounce);
      expect(pausedPlayer.running).toBe(false);
      expect(pausedPlayer.direction).toBe(PlayerDirection.Forward); // Base direction preserved
      expect(pausedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Current direction preserved during pause

      // Resume - should reset current direction to base direction
      const resumedPlayer = play(pausedPlayer);
      expect(resumedPlayer.running).toBe(true);
      expect(resumedPlayer.direction).toBe(PlayerDirection.Forward); // Base direction unchanged
      expect(resumedPlayer._currentDirection).toBe(PlayerDirection.Forward); // Reset to base direction
      expect(resumedPlayer._bounced).toBe(false); // Bounce state reset
    });
  });

  describe("withSpeed", () => {
    it("sets speed and ensures it is positive", () => {
      const speedPlayer = withSpeed(player, 5);
      expect(speedPlayer.speed).toBe(5);
    });

    it("throws an error if a negative speed is specified", () => {
      expect(() => withSpeed(player, -2)).toThrow(
        "Speed must be a positive number",
      );
    });

    it("preserves other properties", () => {
      const modifiedPlayer = {
        ...player,
        direction: PlayerDirection.Reverse as const,
      };
      const speedPlayer = withSpeed(modifiedPlayer, 3);
      expect(speedPlayer.direction).toBe(PlayerDirection.Reverse);
    });
  });

  describe("withDirection", () => {
    it("sets direction and current direction", () => {
      const directionPlayer = withDirection(player, PlayerDirection.Reverse);
      expect(directionPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(directionPlayer._currentDirection).toBe(PlayerDirection.Reverse);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const directionPlayer = withDirection(
        modifiedPlayer,
        PlayerDirection.Reverse,
      );
      expect(directionPlayer.speed).toBe(3);
    });
  });

  describe(PlayerDirection.Reverse, () => {
    it("flips direction and current direction from forward to reverse", () => {
      const reversedPlayer = reversed(player);
      expect(reversedPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(reversedPlayer._currentDirection).toBe(PlayerDirection.Reverse);
    });

    it("flips direction and current direction from reverse to forward", () => {
      const reversePlayer = withDirection(player, PlayerDirection.Reverse);
      const forwardPlayer = reversed(reversePlayer);
      expect(forwardPlayer.direction).toBe(PlayerDirection.Forward);
      expect(forwardPlayer._currentDirection).toBe(PlayerDirection.Forward);
    });
  });

  describe("update", () => {
    it("preserves player properties during update", () => {
      const runningPlayer = {
        ...player,
        running: true,
        speed: 2,
        direction: PlayerDirection.Reverse as const,
        _currentDirection: PlayerDirection.Reverse as const,
      };

      const updatedPlayer = updated(runningPlayer, true);
      expect(updatedPlayer.speed).toBe(2);
      expect(updatedPlayer.direction).toBe(PlayerDirection.Reverse);
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      expect(updatedPlayer.running).toBe(true);
    });
  });

  describe("withBounds", () => {
    it("sets new bounds", () => {
      const boundedPlayer = withBounds(player, [0.2, 0.8]);
      expect(boundedPlayer.bounds).toEqual([0.2, 0.8]);
    });
  });

  describe("withDuration", () => {
    it("sets new duration", () => {
      const durationPlayer = withDuration(player, 5000);
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

    it("resets current direction to match direction", () => {
      const modifiedPlayer = {
        ...player,
        direction: PlayerDirection.Forward as const,
        _currentDirection: PlayerDirection.Reverse as const,
      };
      const resetPlayer = reset(modifiedPlayer);
      expect(resetPlayer._currentDirection).toBe(PlayerDirection.Forward);
      expect(resetPlayer._bounced).toBe(false);
      expect(resetPlayer._enteredBounds).toBe(false);
    });
  });

  describe("withBounce", () => {
    it("sets bounce property", () => {
      const bouncePlayer = withBounce(player, true);
      expect(bouncePlayer.bounce).toBe(true);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const bouncePlayer = withBounce(modifiedPlayer, true);
      expect(bouncePlayer.speed).toBe(3);
    });
  });

  describe("withLooping", () => {
    it("sets looping property", () => {
      const loopingPlayer = withLooping(player, false);
      expect(loopingPlayer.looping).toBe(false);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const loopingPlayer = withLooping(modifiedPlayer, false);
      expect(loopingPlayer.speed).toBe(3);
    });
  });

  describe("bounce behavior", () => {
    it("reverses current direction when bouncing at end boundary", () => {
      const bouncePlayer = withBounce(player, true);
      const playerAtEnd = {
        ...bouncePlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const,
      };
      const updatedPlayer = updated(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(1); // Clamped to boundary
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Direction reversed
      expect(updatedPlayer.direction).toBe(PlayerDirection.Forward); // Original direction unchanged
      expect(updatedPlayer._bounced).toBe(true); // Bounce state set
    });

    it("reverses current direction when bouncing at start boundary", () => {
      const bouncePlayer = withBounce(player, true);
      const playerAtStart = {
        ...bouncePlayer,
        stamp: -0.1, // Past start boundary
        _currentDirection: PlayerDirection.Reverse as const,
      };
      const updatedPlayer = updated(playerAtStart, false);
      expect(updatedPlayer.stamp).toBe(0); // Clamped to boundary
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Forward); // Direction reversed
      expect(updatedPlayer.direction).toBe(PlayerDirection.Forward); // Original direction unchanged
      expect(updatedPlayer._bounced).toBe(true); // Bounce state set
    });

    it("bounces only once when looping is disabled", () => {
      const bounceOncePlayer = withBounce(withLooping(player, false), true);

      // First bounce at end boundary
      const testPlayer = {
        ...bounceOncePlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const,
        _bounced: false,
        running: true,
      };

      const afterFirstBounce = updated(testPlayer, false);
      expect(afterFirstBounce.stamp).toBe(1); // Clamped to boundary
      expect(afterFirstBounce._currentDirection).toBe(PlayerDirection.Reverse); // Direction reversed
      expect(afterFirstBounce._bounced).toBe(true); // Bounce state set
      expect(afterFirstBounce.running).toBe(true); // Still running

      // Try to bounce again at start boundary - should stop instead
      const playerAtStartAfterBounce = {
        ...afterFirstBounce,
        stamp: -0.1, // Past start boundary
      };

      const afterSecondAttempt = updated(playerAtStartAfterBounce, false);
      expect(afterSecondAttempt.stamp).toBe(0); // Stopped at boundary
      expect(afterSecondAttempt._currentDirection).toBe(
        PlayerDirection.Reverse,
      ); // Direction unchanged
      expect(afterSecondAttempt.running).toBe(false); // Stopped running
    });

    it("continues bouncing when looping is enabled", () => {
      const continuousBouncePlayer = withBounce(
        withLooping(player, true),
        true,
      );

      // First bounce at end boundary
      const testPlayer = {
        ...continuousBouncePlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const,
        _bounced: false,
        running: true,
      };

      const afterFirstBounce = updated(testPlayer, false);
      expect(afterFirstBounce._bounced).toBe(true);
      expect(afterFirstBounce.running).toBe(true);

      // Second bounce at start boundary - should continue bouncing
      const playerAtStartAfterBounce = {
        ...afterFirstBounce,
        stamp: -0.1, // Past start boundary
      };

      const afterSecondBounce = updated(playerAtStartAfterBounce, false);
      expect(afterSecondBounce.stamp).toBe(0); // Bounced back
      expect(afterSecondBounce._currentDirection).toBe(PlayerDirection.Forward); // Direction reversed again
      expect(afterSecondBounce.running).toBe(true); // Still running
    });
  });

  describe("looping behavior", () => {
    it("loops to start when reaching end boundary without bounce", () => {
      const loopPlayer = withBounce(withLooping(player, true), false);
      const playerAtEnd = {
        ...loopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const,
        running: true,
      };
      const updatedPlayer = updated(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(0); // Looped to start
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Forward); // Direction unchanged
      expect(updatedPlayer.running).toBe(true); // Still running
    });

    it("loops to end when reaching start boundary without bounce", () => {
      const loopPlayer = withBounce(withLooping(player, true), false);
      const playerAtStart = {
        ...loopPlayer,
        stamp: -0.1, // Past start boundary
        _currentDirection: PlayerDirection.Reverse as const,
        running: true,
      };
      const updatedPlayer = updated(playerAtStart, false);
      expect(updatedPlayer.stamp).toBe(1); // Looped to end
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Direction unchanged
      expect(updatedPlayer.running).toBe(true); // Still running
    });
  });

  describe("no loop, no bounce behavior", () => {
    it("stops at end boundary", () => {
      const stopPlayer = withBounce(withLooping(player, false), false);
      const playerAtEnd = {
        ...stopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const,
        running: true,
      };
      const updatedPlayer = updated(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(1); // Stopped at boundary
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Forward); // Direction unchanged
      expect(updatedPlayer.running).toBe(false); // Stopped running
    });

    it("stops at start boundary", () => {
      const stopPlayer = withBounce(withLooping(player, false), false);
      const playerAtStart = {
        ...stopPlayer,
        stamp: -0.1, // Past start boundary
        _currentDirection: PlayerDirection.Reverse as const,
        running: true,
      };
      const updatedPlayer = updated(playerAtStart, false);
      expect(updatedPlayer.stamp).toBe(0); // Stopped at boundary
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Direction unchanged
      expect(updatedPlayer.running).toBe(false); // Stopped running
    });
  });

  describe("bounce + looping combined behavior", () => {
    it("bounces continuously back and forth when both bounce and looping are enabled", () => {
      const bounceLoopPlayer = withBounce(withLooping(player, true), true);

      // Test forward to end boundary - should bounce to reverse
      const playerGoingForward = {
        ...bounceLoopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const,
        running: true,
      };
      const afterFirstBounce = updated(playerGoingForward, false);
      expect(afterFirstBounce.stamp).toBe(1); // Clamped to end
      expect(afterFirstBounce._currentDirection).toBe(PlayerDirection.Reverse); // Bounced to reverse
      expect(afterFirstBounce.direction).toBe(PlayerDirection.Forward); // Original direction unchanged
      expect(afterFirstBounce.running).toBe(true); // Still running

      // Test reverse to start boundary - should bounce back to forward
      const playerGoingReverse = {
        ...afterFirstBounce,
        stamp: -0.1, // Past start boundary
      };
      const afterSecondBounce = updated(playerGoingReverse, false);
      expect(afterSecondBounce.stamp).toBe(0); // Clamped to start
      expect(afterSecondBounce._currentDirection).toBe(PlayerDirection.Forward); // Bounced back to forward
      expect(afterSecondBounce.direction).toBe(PlayerDirection.Forward); // Original direction unchanged
      expect(afterSecondBounce.running).toBe(true); // Still running
    });

    it("maintains direction setting during continuous bouncing", () => {
      const bounceLoopPlayer = withBounce(
        withLooping(withDirection(player, PlayerDirection.Reverse), true),
        true,
      );

      // Even though direction is PlayerDirection.Reverse, bouncing should work the same
      const playerAtEnd = {
        ...bounceLoopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: PlayerDirection.Forward as const, // Current direction can be different from base direction
        running: true,
      };
      const updatedPlayer = updated(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(1); // Clamped to boundary
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Bounced
      expect(updatedPlayer.direction).toBe(PlayerDirection.Reverse); // Base direction unchanged
      expect(updatedPlayer.running).toBe(true); // Still running
    });

    it("allows mixed bounce/looping behavior with custom bounds", () => {
      const customBounceLoopPlayer = withBounds(
        withBounce(withLooping(player, true), true),
        [0.2, 0.8],
      );

      const playerAtCustomEnd = {
        ...customBounceLoopPlayer,
        stamp: 0.85, // Past custom end boundary
        _currentDirection: PlayerDirection.Forward as const,
        _enteredBounds: true, // Should have entered bounds to be using specified bounds
        running: true,
      };
      const updatedPlayer = updated(playerAtCustomEnd, false);
      expect(updatedPlayer.stamp).toBe(0.8); // Clamped to custom end
      expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Bounced
      expect(updatedPlayer.running).toBe(true); // Still running
    });
  });

  describe("playing from outside bounds", () => {
    it("plays naturally from before bounds toward bounds when going forward", () => {
      const boundedPlayer = withBounds(player, [0.3, 0.7]);
      const playerBeforeBounds = {
        ...boundedPlayer,
        stamp: 0.1, // Before bounds start
        _currentDirection: PlayerDirection.Forward as const,
      };
      const playingPlayer = play(
        playerBeforeBounds,
        undefined,
        PlayerDirection.Forward,
      );

      // Should not jump to bounds, should play from current position
      expect(playingPlayer.stamp).toBe(0.1);
      expect(playingPlayer._currentDirection).toBe(PlayerDirection.Forward);
      expect(playingPlayer.running).toBe(true);
    });

    it("plays naturally from after bounds toward bounds when going reverse", () => {
      const boundedPlayer = withBounds(player, [0.3, 0.7]);
      const playerAfterBounds = {
        ...boundedPlayer,
        stamp: 0.9, // After bounds end
        _currentDirection: PlayerDirection.Reverse as const,
      };
      const playingPlayer = play(
        playerAfterBounds,
        undefined,
        PlayerDirection.Reverse,
      );

      // Should not jump to bounds, should play from current position
      expect(playingPlayer.stamp).toBe(0.9);
      expect(playingPlayer._currentDirection).toBe(PlayerDirection.Reverse);
      expect(playingPlayer.running).toBe(true);
    });

    it("only jumps when exactly at a boundary that blocks progress", () => {
      const boundedPlayer = withBounds(player, [0.3, 0.7]);

      // At end boundary going forward - should jump to start
      const playerAtEndGoingForward = {
        ...boundedPlayer,
        stamp: 0.7, // Exactly at end boundary
        _currentDirection: PlayerDirection.Forward as const,
      };
      const jumpedToStart = play(
        playerAtEndGoingForward,
        undefined,
        PlayerDirection.Forward,
      );
      expect(jumpedToStart.stamp).toBe(0.3); // Jumped to start

      // At start boundary going reverse - should jump to end
      const playerAtStartGoingReverse = {
        ...boundedPlayer,
        stamp: 0.3, // Exactly at start boundary
        _currentDirection: PlayerDirection.Reverse as const,
      };
      const jumpedToEnd = play(
        playerAtStartGoingReverse,
        undefined,
        PlayerDirection.Reverse,
      );
      expect(jumpedToEnd.stamp).toBe(0.7); // Jumped to end
    });

    it("does not jump when outside bounds but not blocked", () => {
      const boundedPlayer = withBounds(player, [0.3, 0.7]);

      // Outside bounds but can make progress toward bounds
      const playerOutsideBounds = {
        ...boundedPlayer,
        stamp: 0.1, // Before bounds
        _currentDirection: PlayerDirection.Forward as const,
      };
      const shouldNotJump = play(
        playerOutsideBounds,
        undefined,
        PlayerDirection.Forward,
      );
      expect(shouldNotJump.stamp).toBe(0.1); // Should stay at current position

      // Going away from bounds - should also not jump
      const playerGoingAway = {
        ...boundedPlayer,
        stamp: 0.1, // Before bounds
        _currentDirection: PlayerDirection.Reverse as const, // Going away from bounds
      };
      const shouldAlsoNotJump = play(
        playerGoingAway,
        undefined,
        PlayerDirection.Reverse,
      );
      expect(shouldAlsoNotJump.stamp).toBe(0.1); // Should stay at current position
    });

    it("handles realistic scenario: outside bounds → enter bounds → respect boundary behavior", () => {
      // Test with bounce + looping enabled
      const bounceLoopPlayer = withBounds(
        withBounce(withLooping(player, true), true),
        [0.4, 0.6],
      );

      // Start outside bounds, going forward toward bounds
      const testPlayer = {
        ...bounceLoopPlayer,
        stamp: 0.2, // Before bounds [0.4, 0.6]
        _currentDirection: PlayerDirection.Forward as const,
        running: true,
      };

      // Simulate playing toward bounds - should not jump, just continue
      const startedPlayer = play(
        testPlayer,
        undefined,
        PlayerDirection.Forward,
      );
      expect(startedPlayer.stamp).toBe(0.2); // Should remain at starting position
      expect(startedPlayer._currentDirection).toBe(PlayerDirection.Forward);

      // Simulate reaching the end boundary
      const playerAtEndBoundary = {
        ...startedPlayer,
        stamp: 0.65, // Past end boundary
        _enteredBounds: true, // Should have entered bounds to be using specified bounds
      };
      const afterBoundaryHit = updated(playerAtEndBoundary, false);
      expect(afterBoundaryHit.stamp).toBe(0.6); // Clamped to boundary
      expect(afterBoundaryHit._currentDirection).toBe(PlayerDirection.Reverse); // Bounced
      expect(afterBoundaryHit.direction).toBe(PlayerDirection.Forward); // Original direction preserved
      expect(afterBoundaryHit.running).toBe(true); // Still running due to looping

      // Test loop-only behavior (no bounce) from outside bounds
      const loopOnlyPlayer = withBounds(
        withBounce(withLooping(player, true), false),
        [0.3, 0.8],
      );
      const outsideLoopPlayer = {
        ...loopOnlyPlayer,
        stamp: 0.1, // Before bounds
        _currentDirection: PlayerDirection.Forward as const,
        running: true,
      };

      // Should play naturally toward bounds
      const loopStarted = play(
        outsideLoopPlayer,
        undefined,
        PlayerDirection.Forward,
      );
      expect(loopStarted.stamp).toBe(0.1); // No jump

      // When reaching end of full range boundary, should loop back to start of full range (since not entered bounds yet)
      const loopPlayerAtEnd = {
        ...loopStarted,
        stamp: 1.1, // Past end of full range [0,1]
      };
      const afterLoop = updated(loopPlayerAtEnd, false);
      expect(afterLoop.stamp).toBe(0); // Looped to start of full range [0,1], not specified bounds
      expect(afterLoop._currentDirection).toBe(PlayerDirection.Forward); // Direction unchanged
      expect(afterLoop.running).toBe(true); // Still running
    });

    it("does not jump when starting outside bounds - comprehensive validation", () => {
      // Test the exact scenario: bounds ahead of current stamp, should not jump when starting
      const boundedPlayer = withBounds(
        withBounce(withLooping(player, true), false),
        [0.5, 0.8],
      );

      // Scenario 1: Start before bounds, play forward
      const testPlayer = {
        ...boundedPlayer,
        stamp: 0.2, // Well before bounds [0.5, 0.8]
        _currentDirection: PlayerDirection.Forward as const,
        running: false, // Not running yet
      };

      // Start playing - should NOT jump to bounds
      const startedPlayer = play(
        testPlayer,
        undefined,
        PlayerDirection.Forward,
      );
      expect(startedPlayer.stamp).toBe(0.2); // Should remain at original position
      expect(startedPlayer._currentDirection).toBe(PlayerDirection.Forward);
      expect(startedPlayer.running).toBe(true);

      // Simulate multiple updates as it approaches bounds
      let updatedPlayer = startedPlayer;
      for (let i = 0; i < 5; i++) {
        updatedPlayer = updated(updatedPlayer, false);
        // Should gradually move toward bounds, not jump
        expect(updatedPlayer.stamp).toBeGreaterThan(0.2);
        expect(updatedPlayer.stamp).toBeLessThan(0.5); // Not yet at bounds
        expect(updatedPlayer._currentDirection).toBe(PlayerDirection.Forward);
      }

      // Scenario 2: Start after bounds, play reverse
      const reverseTestPlayer = {
        ...boundedPlayer,
        stamp: 0.9, // After bounds [0.5, 0.8]
        _currentDirection: PlayerDirection.Reverse as const,
        running: false,
      };

      const startedReverse = play(
        reverseTestPlayer,
        undefined,
        PlayerDirection.Reverse,
      );
      expect(startedReverse.stamp).toBe(0.9); // Should remain at original position
      expect(startedReverse._currentDirection).toBe(PlayerDirection.Reverse);
      expect(startedReverse.running).toBe(true);

      // Verify boundary logic only applies when actually crossing bounds
      const crossingPlayer = {
        ...boundedPlayer,
        stamp: 0.85, // Past end boundary, simulating having crossed it
        _currentDirection: PlayerDirection.Forward as const,
        _enteredBounds: true, // Should have entered bounds to be using specified bounds
        running: true,
      };

      const afterCrossing = updated(crossingPlayer, false);
      expect(afterCrossing.stamp).toBe(0.5); // Should loop back to start
      expect(afterCrossing._currentDirection).toBe(PlayerDirection.Forward); // Direction unchanged (no bounce)
      expect(afterCrossing.running).toBe(true); // Still running (looping enabled)
    });

    it("comprehensive test: bounce-once + direction reset after pause", () => {
      // Test both fixes working together
      const bounceOncePlayer = withBounds(
        withBounce(withLooping(player, false), true),
        [0.2, 0.8],
      );

      // Start playing forward
      const testPlayer = {
        ...bounceOncePlayer,
        stamp: 0.5, // In middle of bounds
        direction: PlayerDirection.Forward as const,
        _currentDirection: PlayerDirection.Forward as const,
        _bounced: false,
        running: false,
      };

      // Start playing
      const startedPlayer = play(
        testPlayer,
        undefined,
        PlayerDirection.Forward,
      );
      expect(startedPlayer._currentDirection).toBe(PlayerDirection.Forward);
      expect(startedPlayer._bounced).toBe(false);

      // Simulate reaching end boundary - should bounce once
      const playerAtEnd = {
        ...startedPlayer,
        stamp: 0.85, // Past end boundary
        _enteredBounds: true, // Should have entered bounds to be using specified bounds
        running: true,
      };
      const afterBounce = updated(playerAtEnd, false);
      expect(afterBounce.stamp).toBe(0.8); // Clamped to boundary
      expect(afterBounce._currentDirection).toBe(PlayerDirection.Reverse); // Bounced to reverse
      expect(afterBounce.direction).toBe(PlayerDirection.Forward); // Base direction unchanged
      expect(afterBounce._bounced).toBe(true); // Bounce state set
      expect(afterBounce.running).toBe(true); // Still running

      // Pause the player while going reverse
      const pausedPlayer = pause(afterBounce);
      expect(pausedPlayer.running).toBe(false);
      expect(pausedPlayer._currentDirection).toBe(PlayerDirection.Reverse); // Current direction preserved during pause
      expect(pausedPlayer.direction).toBe(PlayerDirection.Forward); // Base direction preserved

      // Resume - should reset to base direction and reset bounce state
      const resumedPlayer = play(pausedPlayer);
      expect(resumedPlayer.running).toBe(true);
      expect(resumedPlayer._currentDirection).toBe(PlayerDirection.Forward); // Reset to base direction
      expect(resumedPlayer.direction).toBe(PlayerDirection.Forward); // Base direction unchanged
      expect(resumedPlayer._bounced).toBe(false); // Bounce state reset

      // Now try to reach end boundary again - should bounce once more (since bounce state was reset)
      const playerAtEndAgain = {
        ...resumedPlayer,
        stamp: 0.85, // Past end boundary again
        _enteredBounds: true, // Should have entered bounds to be using specified bounds
      };
      const afterSecondBounce = updated(playerAtEndAgain, false);
      expect(afterSecondBounce.stamp).toBe(0.8); // Bounced
      expect(afterSecondBounce._currentDirection).toBe(PlayerDirection.Reverse); // Bounced
      expect(afterSecondBounce._bounced).toBe(true); // Bounce state set again

      // Try to bounce at start boundary - should NOT bounce (already bounced once)
      const playerAtStart = {
        ...afterSecondBounce,
        stamp: 0.15, // Past start boundary
        _enteredBounds: true, // Should have entered bounds to be using specified bounds
      };
      const afterSecondAttempt = updated(playerAtStart, false);
      expect(afterSecondAttempt.stamp).toBe(0.2); // Stopped at boundary
      expect(afterSecondAttempt._currentDirection).toBe(
        PlayerDirection.Reverse,
      ); // Direction unchanged
      expect(afterSecondAttempt.running).toBe(false); // Stopped (no more bounces allowed)
    });

    it("uses full range as bounds when starting outside specified bounds", () => {
      // Test the new behavior: use [0,1] as bounds until entering specified bounds
      const customBoundsPlayer = withBounds(
        withBounce(withLooping(player, false), false),
        [0.3, 0.7],
      );

      // Start outside bounds going forward (before bounds)
      const testPlayer = {
        ...customBoundsPlayer,
        stamp: 0.1, // Before bounds [0.3, 0.7]
        _currentDirection: PlayerDirection.Forward as const,
        _bounced: false,
        _enteredBounds: false,
        running: false,
      };

      // Start playing - should use [0,1] as effective bounds
      const startedPlayer = play(testPlayer);
      expect(startedPlayer._enteredBounds).toBe(false);

      // Simulate moving towards the actual bounds - should use [0,1] bounds
      const movingTowardBounds = {
        ...startedPlayer,
        stamp: 0.2, // Still outside specified bounds
        running: true,
      };
      const beforeEntering = updated(movingTowardBounds, false);
      expect(beforeEntering._enteredBounds).toBe(false); // Still hasn't entered

      // Simulate entering the specified bounds
      const enteringBounds = {
        ...beforeEntering,
        stamp: 0.35, // Now inside bounds [0.3, 0.7]
      };
      const afterEntering = updated(enteringBounds, false);
      expect(afterEntering._enteredBounds).toBe(true); // Should mark as entered

      // Now simulate going past the end of specified bounds - should use specified bounds
      const pastSpecifiedEnd = {
        ...afterEntering,
        stamp: 0.75, // Past end of specified bounds
      };
      const afterSpecifiedBoundary = updated(pastSpecifiedEnd, false);
      expect(afterSpecifiedBoundary.stamp).toBe(0.7); // Should stop at specified boundary, not [0,1] boundary
      expect(afterSpecifiedBoundary.running).toBe(false); // Should stop (no loop, no bounce)

      // Test starting outside bounds going reverse (after bounds)
      const reverseBoundsPlayer = withBounds(
        withBounce(withLooping(player, true), false),
        [0.2, 0.6],
      );
      const reverseTestPlayer = {
        ...reverseBoundsPlayer,
        stamp: 0.8, // After bounds [0.2, 0.6]
        _currentDirection: PlayerDirection.Reverse as const,
        _bounced: false,
        _enteredBounds: false,
        running: true,
      };

      // Should use [0,1] as bounds until entering specified bounds
      const reverseUpdate = updated(reverseTestPlayer, false);
      expect(reverseUpdate._enteredBounds).toBe(false); // Still outside

      // Simulate entering specified bounds from the high end
      const enteringFromHigh = {
        ...reverseUpdate,
        stamp: 0.55, // Now inside bounds [0.2, 0.6]
      };
      const afterEnteringFromHigh = updated(enteringFromHigh, false);
      expect(afterEnteringFromHigh._enteredBounds).toBe(true); // Should mark as entered

      // Test that it now uses specified bounds
      const pastSpecifiedStart = {
        ...afterEnteringFromHigh,
        stamp: 0.15, // Past start of specified bounds
      };
      const afterSpecifiedStartBoundary = updated(pastSpecifiedStart, false);
      expect(afterSpecifiedStartBoundary.stamp).toBe(0.6); // Should loop to end of specified bounds
      expect(afterSpecifiedStartBoundary.running).toBe(true); // Should continue (looping enabled)
    });

    it("comprehensive test: full-range bounds behavior with all settings", () => {
      // Test the complete behavior: use [0,1] until entering bounds, then switch to specified bounds

      // Scenario 1: No bounce, no loop - should stop at [0,1] boundaries before entering bounds
      const noBounceNoLoopPlayer = withBounds(
        withBounce(withLooping(player, false), false),
        [0.4, 0.6],
      );

      const testPlayer1 = {
        ...noBounceNoLoopPlayer,
        stamp: 0.1, // Outside bounds
        _currentDirection: PlayerDirection.Forward as const,
        _enteredBounds: false,
        running: true,
      };

      // Simulate hitting end of full range [0,1] while outside bounds
      const hitFullRangeEnd = {
        ...testPlayer1,
        stamp: 1.1, // Past end of [0,1]
      };
      const stoppedAtFullRange = updated(hitFullRangeEnd, false);
      expect(stoppedAtFullRange.stamp).toBe(1); // Should stop at end of [0,1], not [0.4,0.6]
      expect(stoppedAtFullRange.running).toBe(false); // Should stop
      expect(stoppedAtFullRange._enteredBounds).toBe(false); // Never entered specified bounds

      // Scenario 2: Bounce + loop - should bounce within [0,1] then switch to bounds behavior
      const bounceLoopPlayer = withBounds(
        withBounce(withLooping(player, true), true),
        [0.3, 0.7],
      );

      const testPlayer2 = {
        ...bounceLoopPlayer,
        stamp: 0.05, // Outside bounds, near start of [0,1]
        _currentDirection: PlayerDirection.Reverse as const,
        _enteredBounds: false,
        running: true,
      };

      // Should bounce at start of [0,1], not at start of [0.3,0.7]
      const hitFullRangeStart = {
        ...testPlayer2,
        stamp: -0.1, // Past start of [0,1]
      };
      const bouncedAtFullRange = updated(hitFullRangeStart, false);
      expect(bouncedAtFullRange.stamp).toBe(0); // Should bounce at start of [0,1]
      expect(bouncedAtFullRange._currentDirection).toBe(
        PlayerDirection.Forward,
      ); // Should reverse direction
      expect(bouncedAtFullRange._enteredBounds).toBe(false); // Still outside specified bounds

      // Now simulate entering the specified bounds
      const enteringSpecifiedBounds = {
        ...bouncedAtFullRange,
        stamp: 0.35, // Inside [0.3, 0.7]
      };
      const afterEntering = updated(enteringSpecifiedBounds, false);
      expect(afterEntering._enteredBounds).toBe(true); // Should mark as entered

      // Now should use specified bounds for bouncing
      const hitSpecifiedEnd = {
        ...afterEntering,
        stamp: 0.75, // Past end of [0.3, 0.7]
      };
      const bouncedAtSpecified = updated(hitSpecifiedEnd, false);
      expect(bouncedAtSpecified.stamp).toBe(0.7); // Should bounce at end of [0.3, 0.7], not [0,1]
      expect(bouncedAtSpecified._currentDirection).toBe(
        PlayerDirection.Reverse,
      ); // Should reverse direction

      // Scenario 3: Loop only - should loop within [0,1] then switch to bounds behavior
      const loopOnlyPlayer = withBounds(
        withBounce(withLooping(player, true), false),
        [0.2, 0.8],
      );

      const testPlayer3 = {
        ...loopOnlyPlayer,
        stamp: 0.9, // Outside bounds, near end of [0,1]
        _currentDirection: PlayerDirection.Forward as const,
        _enteredBounds: false,
        running: true,
      };

      // Should loop at end of [0,1], not at end of [0.2, 0.8]
      const hitFullRangeEndLoop = {
        ...testPlayer3,
        stamp: 1.1, // Past end of [0,1]
      };
      const loopedAtFullRange = updated(hitFullRangeEndLoop, false);
      expect(loopedAtFullRange.stamp).toBe(0); // Should loop to start of [0,1]
      expect(loopedAtFullRange._currentDirection).toBe(PlayerDirection.Forward); // Direction unchanged
      expect(loopedAtFullRange._enteredBounds).toBe(false); // Still outside specified bounds

      // Scenario 4: Verify bounds entry detection works at exact boundaries
      const exactBoundsPlayer = withBounds(player, [0.25, 0.75]);

      // Test entering at exact start boundary
      const atExactStart = {
        ...exactBoundsPlayer,
        stamp: 0.25, // Exactly at start boundary
        _enteredBounds: false,
        running: true,
      };
      const afterExactStart = updated(atExactStart, false);
      expect(afterExactStart._enteredBounds).toBe(true); // Should detect entry

      // Test entering at exact end boundary
      const atExactEnd = {
        ...exactBoundsPlayer,
        stamp: 0.75, // Exactly at end boundary
        _enteredBounds: false,
        running: true,
      };
      const afterExactEnd = updated(atExactEnd, false);
      expect(afterExactEnd._enteredBounds).toBe(true); // Should detect entry
    });
  });
});
