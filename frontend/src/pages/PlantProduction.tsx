import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
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

/**
 * ✅ NOVA REGRA (mantém o bloqueio retroativo, mas libera a ÚLTIMA hora na virada):
 * - Dia anterior é retroativo e fica bloqueado
 * - EXCEÇÃO: se for ONTEM e estiver entre 00:00 e 00:59, libera editar
 */
function isRetroDay(dayISO: string): boolean {
  const today = isoTodayLocal();
  if (dayISO >= today) return false;

  // ontem (YYYY-MM-DD) no horário local do navegador
  const now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);

  const yISO =
    y.getFullYear() +
    "-" +
    String(y.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(y.getDate()).padStart(2, "0");

  // ✅ liberado na virada (00:00–00:59) para lançar 23:00–00:00
  if (dayISO === yISO && now.getHours() === 0) return false;

  return true;
}

function fmtBR(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n);
}
function fmtPct0(n: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(n);
}

function parseBRNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  let s = String(v).trim();
  if (!s) return null;

  s = s.replace("%", "").trim();
  s = s.replace(/\s/g, "");

  // "1.234,5" -> "1234.5"
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

function periodShort(p: string) {
  const [a, b] = p.split("-");
  return `${(a || "").slice(0, 2)}-${(b || "").slice(0, 2)}`;
}

type PlantHourRow = {
  period: string;
  ton?: string | number | null;
  freq?: string | number | null;
};

type PlantDayPayload = {
  day: string;
  obs?: string | null;
  rows: PlantHourRow[];
  updated_at?: string | null;
};

/* ===================== auth / api ===================== */

const API_BASE = (import.meta as any).env?.VITE_API_BASE || "http://127.0.0.1:8000";

function authHeaders(): HeadersInit {
  const t = (localStorage.getItem("mp_token") || "").trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ===================== recharts labels ===================== */

const TonLabel = (props: any) => {
  const { x, y, width, value } = props;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 80) return null;

  return (
    <text
      x={x + width / 2}
      y={y - 8}
      textAnchor="middle"
      fill="rgba(255,255,255,0.94)"
      fontSize={11}
      fontWeight={900}
      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 3 }}
    >
      {fmtBR(n)}
    </text>
  );
};

const FreqLabel = (props: any) => {
  const { x, y, index, value, payload } = props;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (payload?.freq === null || payload?.freq === undefined) return null;

  const bump = index % 2 === 0 ? -12 : -20;

  return (
    <text
      x={x}
      y={y + bump}
      textAnchor="middle"
      fill="rgba(255,255,255,0.94)"
      fontSize={11}
      fontWeight={900}
      style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.70)", strokeWidth: 4 }}
    >
      {fmtPct0(n)}%
    </text>
  );
};

const CustomTick = (props: any) => {
  const { x, y, payload } = props;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={14}
        textAnchor="middle"
        fill="rgba(255,255,255,0.75)"
        fontSize={12}
        fontWeight={700}
      >
        {periodShort(String(payload.value || ""))}
      </text>
    </g>
  );
};

/* ===================== component ===================== */

