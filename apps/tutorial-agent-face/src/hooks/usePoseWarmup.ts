import { useEffect, useState } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import type { PoseHotkeyBinding } from "./usePoseHotkeys";

export function usePoseWarmup(
  bindings: PoseHotkeyBinding[],
  enabled: boolean,
): { warming: boolean } {
  const { animateValue } = useVizijRuntime();
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    if (!enabled || bindings.length === 0) {
      setWarming(false);
      return;
    }
    let cancelled = false;
    setWarming(true);

    const run = async () => {
      for (const binding of bindings) {
        if (cancelled) return;
        const path = binding.weightPath;
        await animateValue(path, { float: 1 }, { duration: 0.05 });
        await animateValue(path, { float: 0 }, { duration: 0.05 });
      }
      if (!cancelled) setWarming(false);
    };

    run();
    return () => {
      cancelled = true;
      setWarming(false);
    };
  }, [animateValue, bindings, enabled]);

  return { warming };
}
