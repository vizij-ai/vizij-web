import { useState, useEffect, useRef } from "react";

export function useDelayedBoolean(
  value: boolean,
  timeoutDuration: number,
): boolean {
  const [delayedValue, setDelayedValue] = useState<boolean>(value);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!value) {
      timer.current = window.setTimeout(() => {
        setDelayedValue(false);
      }, timeoutDuration);
    } else {
      clearTimeout(timer.current || undefined);
      setDelayedValue(true);
    }

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, timeoutDuration]);

  return delayedValue;
}
