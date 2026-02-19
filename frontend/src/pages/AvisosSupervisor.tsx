import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type Notice = {
  id: string;
  title: string;
  message: string;
  is_active: boolean;
  created_at?: string | null;
  created_by?: string | null;
  read?: boolean;
  read_at?: string | null;
};

export default function AvisosSupervisor() {
  const { token, loading, user } = useAuth() as any;
  const API = ((import.meta as any).env?.VITE_API_BASE || "").toString().trim();

  const [items, setItems] = useState<Notice[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function apiUrl(path: string) {
    const p = path.startsWith("/") ? path : `/${path}`;
    if (!API) return p;
    return `${API.replace(/\/+$/, "")}${p}`;
  }

  async function getActive() {
    setErr(null);
    try {
      const res = await fetch(apiUrl("/api/notices/active"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar avisos");
    }
  }

  async function publish() {
    setOkMsg(null);
    setErr(null);

    const t = title.trim();
    const m = message.trim();
    if (!t || !m) {
      setErr("Preencha título e mensagem.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(apiUrl("/api/notices"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: t, message: m }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${txt ? ` — ${txt}` : ""}`);
      }
      setTitle("");
      setMessage("");
      setOkMsg("Aviso publicado com sucesso.");
      await getActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao publicar");
    } finally {
      setBusy(false);
    }
  }

  async function closeNotice(id: string) {
    if (!id) return;
    setOkMsg(null);
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/notices/${id}/close`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}${txt ? ` — ${txt}` : ""}`);
      }
      setOkMsg("Aviso encerrado.");
      await getActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao encerrar");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!token) return;
    getActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, token]);

  const active = useMemo(() => items.filter((x) => x.is_active), [items]);

  return (
    <div className="p-6">
      <div className="mb-4">
        <div className="text-sm text-zinc-400">Supervisor • Comunicação oficial</div>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-100">Avisos do Supervisor</h1>
        <div className="mt-1 text-sm text-zinc-400">
          Tudo que for publicado aqui aparece para todos e exige confirmação.
        </div>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-rose-200">
          {err}
        </div>
      ) : null}

      {okMsg ? (
        <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-200">
          {okMsg}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="text-xs font-semibold text-zinc-400">NOVO AVISO</div>

          <div className="mt-3">
            <div className="text-xs text-zinc-400">Título</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Ex.: Ajuste de produção / parada / alteração de valor"
            />
          </div>

          <div className="mt-3">
            <div className="text-xs text-zinc-400">Mensagem</div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-2 h-40 w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30"
              placeholder="Escreva a informação oficial que deve ser usada no lançamento."
            />
          </div>

          <button
            onClick={publish}
            disabled={busy || !token}
            className="mt-4 w-full rounded-xl bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {busy ? "Enviando..." : "Publicar aviso"}
          </button>

          <div className="mt-3 text-xs text-zinc-500">
            Logado como: <span className="text-zinc-300">{user?.full_name || "—"}</span>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-400">AVISOS ATIVOS</div>
            <button
              onClick={getActive}
              disabled={busy || !token}
              className="rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-200 ring-1 ring-white/10 hover:bg-white/10 disabled:opacity-50"
            >
              Atualizar
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {active.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
                Nenhum aviso ativo.
              </div>
            ) : (
              active.map((n) => (
                <div key={n.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{n.title}</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{n.message}</div>
                      {n.created_at ? (
                        <div className="mt-2 text-xs text-zinc-500">Criado em: {n.created_at}</div>
                      ) : null}
                    </div>

                    <button
                      onClick={() => closeNotice(n.id)}
                      disabled={busy}
                      className="rounded-xl bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-200 ring-1 ring-rose-500/30 hover:bg-rose-500/20 disabled:opacity-50"
                    >
                      Encerrar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
