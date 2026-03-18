import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";

type LogRow = {
  id: number;
  user_id: string | null;
  user_name?: string | null;
  user_type?: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  ip: string | null;
  user_agent: string | null;
  payload: any;
  created_at: string | null;
};

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

async function readErr(res: Response) {
  try {
    const j = await res.json();
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    const t = await res.text().catch(() => "");
    return t || `HTTP ${res.status}`;
  }
}

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("pt-BR");
}

function getActionTone(action?: string) {
  const a = String(action || "").toLowerCase();

  if (a.includes("delete") || a.includes("remove") || a.includes("exclu")) {
    return {
      bg: "rgba(239,68,68,.14)",
      bd: "rgba(239,68,68,.28)",
      color: "#fca5a5",
      label: "Exclusão",
    };
  }

  if (a.includes("create") || a.includes("insert") || a.includes("novo") || a.includes("cad")) {
    return {
      bg: "rgba(34,197,94,.14)",
      bd: "rgba(34,197,94,.28)",
      color: "#86efac",
      label: "Criação",
    };
  }

  if (a.includes("update") || a.includes("edit") || a.includes("alter")) {
    return {
      bg: "rgba(59,130,246,.14)",
      bd: "rgba(59,130,246,.28)",
      color: "#93c5fd",
      label: "Alteração",
    };
  }

  if (a.includes("login") || a.includes("auth")) {
    return {
      bg: "rgba(168,85,247,.14)",
      bd: "rgba(168,85,247,.28)",
      color: "#d8b4fe",
      label: "Acesso",
    };
  }

  return {
    bg: "rgba(148,163,184,.12)",
    bd: "rgba(148,163,184,.2)",
    color: "#cbd5e1",
    label: action || "Evento",
  };
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
        borderRadius: 18,
        padding: 16,
        minHeight: 88,
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
      }}
    >
      <div style={{ fontSize: 12, color: "rgba(255,255,255,.58)", marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,.48)" }}>{sub}</div> : null}
    </div>
  );
}

export default function DevLogs() {
  const { token } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const headers = useMemo(() => {
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  async function load() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dev/logs?limit=500`, { headers });
      if (!res.ok) throw new Error(await readErr(res));
      setRows(await res.json());
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar logs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const acessos = rows.filter((r) => String(r.action || "").toLowerCase().includes("login")).length;
    const alteracoes = rows.filter((r) => {
      const a = String(r.action || "").toLowerCase();
      return a.includes("update") || a.includes("edit") || a.includes("alter");
    }).length;
    const exclusoes = rows.filter((r) => {
      const a = String(r.action || "").toLowerCase();
      return a.includes("delete") || a.includes("remove") || a.includes("exclu");
    }).length;

    return { total, acessos, alteracoes, exclusoes };
  }, [rows]);

  return (
    <div style={{ padding: 18 }}>
      <div
        className="mp-card"
        style={{
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.08)",
          background:
            "radial-gradient(circle at top right, rgba(59,130,246,.10), transparent 24%), linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))",
          boxShadow: "0 20px 60px rgba(0,0,0,.22)",
        }}
      >
        <div
          className="mp-card-h"
          style={{
            padding: "18px 18px 8px 18px",
            borderBottom: "1px solid rgba(255,255,255,.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>Logs do Sistema</div>
            <div style={{ marginTop: 4, color: "rgba(255,255,255,.58)", fontSize: 13 }}>
              Auditoria de acessos, alterações, salvamentos e exclusões do MonPlant.
            </div>
          </div>

          <button
            className="mp-btn"
            onClick={load}
            disabled={loading}
            style={{
              minWidth: 120,
              height: 40,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,.10)",
              background: loading ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.08)",
              fontWeight: 800,
            }}
          >
            {loading ? "Atualizando..." : "Atualizar"}
          </button>
        </div>

        <div className="mp-card-b" style={{ padding: 18 }}>
          {err && (
            <div
              className="mp-error"
              style={{
                marginBottom: 16,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,.25)",
                background: "rgba(239,68,68,.10)",
                padding: 12,
              }}
            >
              {err}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <StatCard title="Total de registros" value={stats.total} />
            <StatCard title="Acessos" value={stats.acessos} />
            <StatCard title="Alterações" value={stats.alteracoes} />
            <StatCard title="Exclusões" value={stats.exclusoes} />
          </div>

          <div
            style={{
              overflowX: "auto",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,.07)",
              background: "rgba(7,10,18,.45)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "separate",
                borderSpacing: 0,
                minWidth: 1180,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "rgba(255,255,255,.035)",
                  }}
                >
                  {["Quando", "Usuário", "Ação", "Entidade", "ID", "IP", "Payload"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "14px 14px",
                        fontSize: 12,
                        color: "rgba(255,255,255,.62)",
                        fontWeight: 800,
                        borderBottom: "1px solid rgba(255,255,255,.06)",
                        position: "sticky",
                        top: 0,
                        backdropFilter: "blur(8px)",
                        zIndex: 1,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((l, idx) => {
                  const tone = getActionTone(l.action);
                  return (
                    <tr
                      key={l.id}
                      style={{
                        background: idx % 2 === 0 ? "rgba(255,255,255,.012)" : "transparent",
                      }}
                    >
                      <td
                        style={{
                          padding: 14,
                          whiteSpace: "nowrap",
                          color: "rgba(255,255,255,.82)",
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        {fmtDate(l.created_at)}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        <div style={{ fontWeight: 800, color: "#fff" }}>{l.user_name || l.user_id || "-"}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,.48)", marginTop: 4 }}>
                          {l.user_type || "Sem perfil"}
                        </div>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                        }}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "7px 10px",
                            borderRadius: 999,
                            border: `1px solid ${tone.bd}`,
                            background: tone.bg,
                            color: tone.color,
                            fontSize: 12,
                            fontWeight: 800,
                            letterSpacing: 0.2,
                          }}
                        >
                          {tone.label}
                        </span>
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          color: "rgba(255,255,255,.86)",
                        }}
                      >
                        {l.entity || "-"}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          color: "rgba(255,255,255,.70)",
                          fontFamily: "monospace",
                          fontSize: 12,
                        }}
                      >
                        {l.entity_id || "-"}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          color: "rgba(255,255,255,.70)",
                          fontFamily: "monospace",
                          fontSize: 12,
                        }}
                      >
                        {l.ip || "-"}
                      </td>

                      <td
                        style={{
                          padding: 14,
                          borderBottom: "1px solid rgba(255,255,255,.05)",
                          verticalAlign: "top",
                          maxWidth: 460,
                        }}
                      >
                        <div
                          style={{
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,.07)",
                            background: "rgba(0,0,0,.22)",
                            padding: 10,
                          }}
                        >
                          <pre
                            style={{
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              color: "rgba(255,255,255,.78)",
                              fontSize: 12,
                              lineHeight: 1.45,
                              fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace",
                            }}
                          >
                            {l.payload ? JSON.stringify(l.payload, null, 2) : "-"}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!rows.length && !loading && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "rgba(255,255,255,.56)",
                      }}
                    >
                      Nenhum log encontrado.
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "rgba(255,255,255,.56)",
                      }}
                    >
                      Carregando logs...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
