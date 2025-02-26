import { useRef } from "react";
import deepEqual from "deep-equal";

export function useDeep<S, U>(selector: (state: S) => U): (state: S) => U {
  const prev = useRef<U>();

  return (state) => {
    const next = selector(state);
    return deepEqual(prev.current, next) ? (prev.current as U) : (prev.current = next);
  };
}
