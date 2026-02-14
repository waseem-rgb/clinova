// frontend/src/api/client.ts
import { httpGet } from "./http";
export function apiGet(path, signal) {
    return httpGet(path, signal);
}
