import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

type Notice = {
  id: string;
  title: string;
  message: string;
  created_at?: string;
  created_by_name?: string;
  is_active?: boolean;
  read?: boolean; // se backend devolver
};

function normRole(v?: string | null) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function AvisosSupervisor() {
  const { token, user } = useAuth();

  const canPublish = useMemo(() => normRole(user?.user_type) === "supervisor", [user?.user_type]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Notice[]>([]);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  async function apiFetch(path: string, init?: RequestInit) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init?.headers as any),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const txt = await res.text();
    let data: any = null;
    try {
      data = txt ? JSON.parse(txt) : null;
    } catch {
      data = txt;
    }
    if (!res.ok) {
      const detail = data?.detail || data?.message || txt || res.statusText;
      throw new Error(`${res.status} — ${detail}`);
    }
    return data;
  }

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const data = await apiFetch("/api/notices/active", { method: "GET" });
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    setErr(null);
    if (!canPublish) {
      setErr("Apenas supervisor pode publicar.");
      return;
    }
    if (!title.trim() || !message.trim()) {
      setErr("Preencha título e mensagem.");
      return;
    }

    setLoading(true);
    try {
      await apiFetch("/api/notices", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });
      setTitle("");
      setMessage("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao publicar");
    } finally {
      setLoading(false);
    }
  }

  async function closeNotice(id: string) {
    setErr(null);
    if (!canPublish) {
      setErr("Apenas supervisor pode encerrar.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/api/notices/${id}/close`, { method: "POST" });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao encerrar");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setErr(null);
    setLoading(true);
    try {
      await apiFetch(`/api/notices/${id}/read`, { method: "POST" });
      await load();
    } catch (e: any) {
      setErr(e?.message || "Falha ao confirmar leitura");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6">
      <div className="mb-5">
        <div className="text-xs text-white/60">Visão geral • Avisos</div>
        <div className="text-sm text-white/70">Supervisor • Comunicação oficial</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">Avisos do Supervisor</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/70">
          Tudo que for publicado aqui aparece para todos e exige confirmação de leitura. Use isso como fonte oficial para evitar erro de
          lançamento por rádio.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={load}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
        <div className="text-sm text-white/60">
          Logado como: <span className="text-white/80 font-semibold">{user?.full_name || "—"}</span>
          {canPublish ? (
            <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Supervisor</span>
          ) : (
            <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/70">Somente leitura</span>
          )}
        </div>
      </div>

      {err && (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{err}</div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Composer */}
        <div className="xl:col-span-5">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 shadow">
            <div className="mb-3 text-sm font-semibold text-white">Novo aviso</div>
            {!canPublish && (
              <div className="mb-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                Você está em modo leitura. Somente <b>supervisor</b> pode publicar/encerrar avisos.
              </div>
            )}

            <label className="block text-xs text-white/60">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canPublish || loading}
              placeholder="Ex.: Ajuste de produção por manutenção"
              className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 disabled:opacity-60"
            />

            <label className="mt-4 block text-xs text-white/60">Mensagem</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!canPublish || loading}
              rows={6}
              placeholder="Descreva a orientação oficial (períodos, estimativa, horário de confirmação, etc.)"
              className="mt-1 w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 disabled:opacity-60"
            />

            <button
              onClick={publish}
              disabled={!canPublish || loading}
              className="mt-4 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-60"
            >
              Publicar aviso
            </button>

            <div className="mt-4 text-xs text-white/50">
              Boas práticas:
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Inclua período (ex.: 07–08) e o horário de confirmação.</li>
                <li>Se estiver “em ajuste”, deixe explícito para o CCO aguardar confirmação.</li>
                <li>Encerre o aviso quando a informação estiver consolidada.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Active notices */}
        <div className="xl:col-span-7">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-5 shadow">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">Avisos ativos</div>
                <div className="text-xs text-white/60">{items.length} ativo(s)</div>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">Nenhum aviso ativo.</div>
            ) : (
              <div className="space-y-3">
                {items.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-white">{n.title}</div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-white/80">{n.message}</div>
                        <div className="mt-2 text-xs text-white/50">
                          {n.created_by_name ? `Por ${n.created_by_name}` : ""}
                          {n.created_at ? ` • ${n.created_at}` : ""}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col gap-2">
                        <button
                          onClick={() => markRead(n.id)}
                          disabled={loading}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60"
                        >
                          Confirmar leitura
                        </button>

                        {canPublish && (
                          <button
                            onClick={() => closeNotice(n.id)}
                            disabled={loading}
                            className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/15 disabled:opacity-60"
                          >
                            Encerrar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
