// Credit to Mugen87 while we wait for this to be added to three.js
// https://github.com/Mugen87/three.js/blob/3a6d8139367e710a3d4fef274d530dda485f1110/examples/jsm/misc/Timer.js

// Raw milliseconds
export type RawTime = number;

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

export function resetTimer(timer: Timer, time?: number): Timer {
  const nowVal = now();
  timer._currentTime = nowVal;
  timer._previousTime = nowVal;
  timer.stamp = time ? time : 0;
  return timer;
}

export function now(): RawTime {
  return (typeof performance === 'undefined' ? Date : performance).now();
}

export function updateTimer(timer: Timer, duration: number): Timer {
  timer._previousTime = timer._currentTime;
  timer._currentTime = now();

  // Compute the time delta between the two raw times, multiplied by the timescale
  const delta = ((timer._currentTime - timer._previousTime) * timer.timescale) / duration;

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

export function playTimer(timer: Timer, speed?: number): Timer {
  timer.running = true;
  timer.timescale = speed ? speed : 1;

  return timer;
}

export function pauseTimer(timer: Timer): Timer {
  timer.running = false;
  timer.timescale = 0;

  return timer;
}

export function newTimer(): Timer {
  return {
    running: false,
    _previousTime: now(),
    _currentTime: now(),
    stamp: 0,
    timescale: 0
  };
}
