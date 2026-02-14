import { apiGet } from "./api";

/**
 * Expected backend contract:
 * GET /api/suggest/medicine?q=epi
 * -> { suggestions: string[] }
 *
 * If backend doesn't have it yet, we will implement it next.
 */
export type SuggestResponse = { suggestions: string[] };

export async function suggestMedicine(q: string, signal?: AbortSignal) {
  const qs = new URLSearchParams({ q });
  return apiGet<SuggestResponse>(`/suggest/medicine?${qs.toString()}`, { signal });
}
