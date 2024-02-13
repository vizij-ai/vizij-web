// Credit to Mugen87 while we wait for this to be added to three.js
// https://github.com/Mugen87/three.js/blob/3a6d8139367e710a3d4fef274d530dda485f1110/examples/jsm/misc/Timer.js

class Timer {

	running: boolean;
    _previousTime: number;
    _currentTime: number;
    _delta: number;
    _elapsed: number;
    _timescale: number;
    _useFixedDelta: boolean;
    _fixedDelta: number;
    _usePageVisibilityAPI: boolean;
    _pageVisibilityHandler: () => void;

    /**
     * A timer utility class.
     * @param {Boolean|undefined} useFixedDelta - If set, the delta value is fixed.
     * @param {Number|undefined} fixedDelta - The fixed delta value.
     * @param {Number|undefined} timescale - A time multiplier.
    **/

	constructor(useFixedDelta: boolean|undefined, fixedDelta:number|undefined, timescale:number|undefined) {

		this.running = false;
		this._previousTime = 0;
		this._currentTime = 0;

		this._delta = 0;
		this._elapsed = 0;

		this._timescale = timescale || 0;

		this._useFixedDelta = useFixedDelta || false;
		this._fixedDelta = fixedDelta || 16.67; // ms, corresponds to approx. 60 FPS

		// use Page Visibility API to avoid large time delta values

		this._usePageVisibilityAPI = ( typeof document !== 'undefined' && document.hidden !== undefined );

		if ( this._usePageVisibilityAPI === true ) {

			this._pageVisibilityHandler = handleVisibilityChange.bind( this );

			document.addEventListener( 'visibilitychange', this._pageVisibilityHandler, false );

		} else {
            this._pageVisibilityHandler = () => {};
        }

	}

	disableFixedDelta() {

		this._useFixedDelta = false;

		return this;

	}

	dispose() {

		if ( this._usePageVisibilityAPI === true ) {

			document.removeEventListener( 'visibilitychange', this._pageVisibilityHandler );

		}

		return this;

	}

	enableFixedDelta() {

		this._useFixedDelta = true;

		return this;

	}

	getDelta() {

		return this._delta / 1000;

	}

	getElapsed() {

		return this._elapsed / 1000;

	}

	getFixedDelta() {

		return this._fixedDelta / 1000;

	}

	getTimescale() {

		return this._timescale;

	}

	reset() {

		this._currentTime = this._now();

		return this;

	}

	setFixedDelta( fixedDelta: number ) {

		this._fixedDelta = fixedDelta * 1000;

		return this;

	}

	setTimescale( timescale: number ) {

		this._timescale = timescale;
		if (timescale > 0) {
			this.running = true;
		} else {
			this.running = false;
		}

		return this;

	}

	update() {

		if ( this._useFixedDelta === true ) {

			this._delta = this._fixedDelta;

		} else {

			this._previousTime = this._currentTime;
			this._currentTime = this._now();

			this._delta = this._currentTime - this._previousTime;

		}

		this._delta *= this._timescale;

		this._elapsed += this._delta; // _elapsed is the accumulation of all previous deltas

		return this;

	}

	// High-Level API

	// Start the timer
	play(speed?: number) {
		this.setTimescale(speed ? speed : 1)
		this.running = true;
	}

	// Pause the timer
	pause() {
		this.setTimescale(0);
		this.running = false;
	}

	// Restart the timer
	restart(time?: number) {
		this._elapsed = time ? time * 1000 : 0;
	}

	// private

	_now() {

		return ( typeof performance === 'undefined' ? Date : performance ).now();

	}

	toJSON() {
		return {
			timescale: this._timescale
		}
	}

	fromJson({timescale=1}) {
		return new Timer(undefined, undefined, timescale);
	}

}

function handleVisibilityChange(this: Timer) {
	if ( document.hidden === false ) this.reset();
}

export { Timer };