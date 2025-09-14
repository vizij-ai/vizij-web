import { useRef } from "react";
import deepEqual from "deep-equal";

/**
 * Creates a memoized selector function that only updates when the selected value
 * deeply changes.
 *
 * @param selector - A function that selects a value from the state
 * @returns A memoized selector function that returns the same reference if the
 *          selected value hasn't deeply changed
 *
 * @example
 * ```typescript
 * const selectUserData = useDeepSelector((state) => state.user.data);
 * const userData = selectUserData(state);
 * ```
 */
export function useDeepSelector<S, U>(
  selector: (state: S) => U,
): (state: S) => U {
  const prev = useRef<U>();

  return (state) => {
    const next = selector(state);
    return deepEqual(prev.current, next)
      ? (prev.current as U)
      : (prev.current = next);
  };
}

/**
 * Similar to useMemo, but performs a deep comparison of dependencies instead of
 * reference equality.
 *
 * @param initializer - Function that returns the value to be memoized
 * @param dependencies - Array of dependencies that trigger recalculation when deeply changed
 * @returns The memoized value
 *
 * @example
 * ```typescript
 * const memoizedValue = useDeep(
 *   () => expensiveCalculation(obj),
 *   [obj]
 * );
 * ```
 */
export function useDeep<V, D>(initializer: () => V, dependencies: D[]): V {
  const prevValue = useRef<V>();
  const prevDependencies = useRef<D[]>([]);

  return deepEqual(prevDependencies.current, dependencies)
    ? (prevValue.current as V)
    : (prevValue.current = initializer());
}
