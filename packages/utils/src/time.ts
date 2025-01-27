/**
 * Converts a duration in milliseconds to a formatted time string.
 *
 * @param duration - The duration in milliseconds to convert
 * @returns A string in the format "mm:ss:ms" where:
 *          - mm: minutes (zero-padded to 2 digits)
 *          - ss: seconds (zero-padded to 2 digits)
 *          - ms: milliseconds (zero-padded to 2 digits)
 *
 * @example
 * ```typescript
 * numberToDurationString(63450) // Returns "01:03:45"
 * numberToDurationString(5000)  // Returns "00:05:00"
 * ```
 */
export const numberToDurationString = (duration: number): string => {
  let milliseconds: number | string = Math.floor((duration % 1000) / 10).toString();
  let seconds: number | string = Math.floor((duration / 1000) % 60);
  let minutes: number | string = Math.floor((duration / (1000 * 60)) % 60);

  minutes = minutes < 10 ? `0${minutes.toString()}` : minutes;
  seconds = seconds < 10 ? `0${seconds.toString()}` : seconds;
  milliseconds = milliseconds.length === 1 ? `0${milliseconds}` : milliseconds;

  return `${minutes.toString()}:${seconds.toString()}:${milliseconds}`;
};
