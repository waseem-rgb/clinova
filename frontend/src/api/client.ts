// frontend/src/api/client.ts
import { httpGet } from "./http";

export function apiGet<T>(path: string, signal?: AbortSignal) {
  return httpGet<T>(path, signal);
}
