// Credit to Mugen87 while we wait for this to be added to three.js
// https://github.com/Mugen87/three.js/blob/3a6d8139367e710a3d4fef274d530dda485f1110/examples/jsm/misc/Timer.js

// Raw milliseconds
export type RawTime = number;

/**
 * An interface that represents a timer that can be used to keep track of time in an animation loop.
 * It assumes that the the entire animation length is 1, and the current time (stamp) is represented as a value in the range [0, 1].
 * @param running - whether the timer is running
 * @param _previousTime - the absolute time at the previous update, in milliseconds
 * @param _currentTime - the absolute current time, in milliseconds
 * @param stamp - the current time of the timer, in the range [0, 1]
 * @param timescale - the time multiplier of the timer. A value of 1 corresponds to real-time, and negative values are reversed time
 * @param bounds - the start and end points within the range of 0 to 1 for constrained playback
 * @param playback - the playback mode, either 'loop' or 'reverse'
 * @param viewport - the viewport information
 * @param duration - the duration information
 */
export interface Player {
  // Whether the timer is running
  running: boolean;
  // The absolute time at the previous update, in milliseconds
  _previousTime: RawTime;
  // The absolute current time, in milliseconds
  _currentTime: RawTime;
  // The current time of the timer, in the range [0, 1]
  stamp: number;
  // The time multiplier of the timer. A value of 1 corresponds to real-time
  timescale: number;
  // The start and end points within the range of 0 to 1 for constrained playback
  bounds: [number, number];
  // The playback mode, either 'loop' or 'reverse'
  playback: "loop" | "bounce" | "once";
  // viewport information
  viewport: [number, number];
  // duration information
  duration: number;
}

/**
Creates a copy of the provided timer, but updated with the new timestamp.
@param timer - the timer to be updated
@param stamp - the new timestamp in the range [0, 1]
@returns the updated timer
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
Returns the current time in milliseconds.
@returns the current time in milliseconds
*/
export function now(): RawTime {
  return (typeof performance === "undefined" ? Date : performance).now();
}

/**
Creates a copy of the provided timer, but updated with a new timestamp as determined by
the timestamp since it was last called and the duration of the animation itself.
@param timer - the timer to be updated
@returns the updated timer
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
Sets the bounds for the player.
@param player - the player to be updated
@param bounds - the new bounds in the range [0, 1]
@returns the updated player
*/
export function setBounds(player: Player, bounds: [number, number]): Player {
  const p = { ...player };
  p.bounds = bounds;
  return p;
}

/**
Sets the viewport for the player
@param player - the player to be updated
@param viewport - the new viewport in the range [0, 1]
@returns the updated player
*/
export function setViewport(player: Player, viewport: [number, number]): Player {
  const p = { ...player };
  p.viewport = viewport;
  return p;
}

/**
Creates a copy of the provided timer, but updated with a timescale based on the speed provided.
@param timer - the timer to be updated
@param speed - the speed of playback desired (defaults to 1)
@returns the updated timer
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
Creates a copy of the provided timer, but updated with a timescale of 0 (paused)
@param timer - the timer to be updated
@returns the updated timer
*/
export function pause(player: Player): Player {
  const p = { ...player };
  p.running = false;
  p.timescale = 0;

  return p;
}

/**
Returns the provided player, with the viewport centered around the provided stamp as much as possible.
@param player - the player to be updated
@param stamp - the new stamp to center the viewport around
@returns the updated player
*/
export function seek(player: Player, stamp: number): Player {
  const p = reset(player, stamp);
  p.viewport = getFittedViewport(stamp, p.viewport);
  return p;
}

/**
Returns the provided player, with the duration set to the provided value.
@param player - the player to be updated
@param duration - the new duration
@returns the updated player
*/
export function setDuration(player: Player, duration: number): Player {
  const p = { ...player };
  p.duration = duration;
  return p;
}

/**
Returns a new object that represents a timer with default values.
@returns a new timer
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
