import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type Notice = {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
  read: boolean;
  read_at?: string | null;
};

export default function NoticeGate({ children }: { children: React.ReactNode }) {
  const { token, loading, user } = useAuth();
  const API = (import.meta as any).env?.VITE_API_BASE || "";

  const [notices, setNotices] = useState<Notice[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  async function apiPost(path: string) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  async function load() {
    setErr(null);
    try {
      const data = await apiGet<Notice[]>(`/api/notices/active`);
      setNotices(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar avisos");
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!token) return;
    load();

    const t = setInterval(load, 15000); // atualiza a cada 15s
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token]);

  const unread = useMemo(() => notices.filter((n) => !n.read), [notices]);

  const mustBlock = unread.length > 0; // confirmação obrigatória para TODA mensagem

  async function markRead(id: string) {
    await apiPost(`/api/notices/${id}/read`);
    await load();
  }

  return (
    <>
      {/* Banner discreto sempre que existir aviso ativo */}
      {token && !loading && notices.length > 0 ? (
        <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-amber-200">
          <div className="text-sm font-semibold">Aviso do Supervisor (ativo)</div>
          <div className="text-xs opacity-80">
            {unread.length > 0 ? `${unread.length} pendente(s) de confirmação` : "Todos confirmados"}
          </div>
        </div>
      ) : null}

      {/* Conteúdo do app */}
      <div className={mustBlock ? "pointer-events-none select-none blur-[1px]" : ""}>{children}</div>

      {/* Modal bloqueante */}
      {mustBlock ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-950/90 p-5 shadow-2xl">
            <div className="text-lg font-semibold text-zinc-100">Confirmação obrigatória</div>
            <div className="mt-1 text-sm text-zinc-400">
              Você precisa confirmar leitura dos avisos do Supervisor para continuar.
            </div>

            {err ? (
              <div className="mt-3 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-rose-200 text-sm">
                {err}
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {unread.map((n) => (
                <div key={n.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{n.title}</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{n.message}</div>
                      <div className="mt-2 text-xs text-zinc-500">Criado em: {n.created_at}</div>
                    </div>

                    {/* Supervisor não precisa “se bloquear”, mas como regra é pra todos,
                        mantive também. Se quiser liberar supervisor, eu ajusto. */}
                    <button
                      onClick={() => markRead(n.id)}
                      className="pointer-events-auto rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20"
                    >
                      Li e entendi
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-xs text-zinc-500">
              Usuário: <span className="text-zinc-300">{user?.full_name || "—"}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