export default function PlantProduction() {
  const periods = useMemo(() => makePeriods24(), []);

  const [day, setDay] = useState<string>(isoTodayLocal());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [payload, setPayload] = useState<PlantDayPayload>(() => ({
    day: isoTodayLocal(),
    obs: "",
    rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
    updated_at: null,
  }));

  const retro = isRetroDay(day);

  function normalizeRows(rows: PlantHourRow[]): PlantHourRow[] {
    const map: Record<string, PlantHourRow> = {};
    for (const r of rows || []) map[r.period] = r;

    return periods.map((p) => ({
      period: p,
      ton: map[p]?.ton ?? "",
      freq: map[p]?.freq ?? "",
    }));
  }

  async function loadDay(d: string) {
    setLoading(true);
    setErr(null);
    setInfo(null);

    try {
      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(d)}`, {
        headers: authHeaders(),
      });

      if (r.status === 404) {
        setPayload({
          day: d,
          obs: "",
          rows: periods.map((p) => ({ period: p, ton: "", freq: "" })),
          updated_at: null,
        });
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      const data = (await r.json()) as PlantDayPayload;

      setPayload({
        day: d,
        obs: data.obs ?? "",
        rows: normalizeRows(data.rows || []),
        updated_at: data.updated_at ?? null,
      });
    } catch (e: any) {
      setErr(e?.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  async function saveDay() {
    setSaving(true);
    setErr(null);
    setInfo(null);

    try {
      const body = {
        obs: payload.obs ?? "",
        rows: payload.rows.map((r) => ({
          period: r.period,
          ton: parseBRNumber(r.ton),
          freq: parseBRNumber(r.freq),
        })),
      };

      const r = await fetch(`${API_BASE}/api/plant-production/${encodeURIComponent(day)}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (r.status === 403) {
        setErr("Retroativo não pode ser editado.");
        return;
      }

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(t || `HTTP ${r.status}`);
      }

      setInfo("Salvo com sucesso.");
      await loadDay(day);
    } catch (e: any) {
      setErr(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  const chartData = useMemo(() => {
    const map: Record<string, { ton: number | null; freq: number | null }> = {};
    for (const p of periods) map[p] = { ton: null, freq: null };

    for (const r of payload.rows || []) {
      const ton = parseBRNumber(r.ton);
      const freq = parseBRNumber(r.freq);
      map[r.period] = {
        ton: ton === null ? null : Math.max(0, ton),
        freq: freq === null ? null : Math.max(0, Math.min(100, freq)),
      };
    }

    return periods.map((p) => ({ period: p, ton: map[p].ton, freq: map[p].freq }));
  }, [payload.rows, periods]);

  const totalTon = useMemo(() => {
    let s = 0;
    for (const r of chartData) if (typeof r.ton === "number") s += r.ton;
    return s;
  }, [chartData]);

  const [yy, mm, dd] = day.split("-");
  const dayBR = `${dd}/${mm}/${yy}`;

  const chunks = useMemo(() => {
    return [payload.rows.slice(0, 8), payload.rows.slice(8, 16), payload.rows.slice(16, 24)];
  }, [payload.rows]);

  return (
    <div className="mp-container">
      <div className="mp-page-title">Produção do dia</div>
      <div className="mp-page-sub">Evolução horária • {dayBR}</div>

      <div className="mp-card" style={{ marginTop: 12 }}>
        {/* header */}
        <div className="mp-card-h" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <b>Produção por hora (Ton/H + Frequência)</b>

            <div className="mp-help">
              {loading
                ? "Carregando..."
                : err
                ? `Erro: ${err}`
                : info
                ? info
                : payload?.updated_at
                ? `Atualizado: ${payload.updated_at}`
                : "—"}
            </div>

            <div className="mp-help" style={{ marginTop: 6 }}>
              Total do dia (soma Ton/H): <b>{fmtBR(totalTon)}</b>
              {retro ? (
                <span style={{ marginLeft: 10, color: "rgba(245,158,11,0.95)", fontWeight: 800 }}>
                  (Retroativo bloqueado — exceto 00:00–00:59 p/ lançar 23:00–00:00)
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <div className="mp-label">Data</div>
            <input className="mp-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>

          <button
            className="mp-btn"
            onClick={saveDay}
            disabled={saving || loading || retro}
            title={retro ? "Retroativo não pode ser editado" : "Salvar produção do dia"}
            style={{ minWidth: 140 }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

          {/* PRODUÇÃO HORÁRIA */}
          <div style={{ ...cardBase, padding: 14, cursor: "pointer" }} onClick={() => nav("/plant-production")}>
            <div style={headerStyle}>
              <div>
                <div style={titleStyle}>Produção por hora (Ton/H + Frequência)</div>
                <div style={subStyle}>
                  Total do dia: <b style={{ color: "rgba(255,255,255,0.88)" }}>{fmtBR0(totalTonDay)}</b> t
                </div>
              </div>
              <span style={{ ...smallPill, borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)" }}>
                {prodDay?.updated_at ? "Atualizado" : "—"}
              </span>
            </div>

            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlySeries} margin={{ top: 16, right: 26, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                  <XAxis dataKey="period" interval={1} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 11 }} />
                  <YAxis yAxisId="left" tickFormatter={(v) => fmtBR0(Number(v) || 0)} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${fmtBR0(Number(v) || 0)}%`} tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }} />
                  <Tooltip
                    formatter={(v: any, name: any) => (name === "freq" ? `${fmtBR0(Number(v) || 0)}%` : fmtBR1(Number(v) || 0))}
                    contentStyle={{
                      background: "rgba(0,0,0,0.86)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14,
                      boxShadow: "0 18px 50px rgba(0,0,0,0.65)",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.86)" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={30}
                    iconType="circle"
                    formatter={(value) => (value === "freq" ? "Frequência (%)" : value === "ton" ? "Ton/H" : value)}
                    wrapperStyle={{ color: "#00CCFF", fontWeight: 900 }}
                  />
                  <Bar yAxisId="left" dataKey="ton" fill="#00CCFF" radius={[10, 10, 0, 0]} maxBarSize={38}>
                    <LabelList dataKey="ton" content={BarValueLabel} />
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="freq" stroke="#ff9f1a" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="freq" content={FreqPointLabel} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>


          {/* observação */}
          <div style={{ marginTop: 14 }}>
            <div className="mp-label">Observação do dia</div>
            <textarea
              className="mp-textarea"
              value={payload.obs ?? ""}
              disabled={retro}
              onChange={(e) => setPayload((p) => ({ ...p, obs: e.target.value }))}
              placeholder="Ex.: chuva, manutenção, falta de energia, etc."
              style={{ minHeight: 90 }}
            />
          </div>

          {/* edição em 3 colunas */}
          <div style={{ marginTop: 14 }}>
            <div className="mp-help">
              Edite Ton/H e Frequência (%) e clique em <b>Salvar</b>. Valores vazios ficam como <b>sem dado</b>.
            </div>

            <div
              style={{
                marginTop: 10,
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
                    <div className="mp-help">8 faixas horárias</div>
                  </div>

                  <div className="mp-card-b" style={{ padding: 12 }}>
                    <table className="mp-table" style={{ width: "100%", minWidth: 0 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 84 }}>Hora</th>
                          <th style={{ width: 110 }}>Ton/H</th>
                          <th style={{ width: 130 }}>Freq (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows8.map((r) => {
                          const globalIdx = payload.rows.findIndex((x) => x.period === r.period);

                          return (
                            <tr key={r.period}>
                              <td style={{ color: "rgba(255,255,255,0.85)", fontWeight: 800 }}>
                                {periodShort(r.period)}
                              </td>

                              <td>
                                <input
                                  className="mp-input"
                                  value={r.ton ?? ""}
                                  disabled={retro}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPayload((p) => {
                                      const rows = [...p.rows];
                                      rows[globalIdx] = { ...rows[globalIdx], ton: v };
                                      return { ...p, rows };
                                    });
                                  }}
                                  placeholder="ex: 320"
                                />
                              </td>

                              <td>
                                <input
                                  className="mp-input"
                                  value={r.freq ?? ""}
                                  disabled={retro}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPayload((p) => {
                                      const rows = [...p.rows];
                                      rows[globalIdx] = { ...rows[globalIdx], freq: v };
                                      return { ...p, rows };
                                    });
                                  }}
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

          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}
