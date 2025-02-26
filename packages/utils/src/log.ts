/**
 * Logs a message to the console.
 *
 * @param value - The message to be logged
 *
 * @remarks
 * This function temporarily disables ESLint console warnings for testing purposes.
 */
export function log(value: string): void {
  /* eslint-disable no-console -- this specifically tests logging */
  console.log(value);
  /* eslint-enable no-console -- turn back on after test */
}
