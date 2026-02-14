// frontend/src/api/fieldSuggest.ts
/**
 * API client for Smart Field Suggest endpoint.
 *
 * This is the universal suggestion endpoint for ALL input fields
 * EXCEPT Home Search (which uses /api/suggest/medicine).
 */
import { API_BASE } from "../services/api";
// =============================================================================
// API FUNCTION
// =============================================================================
/**
 * Fetch smart suggestions for a field.
 *
 * @param request - The suggestion request
 * @param signal - Optional abort signal
 * @returns List of suggestion items
 */
export async function fetchFieldSuggestions(request, signal) {
    if (!request.q || request.q.length < 2) {
        return [];
    }
    try {
        const res = await fetch(`${API_BASE}/suggest/field`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                field: request.field,
                q: request.q,
                context: request.context || null,
                limit: request.limit || 12,
            }),
            signal,
        });
        if (!res.ok) {
            console.warn(`Field suggest failed: ${res.status}`);
            return [];
        }
        const data = await res.json();
        return data.items || [];
    }
    catch (error) {
        if (error?.name === "AbortError") {
            // Request was aborted, don't log
            return [];
        }
        console.warn("Field suggest error:", error);
        return [];
    }
}
// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================
export async function suggestSymptoms(q, signal) {
    const items = await fetchFieldSuggestions({ field: "symptom", q }, signal);
    return items.map((i) => i.label);
}
export async function suggestComorbidities(q, signal) {
    const items = await fetchFieldSuggestions({ field: "comorbidity", q }, signal);
    return items.map((i) => i.label);
}
export async function suggestAllergies(q, signal) {
    const items = await fetchFieldSuggestions({ field: "allergy", q }, signal);
    return items.map((i) => i.label);
}
export async function suggestMedications(q, signal) {
    const items = await fetchFieldSuggestions({ field: "medication", q }, signal);
    return items.map((i) => i.label);
}
export async function suggestConditions(q, signal) {
    const items = await fetchFieldSuggestions({ field: "condition", q }, signal);
    return items.map((i) => i.label);
}
export async function suggestDrugs(q, signal) {
    const items = await fetchFieldSuggestions({ field: "drug", q }, signal);
    return items.map((i) => i.label);
}
