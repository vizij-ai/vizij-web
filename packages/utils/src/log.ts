/*
@description
This function logs a string to the console.
@param value - the string to be logged
@return - void
*/
export function log(value: string): void {
  /* eslint-disable no-console -- this specifically tests logging */
  console.log(value);
  /* eslint-enable no-console -- turn back on after test */
}
