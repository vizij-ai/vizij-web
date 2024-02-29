/*
@description
This function returns a string that represents a numerical value (in milliseconds) as a string in the format "mm:ss:ms".
@param duration - the duration (in milliseconds) to be converted to a string
@return - the duration as a string
*/
export const numberToDurationString = (duration: number): string => {
  let milliseconds: number | string = Math.floor(
    (duration % 1000) / 10,
  ).toString();
  let seconds: number | string = Math.floor((duration / 1000) % 60);
  let minutes: number | string = Math.floor((duration / (1000 * 60)) % 60);

  minutes = minutes < 10 ? `0${minutes}` : minutes;
  seconds = seconds < 10 ? `0${seconds}` : seconds;
  milliseconds = milliseconds.length === 1 ? `0${milliseconds}` : milliseconds;
  //   milliseconds = milliseconds < 10 ? "00" + milliseconds : milliseconds;

  return `${minutes}:${seconds}:${milliseconds}`; //minutes + ":" + seconds + "." + milliseconds;
};
