import { useRef } from "react";
import deepEqual from "deep-equal";

export function useDeepSelector<S, U>(selector: (state: S) => U): (state: S) => U {
  const prev = useRef<U>();

  return (state) => {
    const next = selector(state);
    return deepEqual(prev.current, next) ? (prev.current as U) : (prev.current = next);
  };
}

export function useDeep<V, D>(initializer: () => V, dependencies: D[]): V {
  const prevValue = useRef<V>();
  const prevDependencies = useRef<D[]>([]);

  return deepEqual(prevDependencies.current, dependencies)
    ? (prevValue.current as V)
    : (prevValue.current = initializer());
}
