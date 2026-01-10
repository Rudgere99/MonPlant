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

  return (
    <div style={{ padding: 18 }}>
      <div className="mp-card">
        <div className="mp-card-h">
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>DEV • Logs</div>
            <div className="mp-help">Registra login, salvamentos, alterações e exclusões.</div>
          </div>
          <button className="mp-btn" onClick={load} disabled={loading}>
            Atualizar
          </button>
        </div>

        <div className="mp-card-b">
          {err && <div className="mp-error">{err}</div>}

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr style={{ opacity: 0.85 }}>
                  <th style={{ textAlign: "left", padding: 10 }}>Quando</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Usuário</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Ação</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Entidade</th>
                  <th style={{ textAlign: "left", padding: 10 }}>ID</th>
                  <th style={{ textAlign: "left", padding: 10 }}>IP</th>
                  <th style={{ textAlign: "left", padding: 10 }}>Payload</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    <td style={{ padding: 10, whiteSpace: "nowrap", opacity: 0.85 }}>{l.created_at || "-"}</td>
                    <td style={{ padding: 10 }}>
                      <div style={{ fontWeight: 800 }}>{l.user_name || l.user_id || "-"}</div>
                      <div className="mp-help">{l.user_type || ""}</div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <span className="mp-chip">{l.action}</span>
                    </td>
                    <td style={{ padding: 10 }}>{l.entity || "-"}</td>
                    <td style={{ padding: 10 }}>{l.entity_id || "-"}</td>
                    <td style={{ padding: 10 }}>{l.ip || "-"}</td>
                    <td style={{ padding: 10, maxWidth: 520 }}>
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          opacity: 0.85,
                          fontSize: 12,
                        }}
                      >
                        {l.payload ? JSON.stringify(l.payload, null, 2) : "-"}
                      </pre>
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td colSpan={7} style={{ padding: 10, opacity: 0.7 }}>
                      Sem logs.
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
