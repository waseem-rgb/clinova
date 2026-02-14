export const API_BASE = (() => {
    // Prefer explicit Vite env var if present
    const envBase = import.meta?.env?.VITE_API_BASE;
    if (typeof envBase === "string" && envBase.trim())
        return envBase.trim();
    // In production, always use same-origin reverse-proxy (/api -> 127.0.0.1:9000 via nginx)
    // In local dev, you can still override via VITE_API_BASE or keep it on /api if you proxy in vite config.
    return "/api";
})();
export async function apiGet(path, init) {
    const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
        ...init,
        headers: {
            "Accept": "application/json",
            ...(init?.headers || {}),
        },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
    }
    return (await res.json());
}
export async function apiPost(path, body, init) {
    const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
        method: "POST",
        ...init,
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            ...(init?.headers || {}),
        },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
    }
    return (await res.json());
}
