import { useState, useEffect } from 'react';

export function useLazy(value: boolean, timeout: number): boolean {
  const [lazy, setLazy] = useState(value);
  const [timeoutValue, setTimeoutValue] = useState<NodeJS.Timeout | null>(null);

  useEffect(()=>{
    if (value) {
      setLazy(value);
      if (timeoutValue) {clearTimeout(timeoutValue)};
    } else {
      const timer = setTimeout(()=>{
        setLazy(value);
        setTimeoutValue(timer)
      }, timeout);
      return () => {
        if (timeoutValue) {clearTimeout(timeoutValue)}};
    }
    
  },[value,timeout,timeoutValue])

  return lazy;

}
