// frontend/src/api/http.ts
// Always use /api as the base path (reverse proxy in production)
const DEFAULT_BASE = "/api";
function joinUrl(base, path) {
    if (!path.startsWith("/"))
        path = `/${path}`;
    return `${base.replace(/\/+$/, "")}${path}`;
}
async function readJsonSafe(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : null;
    }
    catch {
        return text || null;
    }
}
export async function httpGet(path, signal) {
    const url = joinUrl(DEFAULT_BASE, path);
    const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
    });
    const payload = await readJsonSafe(res);
    if (!res.ok) {
        const err = {
            status: res.status,
            message: typeof payload === "string" ? payload : (payload?.detail ?? res.statusText),
            details: payload,
        };
        throw err;
    }
    return payload;
}
