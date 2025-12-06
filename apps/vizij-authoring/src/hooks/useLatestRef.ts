import { useEffect, useRef } from "react";

/**
 * Keeps a mutable ref synchronized with the latest value without re-rendering.
 * Useful when async flows need the freshest value but only have access to refs.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
