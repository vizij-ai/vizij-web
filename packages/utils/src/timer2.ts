// Credit to Mugen87 while we wait for this to be added to three.js
// https://github.com/Mugen87/three.js/blob/3a6d8139367e710a3d4fef274d530dda485f1110/examples/jsm/misc/Timer.js

// Raw milliseconds
export type RawTime = number;

export type Timer = {
	// Whether the timer is running
	running: boolean;
	// The absolute time at the previous update, in milliseconds
	_previousTime: RawTime;
	// The absolute current time, in milliseconds
	_currentTime: RawTime;
	// The duration of the timer, in milliseconds
	duration?: number;
	// The current time of the timer, in milliseconds
	time: number;
	// The time multiplier of the timer. A value of 1 corresponds to real-time
	timescale: number;
}

export function resetTimer(timer: Timer, time?: number) {
	timer._currentTime = now();
	if (time && timer.timescale !== 0) {
		// Compute the previous time based on the current time, the timescale, and the given time
		timer._previousTime = timer._currentTime - time / timer.timescale;
	}
	return updateTimer(timer);
}

export function now(): RawTime {
	return ( typeof performance === 'undefined' ? Date : performance ).now();
}

export function updateTimer(timer: Timer) {
	timer._previousTime = timer._currentTime;
	timer._currentTime = now();

	// Compute the time delta between the two raw times, multiplied by the timescale
	const delta = (timer._currentTime - timer._previousTime) * timer.timescale;
	
	// Apply the time delta
	const updatedTime = timer.time + delta;

	if (timer.duration && updatedTime > timer.duration) {
		// If the updated time exceeds the duration, reset the timer
		timer.time = updatedTime % timer.duration;
	} else {
		// Otherwise, update the time
		timer.time = updatedTime;
	}

	return timer;
}

export function playTimer(timer: Timer, speed?: number) {
	timer.running = true;
	timer.timescale = speed ? speed : 1;

	return timer;
}

export function pauseTimer(timer: Timer) {
	timer.running = false;
	timer.timescale = 0;

	return timer;
}

export function newTimer(duration?: number): Timer {
	return {
		running: false,
		_previousTime: now(),
		_currentTime: now(),
		time: 0,
		timescale: 0,
		duration
	};
}