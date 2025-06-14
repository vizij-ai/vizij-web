/**
 * Time representation in milliseconds.
 */
export type RawTime = number;

/**
 * A timer implementation for managing animation playback.
 *
 * The timer operates on a normalized time range of [0, 1], where:
 * - 0 represents the start of the animation
 * - 1 represents the end of the animation
 *
 * @property running - Whether the timer is actively running
 * @property _previousTime - The last update time in milliseconds
 * @property _currentTime - The current time in milliseconds
 * @property stamp - Current normalized time position [0, 1]
 * @property speed - Playback speed multiplier (always positive)
 * @property direction - Initial playback direction ("forward" or "reverse")
 * @property _currentDirection - Current actual movement direction during bouncing
 * @property bounds - Constrains playback to a [start, end] range within [0, 1]
 * @property bounce - Whether to reverse direction when reaching bounds
 * @property looping - Whether to continue playing after reaching bounds
 * @property viewport - Visible time range as [start, end] within [0, 1]
 * @property duration - Total animation duration in milliseconds
 */
export interface Player {
  running: boolean;
  _previousTime: RawTime;
  _currentTime: RawTime;
  stamp: number;
  speed: number;
  direction: "forward" | "reverse";
  _currentDirection: "forward" | "reverse";
  _bounced: boolean;
  bounds: [number, number];
  bounce: boolean;
  looping: boolean;
  viewport: [number, number];
  duration: number;
}

/**
 * Creates a copy of the provided timer, but updated with the new timestamp.
 * @param timer - the timer to be updated
 * @param stamp - the new timestamp in the range [0, 1]
 * @returns the updated timer
 */
export function reset(player: Player, stamp?: number): Player {
  const p = { ...player };
  const nowVal = now();
  p._currentTime = nowVal;
  p._previousTime = nowVal;
  p.stamp = stamp ? stamp : 0;
  p._currentDirection = p.direction;
  p._bounced = false;
  return p;
}

/**
 * Returns the current time in milliseconds.
 * @returns the current time in milliseconds
 */
export function now(): RawTime {
  return (typeof performance === "undefined" ? Date : performance).now();
}

/**
 * Creates a copy of the provided timer, but updated with a new timestamp as determined by
 * the timestamp since it was last called and the duration of the animation itself.
 * @param timer - the timer to be updated
 * @returns the updated timer
 */
export function update(player: Player, coldStart: boolean): Player {
  const p = { ...player };
  const duration = p.duration;

  const t = now();
  p._previousTime = coldStart ? t : p._currentTime;
  p._currentTime = t;

  const currentViewportCenter = (p.viewport[1] + p.viewport[0]) / 2;
  const nearViewportCenterCurrent = Math.abs(p.stamp - currentViewportCenter) < 0.01;

  // Calculate effective timescale from speed and current direction
  const effectiveTimescale = p.speed * (p._currentDirection === "forward" ? 1 : -1);

  // Compute the time delta between the two raw times, multiplied by the effective timescale
  const delta = ((p._currentTime - p._previousTime) * effectiveTimescale) / duration;

  // Apply the time delta
  const updatedStamp = p.stamp + delta;
  const [start, end] = p.bounds;

  let attachOverride = false;

  // Check if player is moving toward the bounded region
  const movingTowardBounds =
    (p.stamp < start && p._currentDirection === "forward") ||
    (p.stamp > end && p._currentDirection === "reverse");

  // Apply boundary logic when crossing boundaries, unless moving toward bounds from outside
  if (updatedStamp > end) {
    if (movingTowardBounds) {
      // Player is outside bounds moving toward them - allow natural movement
      p.stamp = updatedStamp;
    } else {
      // Player is crossing out of bounds or moving further away - apply boundary logic
      if (p.bounce && (p.looping || !p._bounced)) {
        // Bounce: reverse current direction and clamp to boundary
        p.stamp = end;
        p._currentDirection = p._currentDirection === "forward" ? "reverse" : "forward";
        p._bounced = true;
      } else if (p.looping) {
        // Loop without bounce: return to start
        p.stamp = start;
      } else {
        // No loop, no bounce: stop at boundary
        p.stamp = end;
        p.running = false;
      }
      attachOverride = true;
    }
  } else if (updatedStamp < start) {
    if (movingTowardBounds) {
      // Player is outside bounds moving toward them - allow natural movement
      p.stamp = updatedStamp;
    } else {
      // Player is crossing out of bounds or moving further away - apply boundary logic
      if (p.bounce && (p.looping || !p._bounced)) {
        // Bounce: reverse current direction and clamp to boundary
        p.stamp = start;
        p._currentDirection = p._currentDirection === "forward" ? "reverse" : "forward";
        p._bounced = true;
      } else if (p.looping) {
        // Loop without bounce: return to end
        p.stamp = end;
      } else {
        // No loop, no bounce: stop at boundary
        p.stamp = start;
        p.running = false;
      }
      attachOverride = true;
    }
  } else {
    // Normal movement within or entering bounds
    p.stamp = updatedStamp;
  }

  const newNearViewportCenter = Math.abs(p.stamp - currentViewportCenter) < 0.01;

  if (p.running && (nearViewportCenterCurrent || newNearViewportCenter || attachOverride)) {
    p.viewport = getFittedViewport(p.stamp, p.viewport);
  } else if (p.running && !newNearViewportCenter) {
    // Give the current stamp a bit of oomph with the delta to make it move towards the goal faster.
    const oomphOffset = currentViewportCenter < p.stamp ? delta : 0;
    const idealViewport = getFittedViewport(p.stamp + oomphOffset, p.viewport);
    p.viewport = [
      p.viewport[0] * 0.6 + idealViewport[0] * 0.4,
      p.viewport[1] * 0.6 + idealViewport[1] * 0.4,
    ];
  }

  return p;
}

