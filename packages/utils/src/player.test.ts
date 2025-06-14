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
  setBounce,
  setLooping,
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
      expect(player._currentDirection).toBe("forward");
      expect(player._bounced).toBe(false);
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
      const playingPlayer = play(player, 2, "reverse");
      expect(playingPlayer.speed).toBe(2);
      expect(playingPlayer.direction).toBe("reverse");
      expect(playingPlayer._currentDirection).toBe("reverse");
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
        expect(playingPlayer._currentDirection).toBe("reverse");
      });

      it("moves to end when playing reverse from near start", () => {
        const playerNearStart = { ...player, stamp: 0.0005 };
        const playingPlayer = play(playerNearStart, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(1); // Should move to end of bounds
        expect(playingPlayer._currentDirection).toBe("reverse");
      });

      it("does not move when playing reverse from middle", () => {
        const playerInMiddle = { ...player, stamp: 0.5 };
        const playingPlayer = play(playerInMiddle, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(0.5); // Should stay in middle
        expect(playingPlayer._currentDirection).toBe("reverse");
      });

      it("respects custom bounds when playing reverse", () => {
        const boundedPlayer = setBounds(player, [0.2, 0.8]);
        const playerAtBoundStart = { ...boundedPlayer, stamp: 0.2 };
        const playingPlayer = play(playerAtBoundStart, undefined, "reverse");
        expect(playingPlayer.stamp).toBe(0.8); // Should move to end of custom bounds
        expect(playingPlayer._currentDirection).toBe("reverse");
      });
    });

    describe("forward playback positioning", () => {
      it("moves to start when playing forward from end", () => {
        const playerAtEnd = { ...player, stamp: 1 };
        const playingPlayer = play(playerAtEnd, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
        expect(playingPlayer._currentDirection).toBe("forward");
      });

      it("moves to start when playing forward from near end", () => {
        const playerNearEnd = { ...player, stamp: 0.9995 };
        const playingPlayer = play(playerNearEnd, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0); // Should move to start of bounds
        expect(playingPlayer._currentDirection).toBe("forward");
      });

      it("does not move when playing forward from middle", () => {
        const playerInMiddle = { ...player, stamp: 0.5 };
        const playingPlayer = play(playerInMiddle, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0.5); // Should stay in middle
        expect(playingPlayer._currentDirection).toBe("forward");
      });
    });

    describe("no loop, no bounce mode", () => {
      it("resets to start when playing forward after completion", () => {
        const oncePlayer = setBounce(setLooping(player, false), false);
        const playerAtEnd = { ...oncePlayer, stamp: 1 };
        const playingPlayer = play(playerAtEnd, undefined, "forward");
        expect(playingPlayer.stamp).toBe(0);
      });

      it("resets to end when playing reverse after completion", () => {
        const oncePlayer = setBounce(setLooping(player, false), false);
        const playerAtStart = { ...oncePlayer, stamp: 0 };
        const playingPlayer = play(playerAtStart, undefined, "reverse");
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

    it("resets direction to base direction when resuming after pause", () => {
      // Create a player that has bounced (current direction different from base direction)
      const bouncePlayer = setBounce(setLooping(player, true), true);
      const playerAfterBounce = {
        ...bouncePlayer,
        direction: "forward" as const,
        _currentDirection: "reverse" as const, // Different from base direction
        _bounced: true,
        running: true,
      };

      // Pause the player
      const pausedPlayer = pause(playerAfterBounce);
      expect(pausedPlayer.running).toBe(false);
      expect(pausedPlayer.direction).toBe("forward"); // Base direction preserved
      expect(pausedPlayer._currentDirection).toBe("reverse"); // Current direction preserved during pause

      // Resume - should reset current direction to base direction
      const resumedPlayer = play(pausedPlayer);
      expect(resumedPlayer.running).toBe(true);
      expect(resumedPlayer.direction).toBe("forward"); // Base direction unchanged
      expect(resumedPlayer._currentDirection).toBe("forward"); // Reset to base direction
      expect(resumedPlayer._bounced).toBe(false); // Bounce state reset
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
    it("sets direction and current direction", () => {
      const directionPlayer = setDirection(player, "reverse");
      expect(directionPlayer.direction).toBe("reverse");
      expect(directionPlayer._currentDirection).toBe("reverse");
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const directionPlayer = setDirection(modifiedPlayer, "reverse");
      expect(directionPlayer.speed).toBe(3);
    });
  });

  describe("reverse", () => {
    it("flips direction and current direction from forward to reverse", () => {
      const reversedPlayer = reverse(player);
      expect(reversedPlayer.direction).toBe("reverse");
      expect(reversedPlayer._currentDirection).toBe("reverse");
    });

    it("flips direction and current direction from reverse to forward", () => {
      const reversePlayer = setDirection(player, "reverse");
      const forwardPlayer = reverse(reversePlayer);
      expect(forwardPlayer.direction).toBe("forward");
      expect(forwardPlayer._currentDirection).toBe("forward");
    });
  });

  describe("update", () => {
    it("preserves player properties during update", () => {
      const runningPlayer = {
        ...player,
        running: true,
        speed: 2,
        direction: "reverse" as const,
        _currentDirection: "reverse" as const,
      };

      const updatedPlayer = update(runningPlayer, true);
      expect(updatedPlayer.speed).toBe(2);
      expect(updatedPlayer.direction).toBe("reverse");
      expect(updatedPlayer._currentDirection).toBe("reverse");
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

    it("resets current direction to match direction", () => {
      const modifiedPlayer = {
        ...player,
        direction: "forward" as const,
        _currentDirection: "reverse" as const,
      };
      const resetPlayer = reset(modifiedPlayer);
      expect(resetPlayer._currentDirection).toBe("forward");
      expect(resetPlayer._bounced).toBe(false);
    });
  });

  describe("setBounce", () => {
    it("sets bounce property", () => {
      const bouncePlayer = setBounce(player, true);
      expect(bouncePlayer.bounce).toBe(true);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const bouncePlayer = setBounce(modifiedPlayer, true);
      expect(bouncePlayer.speed).toBe(3);
    });
  });

  describe("setLooping", () => {
    it("sets looping property", () => {
      const loopingPlayer = setLooping(player, false);
      expect(loopingPlayer.looping).toBe(false);
    });

    it("preserves other properties", () => {
      const modifiedPlayer = { ...player, speed: 3 };
      const loopingPlayer = setLooping(modifiedPlayer, false);
      expect(loopingPlayer.speed).toBe(3);
    });
  });

  describe("bounce behavior", () => {
    it("reverses current direction when bouncing at end boundary", () => {
      const bouncePlayer = setBounce(player, true);
      const playerAtEnd = {
        ...bouncePlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const,
      };
      const updatedPlayer = update(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(1); // Clamped to boundary
      expect(updatedPlayer._currentDirection).toBe("reverse"); // Direction reversed
      expect(updatedPlayer.direction).toBe("forward"); // Original direction unchanged
      expect(updatedPlayer._bounced).toBe(true); // Bounce state set
    });

    it("reverses current direction when bouncing at start boundary", () => {
      const bouncePlayer = setBounce(player, true);
      const playerAtStart = {
        ...bouncePlayer,
        stamp: -0.1, // Past start boundary
        _currentDirection: "reverse" as const,
      };
      const updatedPlayer = update(playerAtStart, false);
      expect(updatedPlayer.stamp).toBe(0); // Clamped to boundary
      expect(updatedPlayer._currentDirection).toBe("forward"); // Direction reversed
      expect(updatedPlayer.direction).toBe("forward"); // Original direction unchanged
      expect(updatedPlayer._bounced).toBe(true); // Bounce state set
    });

    it("bounces only once when looping is disabled", () => {
      const bounceOncePlayer = setBounce(setLooping(player, false), true);

      // First bounce at end boundary
      const testPlayer = {
        ...bounceOncePlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const,
        _bounced: false,
        running: true,
      };

      const afterFirstBounce = update(testPlayer, false);
      expect(afterFirstBounce.stamp).toBe(1); // Clamped to boundary
      expect(afterFirstBounce._currentDirection).toBe("reverse"); // Direction reversed
      expect(afterFirstBounce._bounced).toBe(true); // Bounce state set
      expect(afterFirstBounce.running).toBe(true); // Still running

      // Try to bounce again at start boundary - should stop instead
      const playerAtStartAfterBounce = {
        ...afterFirstBounce,
        stamp: -0.1, // Past start boundary
      };

      const afterSecondAttempt = update(playerAtStartAfterBounce, false);
      expect(afterSecondAttempt.stamp).toBe(0); // Stopped at boundary
      expect(afterSecondAttempt._currentDirection).toBe("reverse"); // Direction unchanged
      expect(afterSecondAttempt.running).toBe(false); // Stopped running
    });

    it("continues bouncing when looping is enabled", () => {
      const continuousBouncePlayer = setBounce(setLooping(player, true), true);

      // First bounce at end boundary
      const testPlayer = {
        ...continuousBouncePlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const,
        _bounced: false,
        running: true,
      };

      const afterFirstBounce = update(testPlayer, false);
      expect(afterFirstBounce._bounced).toBe(true);
      expect(afterFirstBounce.running).toBe(true);

      // Second bounce at start boundary - should continue bouncing
      const playerAtStartAfterBounce = {
        ...afterFirstBounce,
        stamp: -0.1, // Past start boundary
      };

      const afterSecondBounce = update(playerAtStartAfterBounce, false);
      expect(afterSecondBounce.stamp).toBe(0); // Bounced back
      expect(afterSecondBounce._currentDirection).toBe("forward"); // Direction reversed again
      expect(afterSecondBounce.running).toBe(true); // Still running
    });
  });

  describe("looping behavior", () => {
    it("loops to start when reaching end boundary without bounce", () => {
      const loopPlayer = setBounce(setLooping(player, true), false);
      const playerAtEnd = {
        ...loopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const,
        running: true,
      };
      const updatedPlayer = update(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(0); // Looped to start
      expect(updatedPlayer._currentDirection).toBe("forward"); // Direction unchanged
      expect(updatedPlayer.running).toBe(true); // Still running
    });

    it("loops to end when reaching start boundary without bounce", () => {
      const loopPlayer = setBounce(setLooping(player, true), false);
      const playerAtStart = {
        ...loopPlayer,
        stamp: -0.1, // Past start boundary
        _currentDirection: "reverse" as const,
        running: true,
      };
      const updatedPlayer = update(playerAtStart, false);
      expect(updatedPlayer.stamp).toBe(1); // Looped to end
      expect(updatedPlayer._currentDirection).toBe("reverse"); // Direction unchanged
      expect(updatedPlayer.running).toBe(true); // Still running
    });
  });

  describe("no loop, no bounce behavior", () => {
    it("stops at end boundary", () => {
      const stopPlayer = setBounce(setLooping(player, false), false);
      const playerAtEnd = {
        ...stopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const,
        running: true,
      };
      const updatedPlayer = update(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(1); // Stopped at boundary
      expect(updatedPlayer._currentDirection).toBe("forward"); // Direction unchanged
      expect(updatedPlayer.running).toBe(false); // Stopped running
    });

    it("stops at start boundary", () => {
      const stopPlayer = setBounce(setLooping(player, false), false);
      const playerAtStart = {
        ...stopPlayer,
        stamp: -0.1, // Past start boundary
        _currentDirection: "reverse" as const,
        running: true,
      };
      const updatedPlayer = update(playerAtStart, false);
      expect(updatedPlayer.stamp).toBe(0); // Stopped at boundary
      expect(updatedPlayer._currentDirection).toBe("reverse"); // Direction unchanged
      expect(updatedPlayer.running).toBe(false); // Stopped running
    });
  });

  describe("bounce + looping combined behavior", () => {
    it("bounces continuously back and forth when both bounce and looping are enabled", () => {
      const bounceLoopPlayer = setBounce(setLooping(player, true), true);

      // Test forward to end boundary - should bounce to reverse
      const playerGoingForward = {
        ...bounceLoopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const,
        running: true,
      };
      const afterFirstBounce = update(playerGoingForward, false);
      expect(afterFirstBounce.stamp).toBe(1); // Clamped to end
      expect(afterFirstBounce._currentDirection).toBe("reverse"); // Bounced to reverse
      expect(afterFirstBounce.direction).toBe("forward"); // Original direction unchanged
      expect(afterFirstBounce.running).toBe(true); // Still running

      // Test reverse to start boundary - should bounce back to forward
      const playerGoingReverse = {
        ...afterFirstBounce,
        stamp: -0.1, // Past start boundary
      };
      const afterSecondBounce = update(playerGoingReverse, false);
      expect(afterSecondBounce.stamp).toBe(0); // Clamped to start
      expect(afterSecondBounce._currentDirection).toBe("forward"); // Bounced back to forward
      expect(afterSecondBounce.direction).toBe("forward"); // Original direction unchanged
      expect(afterSecondBounce.running).toBe(true); // Still running
    });

    it("maintains direction setting during continuous bouncing", () => {
      const bounceLoopPlayer = setBounce(setLooping(setDirection(player, "reverse"), true), true);

      // Even though direction is "reverse", bouncing should work the same
      const playerAtEnd = {
        ...bounceLoopPlayer,
        stamp: 1.1, // Past end boundary
        _currentDirection: "forward" as const, // Current direction can be different from base direction
        running: true,
      };
      const updatedPlayer = update(playerAtEnd, false);
      expect(updatedPlayer.stamp).toBe(1); // Clamped to boundary
      expect(updatedPlayer._currentDirection).toBe("reverse"); // Bounced
      expect(updatedPlayer.direction).toBe("reverse"); // Base direction unchanged
      expect(updatedPlayer.running).toBe(true); // Still running
    });

    it("allows mixed bounce/looping behavior with custom bounds", () => {
      const customBounceLoopPlayer = setBounds(
        setBounce(setLooping(player, true), true),
        [0.2, 0.8],
      );

      const playerAtCustomEnd = {
        ...customBounceLoopPlayer,
        stamp: 0.85, // Past custom end boundary
        _currentDirection: "forward" as const,
        running: true,
      };
      const updatedPlayer = update(playerAtCustomEnd, false);
      expect(updatedPlayer.stamp).toBe(0.8); // Clamped to custom end
      expect(updatedPlayer._currentDirection).toBe("reverse"); // Bounced
      expect(updatedPlayer.running).toBe(true); // Still running
    });
  });

  describe("playing from outside bounds", () => {
    it("plays naturally from before bounds toward bounds when going forward", () => {
      const boundedPlayer = setBounds(player, [0.3, 0.7]);
      const playerBeforeBounds = {
        ...boundedPlayer,
        stamp: 0.1, // Before bounds start
        _currentDirection: "forward" as const,
      };
      const playingPlayer = play(playerBeforeBounds, undefined, "forward");

      // Should not jump to bounds, should play from current position
      expect(playingPlayer.stamp).toBe(0.1);
      expect(playingPlayer._currentDirection).toBe("forward");
      expect(playingPlayer.running).toBe(true);
    });

    it("plays naturally from after bounds toward bounds when going reverse", () => {
      const boundedPlayer = setBounds(player, [0.3, 0.7]);
      const playerAfterBounds = {
        ...boundedPlayer,
        stamp: 0.9, // After bounds end
        _currentDirection: "reverse" as const,
      };
      const playingPlayer = play(playerAfterBounds, undefined, "reverse");

      // Should not jump to bounds, should play from current position
      expect(playingPlayer.stamp).toBe(0.9);
      expect(playingPlayer._currentDirection).toBe("reverse");
      expect(playingPlayer.running).toBe(true);
    });

    it("only jumps when exactly at a boundary that blocks progress", () => {
      const boundedPlayer = setBounds(player, [0.3, 0.7]);

      // At end boundary going forward - should jump to start
      const playerAtEndGoingForward = {
        ...boundedPlayer,
        stamp: 0.7, // Exactly at end boundary
        _currentDirection: "forward" as const,
      };
      const jumpedToStart = play(playerAtEndGoingForward, undefined, "forward");
      expect(jumpedToStart.stamp).toBe(0.3); // Jumped to start

      // At start boundary going reverse - should jump to end
      const playerAtStartGoingReverse = {
        ...boundedPlayer,
        stamp: 0.3, // Exactly at start boundary
        _currentDirection: "reverse" as const,
      };
      const jumpedToEnd = play(playerAtStartGoingReverse, undefined, "reverse");
      expect(jumpedToEnd.stamp).toBe(0.7); // Jumped to end
    });

    it("does not jump when outside bounds but not blocked", () => {
      const boundedPlayer = setBounds(player, [0.3, 0.7]);

      // Outside bounds but can make progress toward bounds
      const playerOutsideBounds = {
        ...boundedPlayer,
        stamp: 0.1, // Before bounds
        _currentDirection: "forward" as const,
      };
      const shouldNotJump = play(playerOutsideBounds, undefined, "forward");
      expect(shouldNotJump.stamp).toBe(0.1); // Should stay at current position

      // Going away from bounds - should also not jump
      const playerGoingAway = {
        ...boundedPlayer,
        stamp: 0.1, // Before bounds
        _currentDirection: "reverse" as const, // Going away from bounds
      };
      const shouldAlsoNotJump = play(playerGoingAway, undefined, "reverse");
      expect(shouldAlsoNotJump.stamp).toBe(0.1); // Should stay at current position
    });

    it("handles realistic scenario: outside bounds → enter bounds → respect boundary behavior", () => {
      // Test with bounce + looping enabled
      const bounceLoopPlayer = setBounds(setBounce(setLooping(player, true), true), [0.4, 0.6]);

      // Start outside bounds, going forward toward bounds
      const testPlayer = {
        ...bounceLoopPlayer,
        stamp: 0.2, // Before bounds [0.4, 0.6]
        _currentDirection: "forward" as const,
        running: true,
      };

      // Simulate playing toward bounds - should not jump, just continue
      const startedPlayer = play(testPlayer, undefined, "forward");
      expect(startedPlayer.stamp).toBe(0.2); // Should remain at starting position
      expect(startedPlayer._currentDirection).toBe("forward");

      // Simulate reaching the end boundary
      const playerAtEndBoundary = {
        ...startedPlayer,
        stamp: 0.65, // Past end boundary
      };
      const afterBoundaryHit = update(playerAtEndBoundary, false);
      expect(afterBoundaryHit.stamp).toBe(0.6); // Clamped to boundary
      expect(afterBoundaryHit._currentDirection).toBe("reverse"); // Bounced
      expect(afterBoundaryHit.direction).toBe("forward"); // Original direction preserved
      expect(afterBoundaryHit.running).toBe(true); // Still running due to looping

      // Test loop-only behavior (no bounce) from outside bounds
      const loopOnlyPlayer = setBounds(setBounce(setLooping(player, true), false), [0.3, 0.8]);
      const outsideLoopPlayer = {
        ...loopOnlyPlayer,
        stamp: 0.1, // Before bounds
        _currentDirection: "forward" as const,
        running: true,
      };

      // Should play naturally toward bounds
      const loopStarted = play(outsideLoopPlayer, undefined, "forward");
      expect(loopStarted.stamp).toBe(0.1); // No jump

      // When reaching end boundary, should loop back to start
      const loopPlayerAtEnd = {
        ...loopStarted,
        stamp: 0.85, // Past end boundary
      };
      const afterLoop = update(loopPlayerAtEnd, false);
      expect(afterLoop.stamp).toBe(0.3); // Looped to start of bounds
      expect(afterLoop._currentDirection).toBe("forward"); // Direction unchanged
      expect(afterLoop.running).toBe(true); // Still running
    });

    it("does not jump when starting outside bounds - comprehensive validation", () => {
      // Test the exact scenario: bounds ahead of current stamp, should not jump when starting
      const boundedPlayer = setBounds(setBounce(setLooping(player, true), false), [0.5, 0.8]);

      // Scenario 1: Start before bounds, play forward
      const testPlayer = {
        ...boundedPlayer,
        stamp: 0.2, // Well before bounds [0.5, 0.8]
        _currentDirection: "forward" as const,
        running: false, // Not running yet
      };

      // Start playing - should NOT jump to bounds
      const startedPlayer = play(testPlayer, undefined, "forward");
      expect(startedPlayer.stamp).toBe(0.2); // Should remain at original position
      expect(startedPlayer._currentDirection).toBe("forward");
      expect(startedPlayer.running).toBe(true);

      // Simulate multiple updates as it approaches bounds
      let updatedPlayer = startedPlayer;
      for (let i = 0; i < 5; i++) {
        updatedPlayer = update(updatedPlayer, false);
        // Should gradually move toward bounds, not jump
        expect(updatedPlayer.stamp).toBeGreaterThan(0.2);
        expect(updatedPlayer.stamp).toBeLessThan(0.5); // Not yet at bounds
        expect(updatedPlayer._currentDirection).toBe("forward");
      }

      // Scenario 2: Start after bounds, play reverse
      const reverseTestPlayer = {
        ...boundedPlayer,
        stamp: 0.9, // After bounds [0.5, 0.8]
        _currentDirection: "reverse" as const,
        running: false,
      };

      const startedReverse = play(reverseTestPlayer, undefined, "reverse");
      expect(startedReverse.stamp).toBe(0.9); // Should remain at original position
      expect(startedReverse._currentDirection).toBe("reverse");
      expect(startedReverse.running).toBe(true);

      // Scenario 3: Verify boundary logic only applies when actually crossing bounds
      const crossingPlayer = {
        ...boundedPlayer,
        stamp: 0.85, // Past end boundary, simulating having crossed it
        _currentDirection: "forward" as const,
        running: true,
      };

      const afterCrossing = update(crossingPlayer, false);
      expect(afterCrossing.stamp).toBe(0.5); // Should loop back to start
      expect(afterCrossing._currentDirection).toBe("forward"); // Direction unchanged (no bounce)
      expect(afterCrossing.running).toBe(true); // Still running (looping enabled)
    });

    it("comprehensive test: bounce-once + direction reset after pause", () => {
      // Test both fixes working together
      const bounceOncePlayer = setBounds(setBounce(setLooping(player, false), true), [0.2, 0.8]);

      // Start playing forward
      const testPlayer = {
        ...bounceOncePlayer,
        stamp: 0.5, // In middle of bounds
        direction: "forward" as const,
        _currentDirection: "forward" as const,
        _bounced: false,
        running: false,
      };

      // Start playing
      const startedPlayer = play(testPlayer, undefined, "forward");
      expect(startedPlayer._currentDirection).toBe("forward");
      expect(startedPlayer._bounced).toBe(false);

      // Simulate reaching end boundary - should bounce once
      const playerAtEnd = {
        ...startedPlayer,
        stamp: 0.85, // Past end boundary
        running: true,
      };
      const afterBounce = update(playerAtEnd, false);
      expect(afterBounce.stamp).toBe(0.8); // Clamped to boundary
      expect(afterBounce._currentDirection).toBe("reverse"); // Bounced to reverse
      expect(afterBounce.direction).toBe("forward"); // Base direction unchanged
      expect(afterBounce._bounced).toBe(true); // Bounce state set
      expect(afterBounce.running).toBe(true); // Still running

      // Pause the player while going reverse
      const pausedPlayer = pause(afterBounce);
      expect(pausedPlayer.running).toBe(false);
      expect(pausedPlayer._currentDirection).toBe("reverse"); // Current direction preserved during pause
      expect(pausedPlayer.direction).toBe("forward"); // Base direction preserved

      // Resume - should reset to base direction and reset bounce state
      const resumedPlayer = play(pausedPlayer);
      expect(resumedPlayer.running).toBe(true);
      expect(resumedPlayer._currentDirection).toBe("forward"); // Reset to base direction
      expect(resumedPlayer.direction).toBe("forward"); // Base direction unchanged
      expect(resumedPlayer._bounced).toBe(false); // Bounce state reset

      // Now try to reach end boundary again - should bounce once more (since bounce state was reset)
      const playerAtEndAgain = {
        ...resumedPlayer,
        stamp: 0.85, // Past end boundary again
      };
      const afterSecondBounce = update(playerAtEndAgain, false);
      expect(afterSecondBounce.stamp).toBe(0.8); // Bounced
      expect(afterSecondBounce._currentDirection).toBe("reverse"); // Bounced
      expect(afterSecondBounce._bounced).toBe(true); // Bounce state set again

      // Try to bounce at start boundary - should NOT bounce (already bounced once)
      const playerAtStart = {
        ...afterSecondBounce,
        stamp: 0.15, // Past start boundary
      };
      const afterSecondAttempt = update(playerAtStart, false);
      expect(afterSecondAttempt.stamp).toBe(0.2); // Stopped at boundary
      expect(afterSecondAttempt._currentDirection).toBe("reverse"); // Direction unchanged
      expect(afterSecondAttempt.running).toBe(false); // Stopped (no more bounces allowed)
    });
  });
});
