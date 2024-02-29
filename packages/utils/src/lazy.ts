import { useState, useEffect } from "react";

/*
@description
This hook is used to delay the nullification of a state value until the the timeout has been reached, such as keeping an object
in a hovered state even if the mouse has left the object for a short period of time.
@param value - the value to be delayed
@param timeout - the time to delay the nullification of the value
@return - the delayed value
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
