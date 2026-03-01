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
