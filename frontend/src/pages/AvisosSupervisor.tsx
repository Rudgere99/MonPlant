import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

// Tipos alinhados com o backend

type NoticeItem = {
  id: string;
  title: string;
  message: string;
  created_at: string;
  ended_at: string | null;
  created_by: string | null;
  read?: boolean;
};

function fmtTs(ts?: string | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AvisosSupervisor() {
  const { token, user } = useAuth();

  const canPublish = (user?.user_type || "") === "supervisor";
  const userName = user?.full_name || "—";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [active, setActive] = useState<NoticeItem[]>([]);

  const headers = useMemo(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  async function loadActive() {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/notices/active`, {
        headers,
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { items: NoticeItem[] } | NoticeItem[];
      const items = Array.isArray(data) ? data : data.items;
      setActive(items || []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar avisos");
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!canPublish) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/notices`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, message }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      setTitle("");
      setMessage("");
      await loadActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao publicar aviso");
    } finally {
      setLoading(false);
    }
  }

  async function endNotice(id: string) {
    if (!canPublish) return;
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/notices/${id}/end`, {
        method: "POST",
        headers,
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await loadActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao encerrar aviso");
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${import.meta.env.VITE_API_BASE}/api/notices/${id}/read`, {
        method: "POST",
        headers,
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await loadActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao confirmar leitura");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // sem token => deixa RequireAuth cuidar
    if (!token) return;
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mp-page">
      <div className="mp-container" style={{ maxWidth: 1120 }}>
        <div className="mp-breadcrumb">Visão geral • Avisos</div>
        <div className="mp-subtitle">Supervisor • Comunicação oficial</div>

        <div className="mp-hero" style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 280 }}>
              <h1 className="mp-title">Avisos do Supervisor</h1>
              <p className="mp-lead">
                Tudo que for publicado aqui aparece para todos e exige confirmação de leitura.
                Use isso como fonte oficial para evitar erro de lançamento por rádio.
              </p>
              <div className="mp-muted" style={{ marginTop: 6 }}>
                Logado como: <strong>{userName}</strong>
                {!canPublish && " — Somente leitura"}
              </div>
              {err && (
                <div className="mp-error" style={{ marginTop: 10 }}>
                  {err}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="mp-btn" onClick={loadActive} disabled={loading}>
                {loading ? "Carregando…" : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        <div className="mp-grid" style={{ gridTemplateColumns: "1fr 1.15fr", gap: 16, marginTop: 16 }}>
          {/* ESQUERDA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="mp-card">
              <div className="mp-card-h">
                <div>
                  <div className="mp-card-title">Novo aviso</div>
                  <div className="mp-muted" style={{ marginTop: 4 }}>
                    {canPublish
                      ? "Publique uma orientação oficial para todos os usuários."
                      : "Você está em modo leitura. Somente supervisor pode publicar/encerrar avisos."}
                  </div>
                </div>
              </div>
              <div className="mp-card-b">
                <div>
                  <label className="mp-label">Título</label>
                  <input
                    className="mp-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex.: Ajuste de produção 07–08"
                    disabled={!canPublish || loading}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <label className="mp-label">Mensagem</label>
                  <textarea
                    className="mp-textarea"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Descreva a orientação oficial (períodos, estimativa, horário de confirmação, etc.)"
                    rows={6}
                    disabled={!canPublish || loading}
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className="mp-btn mp-btn-primary"
                    onClick={publish}
                    disabled={!canPublish || loading || !title.trim() || !message.trim()}
                  >
                    Publicar aviso
                  </button>
                  <div className="mp-muted" style={{ fontSize: 12 }}>
                    Exige confirmação de leitura.
                  </div>
                </div>

                <div className="mp-divider" style={{ marginTop: 14 }} />

                <div className="mp-card-title" style={{ marginTop: 14 }}>
                  Boas práticas
                </div>
                <ul className="mp-list" style={{ marginTop: 10 }}>
                  <li>Inclua período (ex.: 07–08) e o horário de confirmação.</li>
                  <li>Se estiver “em ajuste”, diga para o CCO aguardar confirmação.</li>
                  <li>Encerre o aviso quando a informação estiver consolidada.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* DIREITA */}
          <div className="mp-card">
            <div className="mp-card-h">
              <div>
                <div className="mp-card-title">Avisos ativos</div>
                <div className="mp-muted" style={{ marginTop: 4 }}>
                  {active.length} ativo(s)
                </div>
              </div>
            </div>

            <div className="mp-card-b">
              {active.length === 0 ? (
                <div className="mp-empty">Nenhum aviso ativo.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {active.map((n) => (
                    <div key={n.id} className="mp-card" style={{ padding: 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ minWidth: 240 }}>
                          <div style={{ fontWeight: 900, fontSize: 16 }}>{n.title}</div>
                          <div className="mp-muted" style={{ marginTop: 4, fontSize: 12 }}>
                            {fmtTs(n.created_at)}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {!n.read ? (
                            <span className="mp-badge mp-badge-warn">Pendente</span>
                          ) : (
                            <span className="mp-badge mp-badge-ok">Lido</span>
                          )}
                        </div>
                      </div>

                      <div style={{ marginTop: 10, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                        {n.message}
                      </div>

                      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                        {!n.read && (
                          <button className="mp-btn mp-btn-primary" onClick={() => markRead(n.id)} disabled={loading}>
                            Confirmar leitura
                          </button>
                        )}
                        {canPublish && (
                          <button className="mp-btn mp-btn-danger" onClick={() => endNotice(n.id)} disabled={loading}>
                            Encerrar
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
