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
 * @property timescale - Playback speed multiplier (negative for reverse)
 * @property bounds - Constrains playback to a [start, end] range within [0, 1]
 * @property playback - Animation behavior at bounds ("loop"|"bounce"|"once")
 * @property viewport - Visible time range as [start, end] within [0, 1]
 * @property duration - Total animation duration in milliseconds
 */
export interface Player {
  running: boolean;
  _previousTime: RawTime;
  _currentTime: RawTime;
  stamp: number;
  timescale: number;
  bounds: [number, number];
  playback: "loop" | "bounce" | "once";
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

  const currentInBounds = p.stamp >= p.bounds[0] && p.stamp <= p.bounds[1];
  const currentViewportCenter = (p.viewport[1] + p.viewport[0]) / 2;
  const nearViewportCenterCurrent = Math.abs(p.stamp - currentViewportCenter) < 0.01;

  // Compute the time delta between the two raw times, multiplied by the timescale
  const delta = ((p._currentTime - p._previousTime) * p.timescale) / duration;

  // Apply the time delta
  const updatedStamp = p.stamp + delta;
  const [start, end] = currentInBounds ? p.bounds : [0, 1];

  let attachOverride = false;

  // If the updated stamp is past the viewport center (depending on the direction of playback),
  // but still in the viewport, then adjust the viewport to center around the updated stamp.

  // Adjust for bounds
  if (updatedStamp > end) {
    if (p.playback === "loop") {
      p.stamp = start;
    } else if (p.playback === "bounce") {
      p.stamp = end;
      p.timescale *= -1;
    } else {
      p.stamp = start;
      p.running = false;
    }
    attachOverride = true;
  } else if (currentInBounds && updatedStamp < start) {
    if (p.playback === "loop") {
      p.stamp = start;
      if (p.timescale < 0) {
        // p.timescale = -1 * p.timescale;
        p.running = false;
      }
    } else if (p.playback === "bounce") {
      p.stamp = start;
      p.timescale *= -1;
    } else {
      p.stamp = start;
      p.running = false;
    }
    attachOverride = true;
  } else {
    p.stamp = updatedStamp;
  }

  const newNearViewportCenter = Math.abs(p.stamp - currentViewportCenter) < 0.01;
  const boundsInsideViewport = p.viewport[0] <= p.bounds[0] || p.viewport[1] >= p.bounds[1];

  if (
    p.running &&
    !boundsInsideViewport &&
    (nearViewportCenterCurrent || newNearViewportCenter || attachOverride)
  ) {
    p.viewport = getFittedViewport(p.stamp, p.viewport);
  } else if (p.running && !boundsInsideViewport && !newNearViewportCenter) {
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
 * Creates a copy of the provided timer, but updated with a timescale based on the speed provided.
 * @param timer - the timer to be updated
 * @param speed - the speed of playback desired (defaults to 1)
 * @returns the updated timer
 */
export function play(player: Player, speed?: number): Player {
  const p = { ...player };
  p.running = true;
  p.timescale = speed ?? 1;

  // If playback mode is 'once' and playing again, reset stamp to the beginning of the bounds
  if (p.playback === "once" && p.stamp === p.bounds[1]) {
    p.stamp = p.bounds[0];
  }

  return p;
}

/**
 * Creates a copy of the provided timer, but updated with a timescale of 0 (paused)
 * @param timer - the timer to be updated
 * @returns the updated timer
 */
export function pause(player: Player): Player {
  const p = { ...player };
  p.running = false;
  p.timescale = 0;

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
 * - No timescale
 * - Full bounds [0, 1]
 * - Loop playback
 * - Full viewport [0, 1]
 * - 1000ms duration
 */
export function newPlayer(): Player {
  return {
    running: false,
    _previousTime: now(),
    _currentTime: now(),
    stamp: 0,
    timescale: 0,
    bounds: [0, 1],
    playback: "loop",
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
