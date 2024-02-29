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
*/
export interface Timer {
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
}

/*
@description
This function creates a copy of the provided timer, but updated with the new timestamp.
@param timer - the timer to be updated
@param stamp - the new timestamp in the range [0, 1]
@return - the updated timer
*/
export function resetTimer(timer: Timer, stamp?: number): Timer {
  const nowVal = now();
  timer._currentTime = nowVal;
  timer._previousTime = nowVal;
  timer.stamp = stamp ? stamp : 0;
  return timer;
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
export function updateTimer(timer: Timer, duration: number): Timer {
  timer._previousTime = timer._currentTime;
  timer._currentTime = now();

  // Compute the time delta between the two raw times, multiplied by the timescale
  const delta =
    ((timer._currentTime - timer._previousTime) * timer.timescale) / duration;

  // Apply the time delta
  const updatedStamp = timer.stamp + delta;

  if (duration && updatedStamp > 1) {
    // If the updated time exceeds the duration, reset the timer
    timer.stamp = updatedStamp - 1;
  } else if (duration && updatedStamp < 0) {
    // If the updated time is negative, reset the timer
    timer.stamp = 1 - updatedStamp;
  } else {
    // Otherwise, update the time
    timer.stamp = updatedStamp;
  }

  // console.log("timer.stamp", timer.stamp)

  return timer;
}

/*
@description
This function creates a copy of the provided timer, but updated with a timescale based on the speed provided.
@param timer - the timer to be updated
@param speed - the speed of playback desired (defaults to 1)
@return - the updated timer
*/
export function playTimer(timer: Timer, speed?: number): Timer {
  timer.running = true;
  timer.timescale = speed ? speed : 1;

  return timer;
}

/*
@description
This function creates a copy of the provided timer, but updated with a timescale of 0 (paused)
@param timer - the timer to be updated
@return - the updated timer
*/
export function pauseTimer(timer: Timer): Timer {
  timer.running = false;
  timer.timescale = 0;

  return timer;
}

/*
@description
This function returns a new object that represents a timer with default values.
@return - a new timer
*/
export function newTimer(): Timer {
  return {
    running: false,
    _previousTime: now(),
    _currentTime: now(),
    stamp: 0,
    timescale: 0,
  };
}
