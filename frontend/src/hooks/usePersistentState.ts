import { useEffect, useState } from "react";

export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore persistence errors
    }
  }, [key, state]);

  const reset = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    setState(initial);
  };

  return [state, setState, reset] as const;
}
