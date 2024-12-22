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
export interface ProgressiveResult<T, E = Error> {
  result?: Result<T, E>;
  progress: Progress;
}

/**
 * Composes multiple progressive results into a single progressive result containing an array of results.
 *
 * @remarks
 * This function handles both array and single item progressive results, combining them into a unified result
 * while maintaining progress information. It can optionally filter and order results based on expected IDs.
 *
 * @typeparam T - Type of the result items, must contain an 'id' string property
 *
 * @param progressiveResults - Array of progressive results to compose
 * @param expectedIds - Optional array of IDs to filter and order the results
 *
 * @returns A ProgressiveResult containing an array of results (or undefined values)
 * where:
 * - If any input result is an error, returns an error result
 * - If expectedIds is provided, returns results ordered by the expected IDs
 * - If expectedIds is provided and not all IDs are found when progress is complete, returns an error
 * - Otherwise returns all results combined into an array
 */
export function composeProgressiveResult<T extends { id: string }>(
  progressiveResults: ProgressiveResult<T[] | T | undefined | null>[],
  expectedIds?: string[],
): ProgressiveResult<(T | undefined | null)[]> {
  const fullProgress = composeProgress(progressiveResults.map((pr) => pr.progress));
  let fullResult: Result<(T | undefined | null)[]>;
  if (progressiveResults.some((res) => res.result?.isErr() ?? true)) {
    fullResult = Result.ErrFromStr("There was an error");
  } else {
    const metas: (T | undefined | null)[] = progressiveResults.flatMap((res) => {
      const innerRes = res.result?.unwrap();
      if (Array.isArray(innerRes)) return innerRes;
      return [innerRes];
    });

    if (expectedIds) {
      const data = expectedIds.map((id) => metas.find((m) => "id" in (m || {}) && m?.id === id));
      if (
        fullProgress.current >= fullProgress.total &&
        data.some((m) => m === undefined || m === null)
      ) {
        fullResult = Result.ErrFromStr("Some documents not found");
      } else {
        fullResult = Result.Ok(data);
      }
    } else {
      fullResult = Result.Ok(metas);
    }
  }
  return { result: fullResult, progress: fullProgress };
}
