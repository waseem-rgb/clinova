/**
 * Search Memory Store
 *
 * Persists last search inputs and outputs across page reloads.
 * Each feature has its own storage key.
 */
const STORAGE_PREFIX = "medcompanion_search_";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
/**
 * Save search state to localStorage
 */
export function saveSearchState(feature, input, output) {
    try {
        const state = {
            lastInput: input,
            lastOutput: output,
            timestamp: Date.now(),
        };
        localStorage.setItem(`${STORAGE_PREFIX}${feature}`, JSON.stringify(state));
    }
    catch (e) {
        // Ignore storage errors
        console.warn("Failed to save search state:", e);
    }
}
/**
 * Load search state from localStorage
 */
export function loadSearchState(feature) {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${feature}`);
        if (!raw)
            return null;
        const state = JSON.parse(raw);
        // Check if too old
        if (Date.now() - state.timestamp > MAX_AGE_MS) {
            clearSearchState(feature);
            return null;
        }
        return state;
    }
    catch (e) {
        return null;
    }
}
/**
 * Clear search state for a feature
 */
export function clearSearchState(feature) {
    try {
        localStorage.removeItem(`${STORAGE_PREFIX}${feature}`);
    }
    catch (e) {
        // Ignore
    }
}
/**
 * Clear all search states
 */
export function clearAllSearchStates() {
    const features = [
        "ddx",
        "treatment",
        "drugDetails",
        "interactions",
        "labInterpretation",
        "topic",
    ];
    for (const feature of features) {
        clearSearchState(feature);
    }
}
// ============================================================================
// FEATURE-SPECIFIC HELPERS
// ============================================================================
export function saveDDxState(input, output) {
    saveSearchState("ddx", input, output);
}
export function loadDDxState() {
    const state = loadSearchState("ddx");
    if (!state)
        return null;
    return { input: state.lastInput, output: state.lastOutput };
}
export function saveTreatmentState(input, output) {
    saveSearchState("treatment", input, output);
}
export function loadTreatmentState() {
    const state = loadSearchState("treatment");
    if (!state)
        return null;
    return { input: state.lastInput, output: state.lastOutput };
}
export function saveDrugDetailsState(input, output) {
    saveSearchState("drugDetails", input, output);
}
export function loadDrugDetailsState() {
    const state = loadSearchState("drugDetails");
    if (!state)
        return null;
    return { input: state.lastInput, output: state.lastOutput };
}
export function saveInteractionsState(input, output) {
    saveSearchState("interactions", input, output);
}
export function loadInteractionsState() {
    const state = loadSearchState("interactions");
    if (!state)
        return null;
    return { input: state.lastInput, output: state.lastOutput };
}
// ============================================================================
// REACT HOOK
// ============================================================================
import { useCallback, useEffect, useState } from "react";
export function useSearchMemory(feature, initialInput) {
    const [input, setInput] = useState(initialInput);
    const [output, setOutput] = useState(null);
    const [hasRestored, setHasRestored] = useState(false);
    // Restore state on mount
    useEffect(() => {
        const state = loadSearchState(feature);
        if (state) {
            setInput(state.lastInput);
            setOutput(state.lastOutput);
        }
        setHasRestored(true);
    }, [feature]);
    // Save state when output changes
    const saveState = useCallback((newOutput) => {
        setOutput(newOutput);
        saveSearchState(feature, input, newOutput);
    }, [feature, input]);
    // Reset to new search
    const resetSearch = useCallback(() => {
        setInput(initialInput);
        setOutput(null);
        clearSearchState(feature);
    }, [feature, initialInput]);
    // Update input
    const updateInput = useCallback((updates) => {
        setInput((prev) => ({ ...prev, ...updates }));
    }, []);
    return {
        input,
        setInput,
        updateInput,
        output,
        setOutput: saveState,
        resetSearch,
        hasRestored,
    };
}
