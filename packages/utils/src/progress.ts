import { Result } from "./result";

/**
 * Represents some progress towards a goal, and bring an optional message along.
 * Avoids having to depend on the DOM's ProgressEvent.
 * If `total` is 0 the progress is indeterminate, and it is impossible to assess completeness.
 */
export interface Progress {
  current: number;
  total: number;
  message?: string;
}

/**
 * Creates and updated progress object by adding the given increment, and updating the message.
 * @param progress - The progress object to update.
 * @param increment - The amount to increment the progress by. Default is 1.
 * @param message - The message to set on the progress object. Default is undefined.
 * @returns The new progress object.
 */
export function incrementProgress(progress: Progress, message?: string, increment = 1): Progress {
  return {
    ...progress,
    current: progress.current + increment,
    message: message ?? progress.message,
  };
}

/**
 * Sums the given progresses into a single progress object.
 * @param progresses - A collection of progresses.
 * @returns A new progress which is the sum of all the given progresses.
 */
export function composeProgress(progresses: Progress[]): Progress {
  let current = 0;
  let total = 0;
  let message = "";

  progresses.forEach((progress) => {
    current += progress.current;
    total += progress.total;
    if (progress.message) {
      message += `${progress.message}\n`;
    }
  });
  message = message.trim();

  return { current, total, message };
}

/**
 * Represents a result that can either be a success or a failure, with an associated progress.
 * Until result is defined, the operation is still pending.
 */
export interface PendingResultWithProgress<T, E = Error> {
  result?: Result<T, E>;
  progress: Progress;
}
