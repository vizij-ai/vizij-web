import { useEffect, useState } from "react";

export function useTimeSeries(
  value: number | undefined,
  capacity = 180,
): number[] {
  const [samples, setSamples] = useState<number[]>([]);

  useEffect(() => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return;
    }
    setSamples((prev) => {
      const next = prev.length >= capacity ? prev.slice(1) : prev.slice();
      next.push(value);
      return next;
    });
  }, [value, capacity]);

  return samples;
}
