import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

// Página: Avisos do Supervisor
// - Supervisor publica/encerra
// - Todos confirmam leitura
// - UI no padrão CSS do MonPlant (mp-*)

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "";

type Notice = {
  id: string;
  title: string;
  message: string;
  created_at?: string | null;
  created_by_name?: string | null;
  is_active?: boolean;
  requires_ack?: boolean;
  acked?: boolean; // vindo do backend (left join reads)
};

function fmtTs(s?: string | null) {
  if (!s) return "";
  // tenta formatar ISO -> pt-BR
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString("pt-BR", { hour12: false });
}

export default function AvisosSupervisor() {
  const { token, user } = useAuth();
  const isSupervisor = (user?.user_type || "").toLowerCase() === "supervisor";

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Notice[]>([]);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const canPublish = isSupervisor;

  const header = useMemo(() => {
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [token]);

  async function loadActive() {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/notices/active`, {
        method: "GET",
        headers: { "Content-Type": "application/json", ...header },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `Erro ${r.status}`);
      }
      const data = await r.json();
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar avisos");
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    setErr(null);
    if (!title.trim() || !message.trim()) {
      setErr("Preencha título e mensagem.");
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/notices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...header },
        body: JSON.stringify({ title: title.trim(), message: message.trim(), requires_ack: true }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `Erro ${r.status}`);
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

  async function closeNotice(id: string) {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/notices/${id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...header },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `Erro ${r.status}`);
      }
      await loadActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao encerrar aviso");
    } finally {
      setLoading(false);
    }
  }

  async function ackNotice(id: string) {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/notices/${id}/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...header },
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `Erro ${r.status}`);
      }
      await loadActive();
    } catch (e: any) {
      setErr(e?.message || "Falha ao confirmar leitura");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // se não tiver token, não tenta (evita spam)
    if (!token) return;
    loadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const activeCount = items.length;

  return (
    <div className="mp-container" style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="mp-page-title">Avisos do Supervisor</div>
          <div className="mp-page-sub">
            Tudo que for publicado aqui aparece para todos e exige confirmação de leitura. Use isso como fonte oficial para evitar erro de lançamento por rádio.
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="mp-chip">Comunicação oficial</span>
            <span className="mp-help">
              Logado como: <b>{user?.full_name || "—"}</b> · Perfil: <b>{user?.user_type || "—"}</b>
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="mp-btn" onClick={loadActive} disabled={loading || !token}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {err && <div className="mp-error">{String(err)}</div>}

      <div className="mp-grid" style={{ marginTop: 16 }}>
        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="mp-card">
            <div className="mp-card-h">
              <div style={{ fontWeight: 900 }}>Novo aviso</div>
              {!canPublish ? <span className="mp-chip" style={{ background: "rgba(255,255,255,.05)", borderColor: "rgba(255,255,255,.12)", color: "rgba(255,255,255,.78)" }}>Somente leitura</span> : <span className="mp-chip">Supervisor</span>}
            </div>

            <div className="mp-card-b">
              {!canPublish && (
                <div className="mp-help" style={{ marginBottom: 10 }}>
                  Você está em modo leitura. Somente <b>supervisor</b> pode publicar/encerrar avisos.
                </div>
              )}

              <div className="mp-form-grid">
                <div>
                  <div className="mp-label">Título</div>
                  <input
                    className="mp-input"
                    placeholder="Ex.: Ajuste de produção por manutenção"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!canPublish || loading}
                  />
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <div className="mp-label">Mensagem</div>
                  <textarea
                    className="mp-textarea"
                    placeholder="Descreva a orientação oficial (períodos, estimativa, horário de confirmação, etc.)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    disabled={!canPublish || loading}
                  />
                  <div className="mp-help" style={{ marginTop: 6 }}>
                    * Toda mensagem exige confirmação de leitura.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="mp-btn mp-btn-primary" onClick={publish} disabled={!canPublish || loading}>
                  Publicar aviso
                </button>
              </div>
            </div>
          </div>

          <div className="mp-card">
            <div className="mp-card-h">
              <div style={{ fontWeight: 900 }}>Boas práticas</div>
              <span className="mp-chip">CCO</span>
            </div>
            <div className="mp-card-b">
              <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(255,255,255,.82)" }}>
                <li>Inclua período (ex.: <b>07–08</b>) e o horário de confirmação.</li>
                <li>Se estiver “em ajuste”, deixe explícito para o CCO aguardar confirmação.</li>
                <li>Encerre o aviso quando a informação estiver consolidada.</li>
              </ul>
              <div className="mp-help" style={{ marginTop: 10 }}>
                Dica: use frases curtas + números; evita erro de rádio e acelera o lançamento.
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="mp-card" style={{ height: "fit-content" }}>
          <div className="mp-card-h">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>Avisos ativos</div>
              <span className="mp-chip">{activeCount} ativo(s)</span>
            </div>
            <div className="mp-help">{loading ? "Carregando..." : ""}</div>
          </div>

          <div className="mp-card-b" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activeCount === 0 ? (
              <div className="mp-help">Nenhum aviso ativo.</div>
            ) : (
              items.map((n) => {
                const acked = Boolean(n.acked);
                return (
                  <div key={n.id} className="mp-card" style={{ background: "rgba(255,255,255,.03)" }}>
                    <div className="mp-card-h">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{ fontWeight: 950, letterSpacing: ".2px" }}>{n.title}</div>
                        <div className="mp-help">
                          {fmtTs(n.created_at)}{n.created_by_name ? ` · por ${n.created_by_name}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        {acked ? (
                          <span className="mp-chip">Lido</span>
                        ) : (
                          <span
                            className="mp-chip"
                            style={{ background: "rgba(251,113,133,.12)", borderColor: "rgba(251,113,133,.25)", color: "rgba(254,205,211,.95)" }}
                          >
                            Pendente
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mp-card-b">
                      <div style={{ whiteSpace: "pre-wrap", color: "rgba(255,255,255,.88)", lineHeight: 1.45 }}>
                        {n.message}
                      </div>

                      <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {!acked && (
                          <button className="mp-btn mp-btn-primary" onClick={() => ackNotice(n.id)} disabled={loading}>
                            Confirmar leitura
                          </button>
                        )}
                        {isSupervisor && (
                          <button className="mp-btn mp-btn-danger" onClick={() => closeNotice(n.id)} disabled={loading}>
                            Encerrar aviso
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
