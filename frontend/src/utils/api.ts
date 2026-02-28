const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = (localStorage.getItem("mp_token") || "").trim();

  const headers: Record<string, string> = {
    ...(options.headers as any),
  };

  if (!headers["Content-Type"] && options.body) {
    headers["Content-Type"] = "application/json";
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

// Helpers (pra ficar simples nas páginas)
export function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: any): Promise<T> {
  return apiFetch<T>(path, {
    method: "POST",
    ...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
  });
}

export function apiPut<T>(path: string, body?: any): Promise<T> {
  return apiFetch<T>(path, {
    method: "PUT",
    ...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
  });
}

export function apiDelete<T>(path: string, body?: any): Promise<T> {
  return apiFetch<T>(path, {
    method: "DELETE",
    ...(typeof body !== "undefined" ? { body: JSON.stringify(body) } : {}),
  });
}