/**
 * Sets the bounds for the player.
 * @param player - the player to be updated
 * @param bounds - the new bounds in the range [0, 1]
 * @returns the updated player
 */
export function setBounds(player: Player, bounds: [number, number]): Player {
  const p = { ...player };
  p.bounds = bounds;
  return p;
}

/**
 * Sets the viewport for the player
 * @param player - the player to be updated
 * @param viewport - the new viewport in the range [0, 1]
 * @returns the updated player
 */
export function setViewport(player: Player, viewport: [number, number]): Player {
  const p = { ...player };
  p.viewport = viewport;
  return p;
}

/**
 * Creates a copy of the provided timer, but updated with speed and direction.
 * @param timer - the timer to be updated
 * @param speed - the speed of playback desired (defaults to current speed)
 * @param direction - the direction of playback desired (defaults to current direction)
 * @returns the updated timer
 */
export function play(player: Player, speed?: number, direction?: "forward" | "reverse"): Player {
  const p = { ...player };
  p.running = true;
  if (speed !== undefined) p.speed = Math.abs(speed); // Ensure speed is positive
  if (direction !== undefined) {
    p.direction = direction;
  }
  // Always reset current direction to match direction when starting playback
  p._currentDirection = p.direction;
  p._bounced = false; // Reset bounce state when starting

  // If not looping and not bouncing, reset stamp to the appropriate bound when starting
  if (!p.looping && !p.bounce) {
    if (p.direction === "forward" && p.stamp === p.bounds[1]) {
      p.stamp = p.bounds[0];
    } else if (p.direction === "reverse" && p.stamp === p.bounds[0]) {
      p.stamp = p.bounds[1];
    }
  }

  // Only jump to opposite boundary if we're AT a boundary that blocks further progress in the current direction
  // This allows playing from outside bounds toward the bounds naturally
  const tolerance = 0.001; // Small tolerance for floating point comparison

  // If going forward and we're exactly at the end boundary, jump to start
  if (p._currentDirection === "forward" && Math.abs(p.stamp - p.bounds[1]) <= tolerance) {
    p.stamp = p.bounds[0];
  }
  // If going reverse and we're exactly at the start boundary, jump to end
  else if (p._currentDirection === "reverse" && Math.abs(p.stamp - p.bounds[0]) <= tolerance) {
    p.stamp = p.bounds[1];
  }
  // Otherwise, don't jump - let it play naturally from current position toward/through bounds

  return p;
}

/**
 * Creates a copy of the provided timer, but paused
 * @param timer - the timer to be updated
 * @returns the updated timer
 */
export function pause(player: Player): Player {
  const p = { ...player };
  p.running = false;

  return p;
}

