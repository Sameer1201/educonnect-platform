const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function req<T = any>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, { credentials: "include", ...options });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err?.error ?? `HTTP ${r.status}`);
  }
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: <T = any>(path: string) => req<T>(path),
  post: <T = any>(path: string, body?: unknown) =>
    req<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T = any>(path: string, body?: unknown) =>
    req<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => req<T>(path, { method: "DELETE" }),
};
