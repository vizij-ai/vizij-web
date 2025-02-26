import { useState, useEffect } from "react";

/**
 * A hook that delays the nullification of a boolean state value.
 *
 * Useful for maintaining hover states or other temporary UI states
 * for a specified duration after the triggering condition becomes false.
 *
 * @param value - The current boolean state value
 * @param timeout - The delay duration in milliseconds
 * @returns The delayed boolean state value
 *
 * @example
 * ```typescript
 * const isHoveredWithDelay = useLazy(isHovered, 500);
 * ```
 */
export function useLazy(value: boolean, timeout: number): boolean {
  const [lazy, setLazy] = useState(value);
  const [timeoutValue, setTimeoutValue] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (value) {
      setLazy(value);
      if (timeoutValue) {
        clearTimeout(timeoutValue);
      }
    } else {
      const timer = setTimeout(() => {
        setLazy(value);
        setTimeoutValue(timer);
      }, timeout);
      return () => {
        if (timeoutValue) {
          clearTimeout(timeoutValue);
        }
      };
    }
  }, [value, timeout, timeoutValue]);

  return lazy;
}
