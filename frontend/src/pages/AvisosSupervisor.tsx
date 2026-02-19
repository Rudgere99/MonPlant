
import React, { useEffect, useMemo, useState } from "react";
import { Bell, Send, RefreshCcw, XCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";

/**
 * Avisos do Supervisor
 * - Supervisor cria e encerra avisos
 * - Todos podem visualizar avisos ativos
 * - TODOS precisam confirmar leitura (POST /api/notices/{id}/read)
 *
 * Endpoints (backend):
 *   GET  /api/notices/active
 *   POST /api/notices                 (somente supervisor)
 *   POST /api/notices/{id}/close      (somente supervisor)
 *   POST /api/notices/{id}/read       (qualquer logado)
 */

type Notice = {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at?: string | null;
  created_by_name?: string | null;
};

function apiBase() {
  // segue o padrão do MonPlant
  const env = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  return (env || "http://localhost:8000").replace(/\/$/, "");
}

function fmtDt(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function AvisosSupervisor() {
  const { token, user } = useAuth();
  const isSupervisor = (user?.user_type || "").toLowerCase() === "supervisor";

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<Notice[]>([]);

  const canPost = useMemo(() => {
    return isSupervisor && title.trim().length >= 3 && message.trim().length >= 3;
  }, [isSupervisor, title, message]);

  async function fetchActive() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase()}/api/notices/active`, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status} — ${t || res.statusText}`);
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : (data.items || []));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar avisos.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!canPost) return;
    setPosting(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase()}/api/notices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status} — ${t || res.statusText}`);
      }

      setTitle("");
      setMessage("");
      await fetchActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao publicar aviso.");
    } finally {
      setPosting(false);
    }
  }

  async function closeNotice(id: string) {
    if (!isSupervisor) return;
    if (!confirm("Encerrar este aviso?")) return;

    setErr(null);
    try {
      const res = await fetch(`${apiBase()}/api/notices/${encodeURIComponent(id)}/close`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status} — ${t || res.statusText}`);
      }
      await fetchActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao encerrar aviso.");
    }
  }

  async function markRead(id: string) {
    setErr(null);
    try {
      const res = await fetch(`${apiBase()}/api/notices/${encodeURIComponent(id)}/read`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`${res.status} — ${t || res.statusText}`);
      }
      // não precisa recarregar, mas mantém consistente
      await fetchActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao confirmar leitura.");
    }
  }

  useEffect(() => {
    fetchActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6">
      <div className="mb-4 text-xs text-white/60">Visão geral • Avisos</div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-white/70 text-sm">
            <span className="inline-flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {isSupervisor ? "Supervisor" : "Leitura"} • Comunicação oficial
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-white">Avisos do Supervisor</h1>
          <p className="mt-2 text-sm text-white/60 max-w-2xl">
            Tudo que for publicado aqui aparece para todos e exige confirmação de leitura. Use isso como fonte oficial
            para evitar erro de lançamento por rádio.
          </p>
        </div>

        <button
          onClick={fetchActive}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {err && (
        <div className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">
          {err}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* NOVO AVISO */}
        <div className="xl:col-span-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="mb-3 text-sm font-semibold text-white/80">Novo aviso</div>

            {!isSupervisor && (
              <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-100">
                Você está em modo leitura. Somente <b>supervisor</b> pode publicar/encerrar avisos.
              </div>
            )}

            <label className="block text-xs text-white/60 mb-1">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Ajuste de produção por manutenção"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
              disabled={!isSupervisor || posting}
            />

            <label className="mt-3 block text-xs text-white/60 mb-1">Mensagem</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Descreva a orientação oficial (períodos, estimativa, horário de confirmação, etc.)"
              rows={5}
              className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/20"
              disabled={!isSupervisor || posting}
            />

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-white/40">
                Logado como: <span className="text-white/70">{user?.full_name || "—"}</span>
              </div>

              <button
                onClick={publish}
                disabled={!canPost || posting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-100 ring-1 ring-emerald-400/25 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {posting ? "Publicando..." : "Publicar aviso"}
              </button>
            </div>
          </div>
        </div>

        {/* AVISOS ATIVOS */}
        <div className="xl:col-span-7">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white/80">Avisos ativos</div>
              <div className="text-xs text-white/50">{items.length} ativo(s)</div>
            </div>

            <div className="mt-4 space-y-3">
              {items.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/50">
                  Nenhum aviso ativo.
                </div>
              ) : (
                items.map((n) => (
                  <div key={n.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-white font-semibold">{n.title}</div>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-100 ring-1 ring-emerald-400/25">
                            ATIVO
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-white/50">
                          {n.created_by_name ? <>por <span className="text-white/70">{n.created_by_name}</span> • </> : null}
                          {fmtDt(n.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => markRead(n.id)}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white hover:bg-white/10"
                          title="Confirmar leitura"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirmar
                        </button>

                        {isSupervisor && (
                          <button
                            onClick={() => closeNotice(n.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100 hover:bg-red-500/15"
                            title="Encerrar aviso"
                          >
                            <XCircle className="h-4 w-4" />
                            Encerrar
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 whitespace-pre-wrap text-sm text-white/75">{n.message}</div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-white/55">
              <div className="font-semibold text-white/70 mb-1">Boas práticas</div>
              <ul className="list-disc pl-5 space-y-1">
                <li>Inclua período (ex.: 07–08) e o horário de confirmação.</li>
                <li>Se ainda estiver “em ajuste”, deixe explícito para o CCO aguardar confirmação.</li>
                <li>Encerre o aviso quando a informação estiver consolidada.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
