import { apiGet } from "./api";
export async function suggestMedicine(q, signal) {
    const qs = new URLSearchParams({ q });
    return apiGet(`/suggest/medicine?${qs.toString()}`, { signal });
}
