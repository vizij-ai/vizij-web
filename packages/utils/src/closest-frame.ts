/**
 * Takes in the completion percentage and the total number of frames in an animation,
 * and returns the closest frame as a percentage of the whole animation's duration.
 *
 * @param completion - The completion of the animation from 0 to 1.
 * @param count - The number of frames in the animation.
 * @returns The closest frame number to the completion as a percentage of the total frames.
 */
function closestFrame(completion: number, count: number): number {
  const frameIdx = Math.round(completion * count);
  return frameIdx / count;
}

export { closestFrame };