/**
 * Returns the provided player, with the viewport centered around the provided stamp as much as possible.
 * @param player - the player to be updated
 * @param stamp - the new stamp to center the viewport around
 * @returns the updated player
 */
export function seek(player: Player, stamp: number): Player {
  const p = reset(player, stamp);
  p.viewport = getFittedViewport(stamp, p.viewport);
  return p;
}

/**
 * Returns the provided player, with the duration set to the provided value.
 * @param player - the player to be updated
 * @param duration - the new duration
 * @returns the updated player
 */
export function setDuration(player: Player, duration: number): Player {
  const p = { ...player };
  p.duration = duration;
  return p;
}

/**
 * Creates a new Player instance with default values.
 *
 * @returns A new Player instance initialized with:
 * - Not running
 * - Current timestamp
 * - Zero stamp position
 * - Normal speed (1x)
 * - Forward direction
 * - Full bounds [0, 1]
 * - Looping enabled, bounce disabled
 * - Full viewport [0, 1]
 * - 1000ms duration
 */
export function newPlayer(): Player {
  return {
    running: false,
    _previousTime: now(),
    _currentTime: now(),
    stamp: 0,
    speed: 1,
    direction: "forward",
    _currentDirection: "forward",
    _bounced: false,
    bounds: [0, 1],
    bounce: false,
    looping: true,
    viewport: [0, 1],
    duration: 1000,
  };
}

/**
 * Adjusts the proposed viewport to ensure it fits within the bounds [0, 1].
 *
 * @param playhead - The current position within the range [0, 1].
 * @param proposedViewport - The proposed viewport as a tuple [start, end].
 * @returns A tuple representing the adjusted viewport [start, end] that fits within the bounds [0, 1].
 */
const getFittedViewport = (
  playhead: number,
  proposedViewport: [number, number],
): [number, number] => {
  const viewportWidth = proposedViewport[1] - proposedViewport[0];
  const proposedLeft = playhead - viewportWidth / 2;
  const proposedRight = playhead + viewportWidth / 2;
  if (proposedLeft >= 0 && proposedRight <= 1) {
    return [playhead - viewportWidth / 2, playhead + viewportWidth / 2];
  } else if (proposedLeft < 0) {
    return [0, viewportWidth];
  } else {
    return [1 - viewportWidth, 1];
  }
};

/**
 * Sets the playback speed without affecting direction.
 * @param player - the player to be updated
 * @param speed - the new speed (always positive)
 * @returns the updated player
 */
export function setSpeed(player: Player, speed: number): Player {
  const p = { ...player };
  p.speed = Math.abs(speed); // Ensure speed is positive
  return p;
}

/**
 * Sets the playback direction without affecting speed.
 * @param player - the player to be updated
 * @param direction - the new direction
 * @returns the updated player
 */
export function setDirection(player: Player, direction: "forward" | "reverse"): Player {
  const p = { ...player };
  p.direction = direction;
  p._currentDirection = direction; // Also update current direction
  p._bounced = false; // Reset bounce state when direction changes
  return p;
}

/**
 * Reverses the current playback direction.
 * @param player - the player to be updated
 * @returns the updated player
 */
export function reverse(player: Player): Player {
  const p = { ...player };
  const newDirection = p.direction === "forward" ? "reverse" : "forward";
  p.direction = newDirection;
  p._currentDirection = newDirection;
  p._bounced = false; // Reset bounce state when direction changes
  return p;
}

/**
 * Gets the effective timescale (speed * direction multiplier) for backwards compatibility.
 * @param player - the player to get timescale from
 * @returns the effective timescale
 * @deprecated Use speed and _currentDirection properties instead
 */
export function getTimescale(player: Player): number {
  return player.speed * (player._currentDirection === "forward" ? 1 : -1);
}

/**
 * Sets the bounce behavior for the player.
 * @param player - the player to be updated
 * @param bounce - whether to bounce at boundaries
 * @returns the updated player
 */
export function setBounce(player: Player, bounce: boolean): Player {
  const p = { ...player };
  p.bounce = bounce;
  return p;
}

/**
 * Sets the looping behavior for the player.
 * @param player - the player to be updated
 * @param looping - whether to loop at boundaries
 * @returns the updated player
 */
export function setLooping(player: Player, looping: boolean): Player {
  const p = { ...player };
  p.looping = looping;
  return p;
}
