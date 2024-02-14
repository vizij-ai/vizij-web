export const numberToDurationString = (duration: number): string => {
  var milliseconds: number | string = Math.floor((duration % 1000) / 10).toString();
  var seconds: number | string = Math.floor((duration / 1000) % 60);
  var minutes: number | string = Math.floor((duration / (1000 * 60)) % 60);

  minutes = minutes < 10 ? "0" + minutes : minutes;
  seconds = seconds < 10 ? "0" + seconds : seconds;
  milliseconds = milliseconds.length === 1 ? "0" + milliseconds : milliseconds;
//   milliseconds = milliseconds < 10 ? "00" + milliseconds : milliseconds;

  return minutes + ":" + seconds + "." + milliseconds;
};
