import { useEffect, useState } from "react";
export function usePersistentState(key, initial) {
    const [state, setState] = useState(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null)
                return initial;
            return JSON.parse(raw);
        }
        catch {
            return initial;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        }
        catch {
            // ignore persistence errors
        }
    }, [key, state]);
    const reset = () => {
        try {
            localStorage.removeItem(key);
        }
        catch {
            // ignore
        }
        setState(initial);
    };
    return [state, setState, reset];
}
