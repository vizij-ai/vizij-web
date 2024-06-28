// Credit to Mugen87 while we wait for this to be added to three.js
// https://github.com/Mugen87/three.js/blob/3a6d8139367e710a3d4fef274d530dda485f1110/examples/jsm/misc/Timer.js

// Raw milliseconds
export type RawTime = number;

/*
@description
This interface represents a timer that can be used to keep track of time in an animation loop.
It assumes that the the entire animation length is 1, and the current time (stamp) is represented as a value in the range [0, 1].
@field running - whether the timer is running
@field _previousTime - the absolute time at the previous update, in milliseconds
@field _currentTime - the absolute current time, in milliseconds
@field stamp - the current time of the timer, in the range [0, 1]
@field timescale - the time multiplier of the timer. A value of 1 corresponds to real-time, and negative values are reversed time
@field bounds - the start and end points within the range of 0 to 1 for constrained playback
@field playback - the playback mode, either 'loop' or 'reverse'
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
}

/*
@description
This function creates a copy of the provided timer, but updated with the new timestamp.
@param timer - the timer to be updated
@param stamp - the new timestamp in the range [0, 1]
@return - the updated timer
*/
export function reset(player: Player, stamp?: number): Player {
  const nowVal = now();
  player._currentTime = nowVal;
  player._previousTime = nowVal;
  player.stamp = stamp ? stamp : 0;
  return player;
}

/*
@description
This function returns the current time in milliseconds.
@return - the current time in milliseconds
*/
export function now(): RawTime {
  return (typeof performance === "undefined" ? Date : performance).now();
}

/*
@description
This function creates a copy of the provided timer, but updated with a new timestamp as determined by
the timestamp since it was last called and the duration of the animation itself.
@param timer - the timer to be updated
@param duration - the duration of the animation
@return - the updated timer
*/
export function update(player: Player, duration: number): Player {
  player._previousTime = player._currentTime;
  player._currentTime = now();

  // Compute the time delta between the two raw times, multiplied by the timescale
  const delta =
    ((player._currentTime - player._previousTime) * player.timescale) /
    duration;

  // Apply the time delta
  const updatedStamp = player.stamp + delta;

  // Adjust for bounds
  const [start, end] = player.bounds;
  if (updatedStamp > end) {
    if (player.playback === "loop") {
      player.stamp = start;
    } else if (player.playback === "bounce") {
      player.stamp = end;
      player.timescale *= -1;
    } else {
      player.stamp = start;
      player.running = false;
    }
  } else if (updatedStamp < start) {
    if (player.playback === "loop") {
      player.stamp = start;
    } else if (player.playback === "bounce") {
      player.stamp = start;
      player.timescale *= -1;
    } else {
      player.stamp = start;
      player.running = false;
    }
  } else {
    // Otherwise, update the stamp
    player.stamp = updatedStamp;
  }
  return player;
}

/*
@description
This function sets the bounds for the timer.
@param player - the player to be updated
@param bounds - the new bounds in the range [0, 1]
@return - the updated player
*/
export function setBounds(player: Player, bounds: [number, number]): Player {
  player.bounds = bounds;
  return player;
}

/*
@description
This function creates a copy of the provided timer, but updated with a timescale based on the speed provided.
@param timer - the timer to be updated
@param speed - the speed of playback desired (defaults to 1)
@return - the updated timer
*/
export function play(player: Player, speed?: number): Player {
  player.running = true;
  player.timescale = speed ? speed : 1;

  // If playback mode is 'once' and playing again, reset stamp to the beginning of the bounds
  if (player.playback === "once" && player.stamp === player.bounds[1]) {
    player.stamp = player.bounds[0];
  }

  return player;
}

/*
@description
This function creates a copy of the provided timer, but updated with a timescale of 0 (paused)
@param timer - the timer to be updated
@return - the updated timer
*/
export function pause(player: Player): Player {
  player.running = false;
  player.timescale = 0;

  return player;
}

/*
@description
This function returns a new object that represents a timer with default values.
@return - a new timer
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
  };
}
