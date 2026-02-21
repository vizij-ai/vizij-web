export interface LatestTokenQueue {
  request: (token: number) => void;
  dispose: () => void;
}

/**
 * Runs at most one async task at a time while coalescing queued work to the
 * highest token requested during an in-flight run.
 */
export function createLatestTokenQueue(
  run: (token: number) => Promise<void>,
): LatestTokenQueue {
  let disposed = false;
  let inFlight = false;
  let queuedToken: number | null = null;
  let lastCompletedToken = -1;

  const maybeRun = () => {
    if (disposed || inFlight || queuedToken === null) {
      return;
    }
    const token = queuedToken;
    queuedToken = null;
    if (token <= lastCompletedToken) {
      maybeRun();
      return;
    }

    inFlight = true;
    void run(token)
      .then(() => {
        if (token > lastCompletedToken) {
          lastCompletedToken = token;
        }
      })
      .finally(() => {
        inFlight = false;
        maybeRun();
      });
  };

  return {
    request(token: number) {
      if (disposed || token <= lastCompletedToken) {
        return;
      }
      queuedToken = queuedToken === null ? token : Math.max(queuedToken, token);
      maybeRun();
    },
    dispose() {
      disposed = true;
      queuedToken = null;
    },
  };
}
