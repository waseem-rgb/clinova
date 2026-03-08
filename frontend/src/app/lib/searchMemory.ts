/**
 * Search Memory Store
 * 
 * Persists last search inputs and outputs across page reloads.
 * Each feature has its own storage key.
 */

export type FeatureKey = 
  | "ddx"
  | "treatment"
  | "drugDetails"
  | "interactions"
  | "labInterpretation"
  | "topic";

interface SearchState<TInput, TOutput> {
  lastInput: TInput;
  lastOutput: TOutput | null;
  timestamp: number;
}

const STORAGE_PREFIX = "clinova_search_";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Save search state to localStorage
 */
export function saveSearchState<TInput, TOutput>(
  feature: FeatureKey,
  input: TInput,
  output: TOutput,
): void {
  try {
    const state: SearchState<TInput, TOutput> = {
      lastInput: input,
      lastOutput: output,
      timestamp: Date.now(),
    };
    localStorage.setItem(
      `${STORAGE_PREFIX}${feature}`,
      JSON.stringify(state),
    );
  } catch (e) {
    // Ignore storage errors
    console.warn("Failed to save search state:", e);
  }
}

/**
 * Load search state from localStorage
 */
export function loadSearchState<TInput, TOutput>(
  feature: FeatureKey,
): SearchState<TInput, TOutput> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${feature}`);
    if (!raw) return null;
    
    const state = JSON.parse(raw) as SearchState<TInput, TOutput>;
    
    // Check if too old
    if (Date.now() - state.timestamp > MAX_AGE_MS) {
      clearSearchState(feature);
      return null;
    }
    
    return state;
  } catch (e) {
    return null;
  }
}

/**
 * Clear search state for a feature
 */
export function clearSearchState(feature: FeatureKey): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${feature}`);
  } catch (e) {
    // Ignore
  }
}

/**
 * Clear all search states
 */
export function clearAllSearchStates(): void {
  const features: FeatureKey[] = [
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
// TYPED STATE INTERFACES FOR EACH FEATURE
// ============================================================================

export interface DDxInput {
  symptoms: string;
  duration: string;
  age: string;
  sex: string;
  pregnancy: string;
  comorbidities: string;
  meds: string;
}

export interface TreatmentInput {
  topic: string;
  age: string;
  sex: string;
  pregnancy: string;
  severity: string;
  setting: string;
  comorbidities: string;
  allergies: string;
  renal: string;
  hepatic: string;
  currentMeds: string;
}

export interface DrugDetailsInput {
  query: string;
}

export interface InteractionsInput {
  drugs: string;
}

// ============================================================================
// FEATURE-SPECIFIC HELPERS
// ============================================================================

export function saveDDxState(input: DDxInput, output: any): void {
  saveSearchState("ddx", input, output);
}

export function loadDDxState(): { input: DDxInput; output: any } | null {
  const state = loadSearchState<DDxInput, any>("ddx");
  if (!state) return null;
  return { input: state.lastInput, output: state.lastOutput };
}

export function saveTreatmentState(input: TreatmentInput, output: any): void {
  saveSearchState("treatment", input, output);
}

export function loadTreatmentState(): { input: TreatmentInput; output: any } | null {
  const state = loadSearchState<TreatmentInput, any>("treatment");
  if (!state) return null;
  return { input: state.lastInput, output: state.lastOutput };
}

export function saveDrugDetailsState(input: DrugDetailsInput, output: any): void {
  saveSearchState("drugDetails", input, output);
}

export function loadDrugDetailsState(): { input: DrugDetailsInput; output: any } | null {
  const state = loadSearchState<DrugDetailsInput, any>("drugDetails");
  if (!state) return null;
  return { input: state.lastInput, output: state.lastOutput };
}

export function saveInteractionsState(input: InteractionsInput, output: any): void {
  saveSearchState("interactions", input, output);
}

export function loadInteractionsState(): { input: InteractionsInput; output: any } | null {
  const state = loadSearchState<InteractionsInput, any>("interactions");
  if (!state) return null;
  return { input: state.lastInput, output: state.lastOutput };
}

// ============================================================================
// REACT HOOK
// ============================================================================

import { useCallback, useEffect, useState } from "react";

export function useSearchMemory<TInput, TOutput>(
  feature: FeatureKey,
  initialInput: TInput,
) {
  const [input, setInput] = useState<TInput>(initialInput);
  const [output, setOutput] = useState<TOutput | null>(null);
  const [hasRestored, setHasRestored] = useState(false);

  // Restore state on mount
  useEffect(() => {
    const state = loadSearchState<TInput, TOutput>(feature);
    if (state) {
      setInput(state.lastInput);
      setOutput(state.lastOutput);
    }
    setHasRestored(true);
  }, [feature]);

  // Save state when output changes
  const saveState = useCallback(
    (newOutput: TOutput) => {
      setOutput(newOutput);
      saveSearchState(feature, input, newOutput);
    },
    [feature, input],
  );

  // Reset to new search
  const resetSearch = useCallback(() => {
    setInput(initialInput);
    setOutput(null);
    clearSearchState(feature);
  }, [feature, initialInput]);

  // Update input
  const updateInput = useCallback(
    (updates: Partial<TInput>) => {
      setInput((prev) => ({ ...prev, ...updates }));
    },
    [],
  );

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
