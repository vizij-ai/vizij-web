/*
@description
This function takes in the framerate, completion, and count of an animation and returns the closest frame
(as a percentage of the whole animation's duration).
@param completion: number - the completion of the animation from 0 to 1
@param count: number - the number of frames in the animation
@returns: number - the closest frame number to the completion
*/
function closestFrame(completion: number, count: number): number {
  const frameIdx = Math.round(completion * count);
  return frameIdx / count;
}

export { closestFrame };
