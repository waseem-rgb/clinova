// frontend/src/app/lib/api.ts
import { API_BASE } from "../../services/api";
export async function fetchSuggestionsMedicine(q, minChunks = 30, limit = 20) {
    // Path WITHOUT /api/ prefix - API_BASE already includes /api
    const url = new URL(`${API_BASE}/suggest/medicine`, window.location.origin);
    url.searchParams.set("q", q);
    url.searchParams.set("min_chunks", String(minChunks));
    url.searchParams.set("limit", String(limit));
    const res = await fetch(url.toString());
    if (!res.ok)
        throw new Error(`Suggest failed: ${res.status}`);
    return (await res.json());
}
export async function fetchTopicMedicine(q) {
    // Path WITHOUT /api/ prefix - API_BASE already includes /api
    const url = new URL(`${API_BASE}/topic/medicine`, window.location.origin);
    url.searchParams.set("q", q);
    const res = await fetch(url.toString());
    if (!res.ok)
        throw new Error(`Topic failed: ${res.status}`);
    return (await res.json());
}
