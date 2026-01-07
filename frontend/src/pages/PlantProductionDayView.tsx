import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";

/* ===================== helpers ===================== */
function isoTodayLocal(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function br(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function parseBRNumber(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;
  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function fmtBR0(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}
function fmtBR1(n: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}
function periodShort(p: string) {
  const [a, b] = p.split("-");
  return `${(a || "").slice(0, 2)}-${(b || "").slice(0, 2)}`;
}
function makePeriods24(): string[] {
  const res: string[] = [];
  for (let h = 0; h < 24; h++) {
    const h2 = (h + 1) % 24;
    const a = String(h).padStart(2, "0") + ":00";
    const b = String(h2).padStart(2, "0") + ":00";
    res.push(`${a}-${b}`);
  }
  return res;
}

/* ===================== api ===================== */
const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): Record<string, string> {
  const keys = ["mp_token", "token", "access_token", "auth_token"];
  for (const k of keys) {
    const v = (localStorage.getItem(k) || "").trim();
    if (v) return { Authorization: `Bearer ${v}` };
  }
  return {};
}

function devHeaders(): Record<string, string> {
  const devKey = (localStorage.getItem("mp_dev_key") || "").trim();
  return devKey ? { "X-Dev-Key": devKey } : {};
}

async function readErr(r: Response) {
  const t = await r.text().catch(() => "");
  if (!t) return `HTTP ${r.status}`;
  try {
    const j = JSON.parse(t);
    if (j?.detail) return typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    return JSON.stringify(j);
  } catch {
    return t;
  }
}

async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!r.ok) throw new Error(await readErr(r));
  return (await r.json()) as T;
}

async function apiPutDev<T>(path: string, body: any): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { ...authHeaders(), ...devHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await readErr(r));
  return (await r.json()) as T;
}

/* ===================== types ===================== */
type PlantHourRow = { period: string; ton?: any; freq?: any };
type PlantDayPayload = { day: string; obs?: string | null; rows: PlantHourRow[]; updated_at?: string | null };

