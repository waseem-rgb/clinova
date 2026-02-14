// frontend/src/api/http.ts

export type HttpError = {
  status: number;
  message: string;
  details?: unknown;
};

// Always use /api as the base path (reverse proxy in production)
const DEFAULT_BASE = "/api";

function joinUrl(base: string, path: string) {
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base.replace(/\/+$/, "")}${path}`;
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text || null;
  }
}

export async function httpGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = joinUrl(DEFAULT_BASE, path);
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  const payload = await readJsonSafe(res);

  if (!res.ok) {
    const err: HttpError = {
      status: res.status,
      message: typeof payload === "string" ? payload : (payload?.detail ?? res.statusText),
      details: payload,
    };
    throw err;
  }

  return payload as T;
}
