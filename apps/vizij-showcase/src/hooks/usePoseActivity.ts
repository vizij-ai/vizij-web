import { useEffect, useState } from "react";
import { addPoseTriggerListener } from "../lib/poseRigBroadcast";

export function usePoseActivity(windowMs = 1200): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timeoutId: number | null = null;

    const armTimeout = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => setActive(false), windowMs);
    };

    const remove = addPoseTriggerListener(({ weight }) => {
      if (weight && weight > 0) {
        setActive(true);
        armTimeout();
      } else if (active) {
        armTimeout();
      }
    });

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      remove();
    };
  }, [active, windowMs]);

  return active;
}