/* ===================== component (DEV) ===================== */
export default function PlantProductionDayView() {
  const periods = useMemo(() => makePeriods24(), []);
  const [day, setDay] = useState<string>(isoTodayLocal());

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [server, setServer] = useState<PlantDayPayload | null>(null);

  // editor
  const [obs, setObs] = useState<string>("");
  const [rows, setRows] = useState<PlantHourRow[]>(periods.map((p) => ({ period: p, ton: "", freq: "" })));

  function normalizeRows(inRows: PlantHourRow[]): PlantHourRow[] {
    const map: Record<string, PlantHourRow> = {};
    for (const r of inRows || []) map[r.period] = r;

    return periods.map((p) => ({
      period: p,
      ton: map[p]?.ton ?? "",
      freq: map[p]?.freq ?? "",
    }));
  }

  async function loadDay() {
    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      const data = await apiGet<PlantDayPayload>(`/api/plant-production/${encodeURIComponent(day)}`).catch(() => {
        return { day, obs: "", rows: [], updated_at: null } as PlantDayPayload;
      });

      setServer(data);
      setObs(data?.obs ?? "");
      setRows(normalizeRows(data?.rows || []));
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar produção do dia (DEV)");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const totalTon = useMemo(() => {
    let s = 0;
    for (const r of rows) s += parseBRNumber(r.ton);
    return s;
  }, [rows]);

  const chartData = useMemo(() => {
    return rows.map((r) => {
      const ton = parseBRNumber(r.ton);
      const freq = parseBRNumber(r.freq);
      return {
        period: r.period,
        periodShort: periodShort(r.period),
        ton,
        tonLabel: ton > 0 ? fmtBR1(ton) : "",
        freq,
        freqLabel: freq > 0 ? `${fmtBR0(freq)}%` : "",
      };
    });
  }, [rows]);

  const chunks = useMemo(() => {
    return [rows.slice(0, 8), rows.slice(8, 16), rows.slice(16, 24)];
  }, [rows]);

  async function saveDev() {
    setErr(null);
    setInfo(null);

    try {
      setSaving(true);

      const body = {
        obs: obs ?? "",
        rows: rows.map((r) => ({
          period: r.period,
          ton: (() => {
            const n = parseBRNumber(r.ton);
            return Number.isFinite(n) ? n : null;
          })(),
          freq: (() => {
            const n = parseBRNumber(r.freq);
            return Number.isFinite(n) ? n : null;
          })(),
        })),
      };

      await apiPutDev(`/api/plant-production/${encodeURIComponent(day)}`, body);
      setInfo("Salvo (DEV) com sucesso.");
      await loadDay();
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar (DEV)");
    } finally {
      setSaving(false);
    }
  }

  function setCell(idx: number, key: "ton" | "freq", value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  return (
    <div className="mp-container">
      <div className="mp-grid">
        <div className="mp-col-12">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mp-chip">DEV</div>
              <div className="mp-page-title">PlantProductionDayView (DEV)</div>
              <div className="mp-page-sub">
                Editável qualquer dia • Dia {br(day)} • Total: <b>{fmtBR0(totalTon)}</b> t
                {server?.updated_at ? ` • Atualizado: ${new Date(server.updated_at).toLocaleString("pt-BR")}` : ""}
              </div>
            </div>

            <div className="mp-row">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="mp-help" style={{ fontWeight: 800 }}>
                  Data
                </span>
                <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 170 }} />
              </div>

              <button className="mp-btn" onClick={loadDay} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </button>

              <button className="mp-btn mp-btn-primary" onClick={saveDev} disabled={saving}>
                {saving ? "Salvando..." : "Salvar (DEV)"}
              </button>
            </div>
          </div>

          {err && <div style={{ color: "#f87171", fontWeight: 900, marginTop: 10 }}>{err}</div>}
          {info && <div style={{ color: "#34d399", fontWeight: 900, marginTop: 10 }}>{info}</div>}

          <div className="mp-help" style={{ marginTop: 8 }}>
            Para funcionar, defina a chave no navegador:
            <span style={{ fontWeight: 900 }}> localStorage.setItem("mp_dev_key","SUA_DEV_KEY")</span>
          </div>
        </div>

        {/* CHART */}
        <div className="mp-col-12">
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Gráfico (Ton/H)</b>
              <span className="mp-help">DEV</span>
            </div>

            <div className="mp-card-b" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 22, right: 16, left: 0, bottom: 6 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="periodShort" tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: any, name: any) => {
                      if (name === "ton") return [`${fmtBR1(Number(v) || 0)}`, "Ton/H"];
                      if (name === "freq") return [`${fmtBR0(Number(v) || 0)}%`, "Freq%"];
                      return [String(v), String(name)];
                    }}
                    contentStyle={{
                      background: "rgba(0,0,0,0.86)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14,
                      boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.86)", fontWeight: 900 }}
                  />

                  <Bar yAxisId="ton" dataKey="ton" name="Ton/H" fill="#ff9f1a" radius={[10, 10, 0, 0]}>
                    <LabelList
                      dataKey="tonLabel"
                      position="top"
                      offset={12}
                      fill="rgba(255,255,255,0.92)"
                      fontSize={12}
                      fontWeight={900}
                      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.70)", strokeWidth: 3 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* OBS */}
        <div className="mp-col-12">
          <div className="mp-card">
            <div className="mp-card-h">
              <b>Observação do dia</b>
              <span className="mp-help">DEV</span>
            </div>
            <div className="mp-card-b">
              <textarea
                className="mp-textarea"
                value={obs ?? ""}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Ex.: chuva, manutenção, falta de energia, etc."
                style={{ minHeight: 100 }}
              />
            </div>
          </div>
        </div>

        {/* TABLE EDITOR (3 colunas) */}
        <div className="mp-col-12">
          <div className="mp-help" style={{ marginBottom: 10 }}>
            DEV: edite qualquer dia/horário.
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(260px, 1fr))",
              gap: 12,
              overflowX: "auto",
              paddingBottom: 2,
            }}
          >
            {chunks.map((rows8, colIdx) => (
              <div key={colIdx} className="mp-card" style={{ margin: 0 }}>
                <div className="mp-card-h" style={{ padding: "10px 12px" }}>
                  <b>{colIdx === 0 ? "00–08" : colIdx === 1 ? "08–16" : "16–24"}</b>
                  <span className="mp-help">8 faixas</span>
                </div>

                <div className="mp-card-b" style={{ padding: 12 }}>
                  <table className="mp-table" style={{ width: "100%", minWidth: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 78 }}>Hora</th>
                        <th style={{ width: 110 }}>Ton/H</th>
                        <th style={{ width: 120 }}>Freq %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows8.map((r) => {
                        const idx = rows.findIndex((x) => x.period === r.period);
                        return (
                          <tr key={r.period}>
                            <td style={{ color: "rgba(255,255,255,0.90)", fontWeight: 900 }}>{periodShort(r.period)}</td>

                            <td>
                              <input
                                className="mp-input"
                                value={r.ton ?? ""}
                                onChange={(e) => setCell(idx, "ton", e.target.value)}
                                placeholder="ex: 320"
                              />
                            </td>

                            <td>
                              <input
                                className="mp-input"
                                value={r.freq ?? ""}
                                onChange={(e) => setCell(idx, "freq", e.target.value)}
                                placeholder="ex: 85"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
