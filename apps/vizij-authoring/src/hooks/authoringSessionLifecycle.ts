import { useEffect, useRef } from "react";

export function useSessionResetEffect(
  sessionKey: string | null | undefined,
  onResetSession: () => void,
): void {
  const previousSessionKeyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (previousSessionKeyRef.current === undefined) {
      previousSessionKeyRef.current = sessionKey;
      return;
    }
    if (previousSessionKeyRef.current !== sessionKey) {
      previousSessionKeyRef.current = sessionKey;
      onResetSession();
      return;
    }
    previousSessionKeyRef.current = sessionKey;
  }, [onResetSession, sessionKey]);
}
